'use strict';

var url = require('url');
var hash = require('crypto-js/md5');
var isCreditCard = require('card-validator');
var assign = require('lodash/assign');
var zlib = require('zlib');
// Helper to check if buffer is binary (not utf8 string)
function isBinaryBuffer(buf) {
  if (!Buffer.isBuffer(buf)) return false;
  // Heuristic: if buffer contains non-printable characters, treat as binary
  var text = buf.toString('utf8');
  // If conversion to string produces replacement chars, it's likely binary
  return text.includes('\uFFFD') || /[\x00-\x08\x0E-\x1F]/.test(text);
}

// Decompress if needed based on headers and heuristics
function decompressIfNeeded(body, headers) {
  if (!body) return body;
  var buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  var encoding = (headers && (headers['content-encoding'] || headers['Content-Encoding'])) || '';
  var server = (headers && (headers['server'] || headers['Server'])) || '';
  var contentType = (headers && (headers['content-type'] || headers['Content-Type'])) || '';
  var decompressed = null;
  var isBinary = isBinaryBuffer(buf);

  // Only decompress if content-type is json, xml, or text
  var isTextType = false;
  if (contentType) {
    var ct = contentType.toLowerCase();
    if (ct.indexOf('json') !== -1 || ct.indexOf('xml') !== -1 || ct.indexOf('text') !== -1) {
      isTextType = true;
    }
  }
  if (!isTextType) {
    // Not a text type, skip decompression
    return body;
  }

  try {
    if (encoding && isBinary) {
      if (encoding.indexOf('gzip') !== -1) {
        decompressed = zlib.gunzipSync(buf);
      } else if (encoding.indexOf('deflate') !== -1) {
        decompressed = zlib.inflateSync(buf);
      } else if (encoding.indexOf('br') !== -1) {
        decompressed = zlib.brotliDecompressSync(buf);
      }
    } else if (isBinary) {
      // Heuristic: try brotli if server is cloudflare
      if (server.toLowerCase().indexOf('cloudflare') !== -1) {
        try {
          decompressed = zlib.brotliDecompressSync(buf);
        } catch (e) {
          // fallback below
        }
      }
      // Try gzip as fallback
      if (!decompressed) {
        try {
          decompressed = zlib.gunzipSync(buf);
        } catch (e) {}
      }
      // Try deflate as fallback
      if (!decompressed) {
        try {
          decompressed = zlib.inflateSync(buf);
        } catch (e) {}
      }
      // As last resort, try brotli if not already tried
      if (!decompressed && server.toLowerCase().indexOf('cloudflare') === -1) {
        try {
          decompressed = zlib.brotliDecompressSync(buf);
        } catch (e) {
          // fallback below
        }
      }
    }
    if (decompressed) {
      // Try to return as string if possible
      return decompressed.toString('utf8');
    }
  } catch (err) {
    // fallback below
  }
  // If not decompressed, return original
  return body;
}

var logMessage = function (debug, functionName, message, details) {
  if (debug) {
    var finalMessage = message;
    try {
      if (details && debug !== 'instrumentation') {
        if (Buffer.isBuffer(details) || typeof details === 'string') {
          finalMessage = message + '\n' + details;
        } else if (details.stack && details.message) {
          finalMessage = message + '\n' + details.stack;
        } else if (typeof details === 'object') {
          finalMessage = message + '\n' + JSON.stringify(details);
        }
      }
    } catch (err) {}
    console.log('MOESIF: [' + functionName + '] ' + finalMessage);
  }
};

