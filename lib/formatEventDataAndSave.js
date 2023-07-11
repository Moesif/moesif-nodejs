var dataUtils = require('./dataUtils');
var ensureValidUtils = require('./ensureValidUtils');
var requestIp = require('request-ip');

var logMessage = dataUtils.logMessage;
var hashSensitive = dataUtils.hashSensitive;
var bodyToBase64 = dataUtils.bodyToBase64;
var startWithJson = dataUtils.startWithJson;
var timeTookInSeconds = dataUtils.timeTookInSeconds;
var safeJsonParse = dataUtils.safeJsonParse;
var isJsonHeader = dataUtils.isJsonHeader;
var computeBodySize = dataUtils.computeBodySize;

const TRANSACTION_ID_HEADER = 'x-moesif-transaction-id';

var ensureValidLogData = ensureValidUtils.ensureValidLogData;

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


function decodeHeaders(header) {
  try {
    var keyVal = header.split('\r\n');

    // Remove Request Line or Status Line
    keyVal.shift();

    var obj = {};
    var i;
    for (i in keyVal) {
      keyVal[i] = keyVal[i].split(':', 2);
      if (keyVal[i].length != 2) {
        continue;
      }
      obj[keyVal[i][0].trim()] = keyVal[i][1].trim();
    }
    return obj;
  } catch (err) {
    return {};
  }
}

function safeGetResponseHeaders(res) {
  try {
    if (res.getHeaders) {
      return res.getHeaders();
    }
    try {
      // access ._headers will result in exception
      // in some versions fo node.
      // so must be in try block.
      if (res._headers) {
        return res._headers;
      }
    } catch (err) {
    }
    return res.headers || decodeHeaders(res._header);
  } catch(err) {
    return {};
  }
}

// req getters that require trust proxy fn
// protocol (not used).
// ips (not used)
// ip (not used)
// subdomains (not used)
// hostname
// secure (used)

function safeGetHostname(req) {
  try {
    return req.hostname;
  } catch(err) {
    return (req.headers && req.headers['x-forwarded-host']) || 'localhost';
  }
}

function safeGetReqSecure(req) {
  try {
    return req.secure;
  } catch(err) {
    return false;
  }
}

