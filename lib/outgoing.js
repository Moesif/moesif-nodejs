'use strict';

var http = require('http');
var https = require('https');
var dataUtils = require('./dataUtils');
var util = require('util');
var nodeUrl = require('url');

var searchParamsSymbol = nodeUrl.searchParamsSymbol;

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
  } else if (input && input[searchParamsSymbol] &&
             input[searchParamsSymbol][searchParamsSymbol]) {
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

/**
 * Builds a URL from request options, using the same logic as http.request(). This is
 * necessary because a ClientRequest object does not expose a url property.
 */

// In a successful request, the following events will be emitted in the following order:

// 'socket'
// 'response'

// 'data' any number of times, on the res object ('data' will not be emitted at all if the response body is empty, for instance, in most redirects)
// 'end' on the res object
// 'close'
// In the case of a connection error, the following events will be emitted:

// 'socket'
// 'error'
// 'close'
// If req.abort() is called before the connection succeeds, the following events will be emitted in the following order:

// 'socket'
// (req.abort() called here)
// 'abort'
// 'close'
// 'error' with an error with message 'Error: socket hang up' and code 'ECONNRESET'
// If req.abort() is called after the response is received, the following events will be emitted in the following order:

// 'socket'
// 'response'

// 'data' any number of times, on the res object
// (req.abort() called here)
// 'abort'
// 'close'

// 'aborted' on the res object
// 'end' on the res object
// 'close' on the res object
// Note that setting the timeout option or using the setTimeout() function will not abort the request or do anything besides add a 'timeout' event.


function track(requestOptions, request, recorder, logger) {
  if (isMoesif(request, requestOptions)) {
    logger('skip capturing requests to moesif itself');
    return;
  }

  if (typeof requestOptions === 'object'); {
    logger(util.inspect(requestOptions));
  }

  var startTime = new Date();
  var originalRequestWrite = request.write;
  var requestBody = null;
  var finished = false;

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
    logger("on response triggered in moesif");

    // const myStream = new PassThrough();
    var myStream = res;

    myStream._mo_on = myStream.on;

    myStream.on = function (evt, handler) {
      var passOnHandler = handler;
      logger("patched on" + evt);
      if (evt === "data" && !dataEventTracked) {
        logger("tracking outgoing response DataEvent");
        dataEventTracked = true;
        passOnHandler = function (chs) {
          logger("inside outgoing response Data handler " + chs);
          responseBody = appendChunk(responseBody, chs);
          // always update end time in case end event is not triggered.
          endTime = new Date();
          return handler(chs);
        };
      } else if (evt === "end" && !endEventTracked) {
        logger("tracking outgoing response EndEvent");
        endEventTracked = true;
        passOnHandler = function (chs) {
          logger("inside outgoing response End handler");
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
    logger('on error inside track is called', error);
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