var timeTookInSeconds = function (startTime, endTime) {
  return (endTime - startTime) / 1000.0 + ' seconds';
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
    var originalOptions = options;
    options = {};
    if (originalOptions) {
      Object.keys(originalOptions).forEach(function (key) {
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

function isPlainObject(value) {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }
  var prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function isPlainObjectOrPrimitive(value) {
  if (isPlainObject(value)) {
    return true;
  }
  var type = typeof value;
  return (
    type === 'number' ||
    type === 'boolean' ||
    type === 'string' ||
    value === null ||
    value === undefined
  );
}

function _safeJsonParse(body) {
  try {
    var type = typeof body;
    if (!Buffer.isBuffer(body) && type === 'object') {
      if (isPlainObject(body)) {
        return {
          body: body,
          transferEncoding: undefined,
        };
      }
      if (Array.isArray(body) && body.every && body.every(isPlainObjectOrPrimitive)) {
        return {
          body: body,
          transferEncoding: undefined,
        };
      }

      // in case of non POJO
      return {
        body: JSON.parse(JSON.stringify(body)),
        transferEncoding: undefined,
      };
    }

    return {
      body: JSON.parse(body.toString()),
      transferEncoding: undefined,
    };
  } catch (e) {
    return {
      body: _bodyToBase64(body),
      transferEncoding: 'base64',
    };
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

function getRequestHeaders(requestOptions, request) {
  if (request && request.getHeaders) {
    return request.getHeaders();
  }
  if (requestOptions.headers) {
    return requestOptions.headers;
  }
  return {};
}

// this is mostly for outgoing data capture.
function _getEventModelFromRequestAndResponse(
  requestOptions,
  request,
  requestTime,
  requestBody,
  response,
  responseTime,
  responseBody
) {
  var logData = {};
  logData.request = {};

  logData.request.verb =
    typeof requestOptions === 'string' ? 'GET' : requestOptions.method || 'GET';
  logData.request.uri = _getUrlFromRequestOptions(requestOptions, request);

  logData.request.headers = getRequestHeaders(requestOptions, request);
  logData.request.time = requestTime;

  // Decompress requestBody if needed
  var reqHeaders = logData.request.headers || {};
  var decompressedRequestBody = requestBody
    ? decompressIfNeeded(requestBody, reqHeaders)
    : requestBody;

  if (decompressedRequestBody) {
    var isReqBodyMaybeJson = _startWithJson(decompressedRequestBody);

    if (isReqBodyMaybeJson) {
      var parsedReqBody = _safeJsonParse(decompressedRequestBody);

      logData.request.transferEncoding = parsedReqBody.transferEncoding;
      logData.request.body = parsedReqBody.body;
    } else {
      logData.request.transferEncoding = 'base64';
      logData.request.body = _bodyToBase64(decompressedRequestBody);
    }
  }

  logData.response = {};
  logData.response.time = responseTime;
  logData.response.status = (response && (response.statusCode || response.status)) || 599;
  logData.response.headers = assign({}, (response && response.headers) || {});

  // Decompress responseBody if needed
  var resHeaders = logData.response.headers || {};
  var decompressedResponseBody = responseBody
    ? decompressIfNeeded(responseBody, resHeaders)
    : responseBody;

  if (decompressedResponseBody) {
    var isResBodyMaybeJson = _startWithJson(decompressedResponseBody);

    if (isResBodyMaybeJson) {
      var parsedResBody = _safeJsonParse(decompressedResponseBody);

      logData.response.transferEncoding = parsedResBody.transferEncoding;
      logData.response.body = parsedResBody.body;
    } else {
      logData.response.transferEncoding = 'base64';
      logData.response.body = _bodyToBase64(decompressedResponseBody);
    }
  }

  return logData;
}

function isJsonHeader(msg) {
  if (msg) {
    var headers = msg.headers || msg._moHeaders;
    if (headers['content-encoding']) {
      return false;
    }
    if (headers['content-type'] && headers['content-type'].indexOf('json') >= 0) {
      return true;
    }
  }
  return false;
}

function approximateObjectSize(obj) {
  try {
    var str = JSON.stringify(obj);
    return str.length;
  } catch (err) {
    return 0;
  }
}

function computeBodySize(body) {
  if (body === null || body === undefined) {
    return 0;
  }
  if (typeof body === 'string') {
    return body.length;
  }
  if (Buffer.isBuffer(body)) {
    return body.length;
  }
  if (typeof body === 'object') {
    return approximateObjectSize(body);
  }
  return 0;
}

function appendChunk(buf, chunk) {
  if (chunk) {
    if (Buffer.isBuffer(chunk)) {
      try {
        return buf ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
      } catch (err) {
        return buf;
      }
    } else if (typeof chunk === 'string') {
      try {
        return buf ? Buffer.concat([buf, Buffer.from(chunk)]) : Buffer.from(chunk);
      } catch (err) {
        return buf;
      }
    } else if (typeof chunk === 'object' || Array.isArray(chunk)) {
      try {
        return buf
          ? Buffer.concat([buf, Buffer.from(JSON.stringify(chunk))])
          : Buffer.from(JSON.stringify(chunk));
      } catch (err) {
        return buf;
      }
    } else {
      console.error('body chunk is not a Buffer or String.');
      return buf;
    }
  }
  return buf;
}

function totalChunkLength(chunk1, chunk2) {
  var length1 = chunk1 ? chunk1.length || 0 : 0;
  var length2 = chunk2 ? chunk2.length || 0 : 0;
  return length1 + length2;
}

function ensureToString(id) {
  if (typeof id === 'number') {
    return String(id);
  }
  if (typeof id === 'string') {
    return id;
  }
  if (id === null || id === undefined) {
    return id;
  }
  if (typeof id === 'object') {
    return String(id);
  }
  return id;
}

function getReqHeaders(req) {
  if (req.headers) {
    return req.headers;
  } else if (req.getHeaders) {
    return req.getHeaders() || {};
  }
  return {};
}

function generateUUIDv4() {
  let timeNow = new Date().getTime(); // Current time in milliseconds
  let timeRandom = timeNow + Math.random(); // Combine time and random number

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    let r = (timeRandom + Math.random() * 16) % 16 | 0; // Mix in timeRandom for extra entropy
    timeRandom = Math.floor(timeRandom / 16);
    let v = c === 'x' ? r : (r & 0x3) | 0x8; // Handle the fixed bits for UUIDv4
    return v.toString(16);
  });
}

module.exports = {
  getUrlFromRequestOptions: _getUrlFromRequestOptions,
  getEventModelFromRequestAndResponse: _getEventModelFromRequestAndResponse,
  safeJsonParse: _safeJsonParse,
  startWithJson: _startWithJson,
  bodyToBase64: _bodyToBase64,
  hashSensitive: _hashSensitive,
  logMessage: logMessage,
  timeTookInSeconds: timeTookInSeconds,
  isJsonHeader: isJsonHeader,
  appendChunk: appendChunk,
  computeBodySize: computeBodySize,
  totalChunkLength: totalChunkLength,
  ensureToString: ensureToString,
  getReqHeaders: getReqHeaders,
  generateUUIDv4: generateUUIDv4,
  decompressIfNeeded: decompressIfNeeded,
};
