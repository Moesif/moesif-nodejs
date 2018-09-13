'use strict';

var http = require('http');
var https = require('https');

var dataUtils = require('./dataUtils');

var getEventModelFromRequestandResponse = dataUtils.getEventModelFromRequestandResponse;

function isMoesif(request, requestOptions) {
  if (typeof requestOptions === 'string') {
    if(requestOptions.includes('moesif.net')) return true;
  }
  if (request && typeof request.getHeader === 'function') {
    if (request.getHeader('X-Moesif-SDK') || request.getHeader('X-Moesif-Application-Id'))
      return true;
  }
  if (requestOptions && requestOptions.headers) {
    if (request.headers['X-Moesif-SDK'] || request.headers['X-Moesif-Application-Id'])
      return true;
  }
  if (requestOptions && requestOptions.host && typeof requestOptions.host === 'string') {
    if (requestOptions.host.includes('moesif.net')) return true;
  }

  return false;
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
  logger('track is called');
  logger(requestOptions.host);

  if (isMoesif(request, requestOptions)) {
    // skip
    return;
  }

  var startTime = new Date();
  // logger(startTime = new Date());

  // var originalRequestOptions = assign({}, requestOptions);

  // have to monkey patch the request write to capture the request body
  var originalRequestWrite = request.write;
  var requestBody = null;

  request.write = function(chunk, encoding, callback) {
    var writeReturnValue = originalRequestWrite.call(request, chunk, encoding, callback);
    requestBody = requestBody ? requestBody + chunk : '' + chunk;
    return writeReturnValue;
  };

  request.on('response', function(res) {
    logger('on response inside track is called, status is');
    // logger(res.body);
    logger(res.statusCode);
    var responseBody = null;

    res.on('data', function(d) {
      responseBody = responseBody ? responseBody + d : '' + d;
    });

    // only triggered when an event is aborted,
    // at this point, since "error" on request
    // isn't started. I need to count on this abort to
    // let me know the end point.
    res.on('abort', function() {
      logger('on abort is triggered in response');
      recorder(
        getEventModelFromRequestandResponse(
          requestOptions,
          request,
          startTime,
          requestBody,
          res,
          endTime,
          responseBody
        )
      );
    });

    res.on('end', function() {
      var endTime = new Date();
      console.log('on end of response inside the patch is called');

      recorder(
        getEventModelFromRequestandResponse(
          requestOptions,
          request,
          startTime,
          requestBody,
          res,
          endTime,
          responseBody
        )
      );
    });

    // only triggered when an event is aborted.
    // so don not need to do anything here.
    // since in case of abort, we'll let reqest.abort take care of it.
    // res.on('close', function() {
    // });
  });

  // request.on('abort', function() {
  //   logger('abort on request is called');
  //   logger(JSON.stringify(error));
  // });

  // logic is this:
  // if req.abort() is called before request connection started.
  // 'error' on request is always triggered at somepoint.
  // but if req.abort() is called have response object already exists,
  // then "error" on request is not triggered.

  // so I can assume if request error is triggered.
  // this is a end point.

  request.on('error', function(error) {
    logger('on error inside track is called');
    logger(JSON.stringify(error));
    var endTime = new Date();

    recorder(
      getEventModelFromRequestandResponse(
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

  // does not seem there is any sceario that I need to handle here.
  // since above cases seems to cover all sencearios where request is finished.
  // request.on('close', function() {
  // });
}

function _patch(recorder, logger) {
  var originalGet = http.get;
  var originalHttpsGet = https.get;

  var originalRequest = http.request;
  var originalHttpsRequest = https.request;

  // On node >= v0.11.12 and < 9.0 (excluding 8.9.0) https.request just calls http.request (with additional options).
  // On node < 0.11.12, 8.9.0, and 9.0 > https.request is handled separately
  // Patch both and leave add a _mo_tracked flag to prevent double tracking.

  http.request = function(options, ...requestArgs) {
    logger('http no-s request patched is calledd');
    var request = originalRequest.call(http, options, ...requestArgs);
    if (!request._mo_tracked) {
      request._mo_tracked = true;
      track(options, request, recorder, logger);
    }
    return request;
  };

  https.request = function(options, ...requestArgs) {
    logger('https request patched is calledd');
    var request = originalHttpsRequest.call(https, options, ...requestArgs);
    if (!request._mo_tracked) {
      request._mo_tracked = true;
      track(options, request, recorder, logger);
    }
    logger('returning https request');
    return request;
  };

  http.get = function(options, ...requestArgs) {
    logger('http no-s get patched is calledd');
    var request = http.request.call(http, options, ...requestArgs);
    request.end();
    return request;
  };

  https.get = function(options, ...requestArgs) {
    logger('https get patched is calledd');
    var request = https.request.call(https, options, ...requestArgs);
    logger('I have the request');
    request.end();
    return request;
  };

  function _unpatch() {
    http.request = originalRequest;
    åhttps.request = originalHttpsRequest;
    http.get = originalGet;
    https.get = originalHttpsGet;
  }

  return _unpatch;
}

module.exports = _patch;