function formatEventDataAndSave(responseBodyBuffer, req, res, options, saveEvent) {
  logMessage(options.debug, 'formatEventDataAndSave', 'reqUrl=' + req.originalUrl);
  logMessage(options.debug, 'formatEventDataAndSave', 'responseBodyBuffer=', responseBodyBuffer);

  var logData = {};
  logData.request = {};
  logData.request.verb = req.method;
  var protocol =
    (req.connection && req.connection.encrypted) || safeGetReqSecure(req) ? 'https://' : 'http://';

  var host = req.headers.host || safeGetHostname(req);
  logData.request.uri = protocol + host + (req.originalUrl || req.url);
  logData.request.headers = req.headers;

  if (options.logBody) {
    var parseRequestBodyStartTime = Date.now();
    const requestBody = req.body || req._moRawBody;
    // requestBody could be string or json object.

    const requestBodySize = computeBodySize(requestBody);

    if (requestBodySize > options.requestMaxBodySize) {
      logMessage(options.debug, 'formatEventDataAndSave', 'requestBodySize ' + requestBodySize + ' bigger than requestMaxBodySize ' + options.requestMaxBodySize, requestBody);

      logData.request.body = {
        msg: 'request.body.length exceeded options requestMaxBodySize of ' + options.requestMaxBodySize
      };
    } else if (requestBody) {
      logMessage(options.debug, 'formatEventDataAndSave', 'processing req.body');
      var isReqBodyMaybeJson = isJsonHeader(req) || startWithJson(requestBody);

      if (isReqBodyMaybeJson) {
        var parseRequestBodyAsJsonStartTime = Date.now();
        var parsedReqBody = safeJsonParse(requestBody);

        logData.request.transferEncoding = parsedReqBody.transferEncoding;
        logData.request.body = parsedReqBody.body;
        var parseRequestBodyAsJsonEndTime = Date.now();
        logMessage(options.debug, 'parseRequestBodyAsJson took time ', timeTookInSeconds(parseRequestBodyAsJsonStartTime, parseRequestBodyAsJsonEndTime));
      } else {
        var parseRequestBodyAsBase64StartTime = Date.now();
        logData.request.transferEncoding = 'base64';
        logData.request.body = bodyToBase64(requestBody);
        var parseRequestBodyAsBase64EndTime = Date.now();
        logMessage(options.debug, 'parseRequestBodyAsBase64 took time ', timeTookInSeconds(parseRequestBodyAsBase64StartTime, parseRequestBodyAsBase64EndTime));
      }
    }

    var parseRequestBodyEndTime = Date.now();
    logMessage(options.debug, 'parseRequestBody took time ', timeTookInSeconds(parseRequestBodyStartTime, parseRequestBodyEndTime));
  }

  logData.request.ipAddress = requestIp.getClientIp(req);

  logData.request.time = req._startTime;

  logData.response = {};
  logData.response.status = res.statusCode ? res.statusCode : 599;
  res._moHeaders = safeGetResponseHeaders(res);
  logData.response.headers = res._moHeaders;
  logData.response.time = res._endTime;
  // if _mo_blocked_by not exist, it will be undefined anyways.
  logData.response.blockedBy = res._mo_blocked_by;

  if (options.logBody) {
    if (res._mo_blocked_by) {
      // blocked body is always json
      logData.body = res._mo_blocked_body;
    } else if (responseBodyBuffer) {
      logMessage(options.debug, 'formatEventDataAndSave', 'processing responseBodyBuffer');
      if (responseBodyBuffer.length < options.responseMaxBodySize) {
        if (isJsonHeader(res) || startWithJson(responseBodyBuffer)) {
          var parsedResBody = safeJsonParse(responseBodyBuffer);
          logData.response.transferEncoding = parsedResBody.transferEncoding;
          logData.response.body = parsedResBody.body;
        } else {
          logData.response.transferEncoding = 'base64';
          logData.response.body = bodyToBase64(responseBodyBuffer);
        }
      } else {
        logData.response.body = {
          msg: 'response.body.length exceeded options responseMaxBodySize of ' + options.responseMaxBodySize
        }
      }
    }
  }

  logMessage(options.debug, 'formatEventDataAndSave', 'created data', logData);

  logData = options.maskContent(logData);

  var identifyUserStartTime = Date.now();
  logData.userId = ensureToString(options.identifyUser(req, res));
  var identifyUserEndTime = Date.now();
  logMessage(options.debug, 'identifyUser took time ', timeTookInSeconds(identifyUserStartTime, identifyUserEndTime));

  var identifyCompanyStartTime = Date.now();
  logData.companyId = ensureToString(options.identifyCompany(req, res));
  var identifyCompanyEndTime = Date.now();
  logMessage(options.debug, 'identifyCompany took time ', timeTookInSeconds(identifyCompanyStartTime, identifyCompanyEndTime));

  logData.sessionToken = options.getSessionToken(req, res);
  logData.tags = options.getTags(req, res);
  logData.request.apiVersion = options.getApiVersion(req, res);
  logData.metadata = options.getMetadata(req, res);

  // Set API direction
  logData.direction = "Incoming"

  logMessage(options.debug, 'formatEventDataAndSave', 'applied options to data=', logData);

  var ensureValidLogDataStartTime = Date.now();
  ensureValidLogData(logData);
  var ensureValidLogDataEndTime = Date.now();
  logMessage(options.debug, 'ensureValidLogData took time ', timeTookInSeconds(ensureValidLogDataStartTime, ensureValidLogDataEndTime));

  // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
  if (!options.skip(req, res)) {
    logMessage(options.debug, 'formatEventDataAndSave', 'queue data to send to moesif');

    if (!options.noAutoHideSensitive) {
      var noAutoHideSensitiveStartTime = Date.now();
      // autoHide
      try {
        logData.request.headers = hashSensitive(logData.request.headers, options.debug);
        logData.request.body = hashSensitive(logData.request.body, options.debug);
        logData.response.headers = hashSensitive(logData.response.headers, options.debug);
        logData.response.body = hashSensitive(logData.response.body, options.debug);
      } catch (err) {
        logMessage(options.debug, 'formatEventDataAndSave', 'error on hashSensitive err=' + err);
      }
      var noAutoHideSensitiveEndTime = Date.now();
      logMessage(options.debug, 'noAutoHideSensitive took time ', timeTookInSeconds(noAutoHideSensitiveStartTime, noAutoHideSensitiveEndTime));
    }

    // Add Transaction Id to Event Request Model
    if (logData.response.headers[TRANSACTION_ID_HEADER]) {
      logData.request.headers[TRANSACTION_ID_HEADER] = logData.response.headers[TRANSACTION_ID_HEADER];
    }

    saveEvent(logData);
  }
}

module.exports = formatEventDataAndSave;
