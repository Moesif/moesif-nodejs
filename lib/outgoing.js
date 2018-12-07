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

  if (requestOptions && requestOptions.host && typeof requestOptions.host === 'string') {
    if (requestOptions.host.includes('moesif.net')) return true;
  }

  if (requestOptions && requestOptions.headers) {
    if (requestOptions.headers['X-Moesif-SDK'] || requestOptions.headers['X-Moesif-Application-Id'])
      return true;
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
  logger('track triggered on a request going to:');
  logger(requestOptions.host);

  if (isMoesif(request, requestOptions)) {
    logger('skip capturing requests to moesif itself');
    return;
  }

  var startTime = new Date();

  var originalRequestWrite = request.write;
  var requestBody = null;

  request.write = function(chunk, encoding, callback) {
    var writeReturnValue = originalRequestWrite.call(request, chunk, encoding, callback);
    requestBody = requestBody ? requestBody + chunk : '' + chunk;
    return writeReturnValue;
  };

  request.on('response', function(res) {
    var responseBody = null;

    res.on('data', function(d) {
      logger('outgoing data received');
      logger(d);
      responseBody = responseBody ? responseBody + d : d;
    });

    // only triggered when an event is aborted,
    // at this point, since "error" on request
    // isn't started. I need to count on this abort to
    // let me know the end point.
    res.on('abort', function() {
      logger('on abort is triggered in response');
      logger('raw responsebody from out going API call is');
      logger(responseBody);
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
      logger('raw responsebody from out going API call is');
      logger(responseBody);

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
  });


  // if req.abort() is called before request connection started.
  // 'error' on request is always triggered at somepoint.
  // but if req.abort() is called have response object already exists,
  // then "error" on request is not triggered.

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
    var request = originalRequest.call(http, options, ...requestArgs);
    if (!request._mo_tracked) {
      request._mo_tracked = true;
      track(options, request, recorder, logger);
    }
    return request;
  };

  https.request = function(options, ...requestArgs) {
    var request = originalHttpsRequest.call(https, options, ...requestArgs);
    if (!request._mo_tracked) {
      request._mo_tracked = true;
      track(options, request, recorder, logger);
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
