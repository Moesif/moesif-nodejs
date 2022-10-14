'use strict';

var http = require('http');
var https = require('https');
var dataUtils = require('./dataUtils');
var util = require('util');
var nodeUrl = require('url');

var getEventModelFromRequestAndResponse = dataUtils.getEventModelFromRequestAndResponse;
var appendChunk = dataUtils.appendChunk;

function isMoesif(request, requestOptions) {
  if (typeof requestOptions === 'string') {
    if(requestOptions.includes('moesif.net')) return true;
  }
  if (request && typeof request.getHeader === 'function') {
    if (request.getHeader('X-Moesif-SDK') || request.getHeader('X-Moesif-Application-Id'))
      return true;
  }

  if (requestOptions && requestOptions.host && typeof requestOptions.host === 'string') {
    if (requestOptions.host.includes('moesif.net')) return true;
  }

  if (requestOptions && requestOptions.headers) {
    if (requestOptions.headers['X-Moesif-SDK'] || requestOptions.headers['X-Moesif-Application-Id'])
      return true;
  }
  return false;
}

// based on https://github.com/nodejs/node/blob/0324529e0fa234b8102c1a6a1cde19c76a6fff82/lib/internal/url.js#L1406
function urlToHttpOptions(url) {
  const options = {
    protocol: url.protocol,
    hostname:
      typeof url.hostname === 'string' && url.hostname.indexOf('[') === 0
        ? url.hostname.slice(1, -1)
        : url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname || ""}${url.search || ""}`,
    href: url.href
  };
  if (url.port !== '') {
    options.port = Number(url.port);
  }
  if (url.username || url.password) {
    options.auth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
  }
  return options;
}


// handle these scenarios
// http.request(options)
// http.request(urlString, options);
// http.request(urlString); (simple get).
// http.request(URLObject, options);
// http.request(URLObject); (simple get).
// below is based on official nodejs code for http
function standardizeRequestOption(input, options, cb) {
  if (typeof input === 'string') {
    const urlStr = input;
    input = urlToHttpOptions(new nodeUrl.URL(urlStr));
  } else if (input instanceof nodeUrl.URL) {
    // url.URL instance
    input = urlToHttpOptions(input);
  } else {
    cb = options;
    options = input;
    input = null;
  }

  if (typeof options === 'function') {
    cb = options;
    options = input || {};
  } else {
    options = Object.assign(input || {}, options);
  }

  return options;
}

function track(requestOptions, request, recorder, logger) {
  if (isMoesif(request, requestOptions)) {
    logger('skip capturing requests to moesif itself');
    return;
  }

  var startTime = new Date();
  var originalRequestWrite = request.write;
  var requestBody = null;
  var finished = false;
  var debugString = requestOptions;
  if (typeof requestOptions === 'object' && requestOptions); {
    debugString = (requestOptions.hostname || requestOptions.host) + (requestOptions.path || requestOptions.pathname);
    logger('initiating capturing of outing ' + util.inspect(requestOptions));
  }

  request.write = function(chunk, encoding, callback) {
    var writeReturnValue = originalRequestWrite.call(request, chunk, encoding, callback);
    requestBody = requestBody ? requestBody + chunk : '' + chunk;
    return writeReturnValue;
  };

  request.on("response", function (res) {
    var responseBody = null;

    var endTime = new Date();
    var dataEventTracked = false;
    var endEventTracked = false;
    logger("on response triggered in moesif " + debugString);

    var myStream = res;

    myStream._mo_on = myStream.on;

    myStream.on = function (evt, handler) {
      var passOnHandler = handler;
      if (evt === "data" && !dataEventTracked) {
        logger("tracking outgoing response Data Event " + debugString);
        dataEventTracked = true;
        passOnHandler = function (chs) {
          logger("outgoing response Data handler received for " + debugString + " " + chs);
          responseBody = appendChunk(responseBody, chs);
          // always update end time in case end event is not triggered.
          endTime = new Date();
          return handler(chs);
        };
      } else if (evt === "end" && !endEventTracked) {
        logger("tracking outgoing response End event " + debugString);
        endEventTracked = true;
        passOnHandler = function (chs) {
          logger("outgoing response End handler" + debugString);
          endTime = new Date();

          if (!finished) {
            finished = true;
            recorder(
              getEventModelFromRequestAndResponse(
                requestOptions,
                request,
                startTime,
                requestBody,
                res,
                endTime,
                responseBody
              )
            );
          }

          return handler(chs);
        };
      }
      return myStream._mo_on(evt, passOnHandler);
    };
  });

  // if req.abort() is called before request connection started.
  // 'error' on request is always triggered at somepoint.
  // but if req.abort() is called have response object already exists,
  // then "error" on request is not triggered.

  request.on('error', function(error) {
    logger('on error for outgoing request ' + debugString, error);
    finished = true;
    var endTime = new Date();
    recorder(
      getEventModelFromRequestAndResponse(
        requestOptions,
        request,
        startTime,
        requestBody,
        null,
        endTime,
        null
      )
    );
  });

  // request.on('close', function() {
  //   logger('on close for outgoing request ' + debugString);
  // });

  // fail safe if not finished
  setTimeout(() => {
    if (!finished) {
      logger('outbound request longer than 2 second, timing out. log what we have.' + debugString);
      finished = true;
      var endTime = new Date();
      recorder(
        getEventModelFromRequestAndResponse(
          requestOptions,
          request,
          startTime,
          requestBody,
          null,
          endTime,
          null
        )
      );
    }
  }, 2000);
}

function _patch(recorder, logger, moesifOptions) {
  var originalGet = http.get;
  var originalHttpsGet = https.get;

  var originalRequest = http.request;
  var originalHttpsRequest = https.request;

  // On node >= v0.11.12 and < 9.0 (excluding 8.9.0) https.request just calls http.request (with additional options).
  // On node < 0.11.12, 8.9.0, and 9.0 > https.request is handled separately
  // Patch both and leave add a _mo_tracked flag to prevent double tracking.

  http.request = function(options, ...requestArgs) {
    var request = originalRequest.call(http, options, ...requestArgs);
    if (!request._mo_tracked) {
      request._mo_tracked = true;
      var requestOptions = standardizeRequestOption(options, ...requestArgs);
      track(requestOptions, request, recorder, logger, moesifOptions);
    }
    return request;
  };

  https.request = function(options, ...requestArgs) {
    var request = originalHttpsRequest.call(https, options, ...requestArgs);
    if (!request._mo_tracked) {
      request._mo_tracked = true;
      var requestOptions = standardizeRequestOption(options, ...requestArgs);
      track(requestOptions, request, recorder, logger, moesifOptions);
    }
    return request;
  };

  http.get = function(options, ...requestArgs) {
    var request = http.request.call(http, options, ...requestArgs);
    request.end();
    return request;
  };

  https.get = function(options, ...requestArgs) {
    var request = https.request.call(https, options, ...requestArgs);
    request.end();
    return request;
  };

  function _unpatch() {
    http.request = originalRequest;
    https.request = originalHttpsRequest;
    http.get = originalGet;
    https.get = originalHttpsGet;
  }

  return _unpatch;
}

module.exports = _patch;
