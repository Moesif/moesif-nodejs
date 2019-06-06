'use strict';

var url = require('url');
var hash = require('crypto-js/md5');
var isCreditCard = require('card-validator');
var assign = require('lodash/assign');

function logMessage(debug, functionName, message) {
  if (debug) {
    console.log('MOESIF: [' + functionName + '] ' + message);
  }
};

function _hashSensitive(jsonBody, debug) {
  if (jsonBody === null) return jsonBody;

  if (Array.isArray(jsonBody)) {
    return jsonBody.map(function (item) {
      var itemType = typeof item;

      if (itemType === 'number' || itemType === 'string') {
        var creditCardCheck = isCreditCard.number('' + item);
        if (creditCardCheck.isValid) {
          logMessage(debug, 'hashSensitive', 'looks like a credit card, performing hash.');
          return hash(item).toString();
        }
      }

      return _hashSensitive(item, debug);
    });
  }

  if (typeof jsonBody === 'object') {
    var returnObject = {};

    Object.keys(jsonBody).forEach(function (key) {
      var innerVal = jsonBody[key];
      var innerValType = typeof innerVal;

      if (key.toLowerCase().indexOf('password') !== -1 && typeof innerVal === 'string') {
        logMessage(debug, 'hashSensitive', 'key is password, so hashing the value.');
        returnObject[key] = hash(jsonBody[key]).toString();
      } else if (innerValType === 'number' || innerValType === 'string') {
        var creditCardCheck = isCreditCard.number('' + innerVal);
        if (creditCardCheck.isValid) {
          logMessage(debug, 'hashSensitive', 'a field looks like credit card, performing hash.');
          returnObject[key] = hash(jsonBody[key]).toString();
        } else {
          returnObject[key] = _hashSensitive(innerVal, debug);
        }
      } else {
        // recursive test for every value.
        returnObject[key] = _hashSensitive(innerVal, debug);
      }
    });

    return returnObject;
  }

  return jsonBody;
}

function _getUrlFromRequestOptions(options, request) {
  if (typeof options === 'string') {
    options = url.parse(options);
  } else {
    // Avoid modifying the original options object.
    let originalOptions = options;
    options = {};
    if (originalOptions) {
      Object.keys(originalOptions).forEach((key) => {
        options[key] = originalOptions[key];
      });
    }
  }

  // Oddly, url.format ignores path and only uses pathname and search,
  // so create them from the path, if path was specified
  if (options.path) {
    var parsedQuery = url.parse(options.path);
    options.pathname = parsedQuery.pathname;
    options.search = parsedQuery.search;
  }

  // Simiarly, url.format ignores hostname and port if host is specified,
  // even if host doesn't have the port, but http.request does not work
  // this way. It will use the port if one is not specified in host,
  // effectively treating host as hostname, but will use the port specified
  // in host if it exists.
  if (options.host && options.port) {
    // Force a protocol so it will parse the host as the host, not path.
    // It is discarded and not used, so it doesn't matter if it doesn't match
    var parsedHost = url.parse('http://' + options.host);
    if (!parsedHost.port && options.port) {
      options.hostname = options.host;
      delete options.host;
    }
  }

  // Mix in default values used by http.request and others
  options.protocol = options.protocol || (request.agent && request.agent.protocol) || undefined;
  options.hostname = options.hostname || 'localhost';

  return url.format(options);
}

function _bodyToBase64(body) {
  if (!body) {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('base64');
  } else if (typeof body === 'string') {
    return Buffer.from(body).toString('base64');
  } else if (typeof body.toString === 'function') {
    return Buffer.from(body.toString()).toString('base64');
  } else {
    return '';
  }
}


function _safeJsonParse(body) {
  try {
    if (!Buffer.isBuffer(body) &&
      (typeof body === 'object' || Array.isArray(body))) {
      return {
        body: body,
        transferEncoding: undefined
      }
    }
    return {
      body: JSON.parse(body.toString()),
      transferEncoding: undefined
    }
  } catch (e) {
    return {
      body: _bodyToBase64(body),
      transferEncoding: 'base64'
    }
  }
}


function _startWithJson(body) {

  var str;
  if (body && Buffer.isBuffer(body)) {
    str = body.slice(0, 1).toString('ascii');
  } else {
    str = body;
  }

  if (str && typeof str === 'string') {
    var newStr = str.trim();
    if (newStr.startsWith('{') || newStr.startsWith('[')) {
      return true;
    }
  }
  return true;
}

function _getEventModelFromRequestandResponse(
  requestOptions,
  request,
  requestTime,
  requestBody,
  response,
  responseTime,
  responseBody,
) {
  var logData = {};
  logData.request = {};

  logData.request.verb = typeof requestOptions === 'string' ? 'GET' : requestOptions.method || 'GET';
  logData.request.uri = _getUrlFromRequestOptions(requestOptions, request);
  logData.request.headers = requestOptions.headers || {};
  logData.request.time = requestTime;

  if (requestBody) {
    var isReqBodyMaybeJson = _startWithJson(requestBody);

    if (isReqBodyMaybeJson) {
      var parsedReqBody = _safeJsonParse(requestBody);

      logData.request.transferEncoding = parsedReqBody.transferEncoding;
      logData.request.body = parsedReqBody.body;
    } else {
      logData.request.transferEncoding = 'base64';
      logData.request.body = _bodyToBase64(requestBody);
    }
  }

  logData.response = {};
  logData.response.time = responseTime;
  logData.response.status = (response && response.statusCode) || 599;
  logData.response.headers = assign({}, (response && response.headers) || {});

  if (responseBody) {
    var isResBodyMaybeJson = _startWithJson(responseBody);

    if (isResBodyMaybeJson) {
      var parsedResBody = _safeJsonParse(responseBody);

      logData.response.transferEncoding = parsedResBody.transferEncoding;
      logData.response.body = parsedResBody.body;
    } else {
      logData.response.transferEncoding = 'base64';
      logData.response.body = _bodyToBase64(responseBody);
    }
  }

  return logData;
}

module.exports = {
  getUrlFromRequestOptions: _getUrlFromRequestOptions,
  getEventModelFromRequestandResponse: _getEventModelFromRequestandResponse,
  safeJsonParse: _safeJsonParse,
  startWithJson: _startWithJson,
  bodyToBase64: _bodyToBase64,
  hashSensitive: _hashSensitive
};
