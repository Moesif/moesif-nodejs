/**
 * Created by Xingheng on 10/16/16.
 */

var _ = require('lodash');
var moesifapi = require('moesifapi');
var getRawBody = require('raw-body');
var contentType = require('content-type');
var EventModel = moesifapi.EventModel;
var requestIp = require('request-ip');
exports.defaultSkip = function (req, res) {
  return false;
};

//
// ### function moesifExpress(options)
// #### @options {Object} options to initialize the middleware.
//

var logMessage = function(debug, functionName, message) {
  if (debug) {
    console.log('MOESIF: [' + functionName + '] ' + message);
  }
};

module.exports = function (options) {

  logMessage(options.debug, 'moesifInitiator', 'start');

  ensureValidOptions(options);

  // config moesifapi
  var config = moesifapi.configuration;
  config.ApplicationId = options.applicationId || options.ApplicationId;
  config.BaseUri = options.baseUri || options.BaseUri || config.BaseUri;
  var moesifController = moesifapi.ApiController;

  // function to identify user.
  options.identifyUser = options.identifyUser || function () {
      return undefined;
    };

  options.getMetadata = options.getMetadata || function() {
      return undefined;
    };

  options.getSessionToken = options.getSessionToken || function () {
      return undefined;
    };
  options.getTags = options.getTags || function () {
      return undefined;
    };
  options.getApiVersion = options.getApiVersion || function () {
      return undefined;
    };
  options.maskContent = options.maskContent || function (eventData) {
      return eventData;
    };
  options.ignoreRoute = options.ignoreRoute || function () {
      return false;
    };
  options.skip = options.skip || exports.defaultSkip;



  var moesifMiddleware = function (req, res, next) {
    logMessage(options.debug, 'moesifMiddleware', 'start');

    if (options.skip(req, res)) {
      logMessage(options.debug, 'moesifMiddleware', 'skipped ' + req.originalUrl);
      return next();
    }

    req._startTime = (new Date);

    if (!req.body &&
      req.headers && req.headers['content-type'] &&
      req.headers['content-type'].indexOf('json') >= 0 &&
      req.headers['content-length'] &&
      parseInt(req.headers['content-length']) > 0) {

      getRawBody(req, {
        length: req.headers['content-length'],
        limit: '1mb',
        encoding: contentType.parse(req).parameters.charset
      }, function (err, string) {
        logMessage(options.debug, 'getRawBody', 'callback start error=' + err + ' string=' + string);

        if (!err) {
          if (isJsonHeader(req) || startWithJson(string)) {
            var parsedReqBody = safeJsonParse(string);
            req._moTransferEncoding = parsedReqBody.transferEncoding;
            req._moBody = parsedReqBody.body
          } else {
            req._moTransferEncoding = 'base64';
            req._moBody = bodyToBase64(string);
          }
        }
      })
    }

    req._routeWhitelists = {
      req: [],
      res: [],
      body: []
    };

    req._routeBlacklists = {
      body: []
    };

    // Manage to get information from the response too, just like Connect.logger does:
    res._mo_write = res.write;
    var resBodyBuf;

    res.write = function (chunk, encoding, callback) {
      logMessage(options.debug, 'response write',  'append chunk=' + chunk);
      resBodyBuf = appendChunk(resBodyBuf, chunk);
      res._mo_write(chunk, encoding, callback);
    };

    // Manage to get information from the response too, just like Connect.logger does:
    res._mo_end = res.end;

    res.end = function (chunk, encoding, callback) {
      logMessage(options.debug, 'response end',  'append chunk=' + chunk);

      var finalBuf = resBodyBuf;

      res.time = new Date();
      res.responseTime = (new Date) - req._startTime;

      if (chunk && typeof chunk !== 'function') {
          finalBuf = Buffer.from(appendChunk(resBodyBuf, chunk));
      }

      res.end = res._mo_end;
      res.end(chunk, encoding, callback);

      logEvent(finalBuf, req, res, options, moesifController);
    };

    logMessage(options.debug, 'moesifMiddleware', 'finished, pass on to next().');

    if (next) {
      next();
    }
  };

  moesifMiddleware.updateUser = function (userModel, cb) {
    logMessage(options.debug, 'updateUser', 'userModel=' + JSON.stringify(userModel));
    ensureValidUserModel(userModel);
    logMessage(options.debug, 'updateUser', 'userModel valid');
    moesifController.updateUser(userModel, cb);
  };

  logMessage(options.debug, 'moesifInitiator', 'returning moesifMiddleware Function');
  return moesifMiddleware;
};

function appendChunk(buf, chunk) {
  if (chunk) {
    if (Buffer.isBuffer(chunk)) {
        return buf ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
    } else if (typeof chunk === 'string') {
        return buf ? Buffer.concat([buf, Buffer.from(chunk)]) : Buffer.from(chunk);
    } else if (typeof chunk === 'object' || Array.isArray(chunk))  {
        try {
            return buf ? Buffer.concat([buf, Buffer.from(JSON.stringify(chunk))]) : Buffer.from(JSON.stringify(chunk));
        } catch (err) {
          return buf;
        }
    } else {
      console.error("Response body chunk is not a Buffer or String.");
    }
  }
}

function logEvent(chunk, req, res, options, moesifController) {
  logMessage(options.debug, 'logEvent', 'reqUrl=' + req.originalUrl);
  logMessage(options.debug, 'logEvent', 'chunk=', chunk);
  res.time = new Date();
  res.responseTime = (new Date) - req._startTime;

  var logData = {};
  logData.request = {};
  logData.request.verb = req.method;
  var protocol = ((req.connection && req.connection.encrypted) ||req.secure)
    ? 'https://' : 'http://';

  var host = req.headers.host || req.hostname;
  logData.request.uri = protocol + host + (req.originalUrl || req.url);
  logData.request.headers = req.headers;

  if(req._moBody) {
    logMessage(options.debug, 'logEvent', 'processing req._moBody');
    logData.request.transferEncoding = req._moTransferEncoding;
    logData.request.body = req._moBody;
  } else if (req.body) {
    logMessage(options.debug, 'logEvent', 'processing req.body');
    var isReqBodyMaybeJson = isJsonHeader(req) || startWithJson(req.body);

    if (isReqBodyMaybeJson) {
      var parsedReqBody = safeJsonParse(req.body);

      logData.request.transferEncoding = parsedReqBody.transferEncoding;
      logData.request.body = parsedReqBody.body;
    } else {
      logData.request.transferEncoding = 'base64';
      logData.request.body = bodyToBase64(req.body);
    }
  }

  logData.request.ipAddress = requestIp.getClientIp(req);
  logData.request.apiVerion = options.apiVerion;
  logData.request.time = req._startTime;

  logData.response = {};
  logData.response.status = res.statusCode ? res.statusCode : 599;
  logData.response.headers = res._moHeaders = res._headers || res.headers || decodeHeaders(res._header);
  logData.response.time = res.time;

  if (chunk) {
    logMessage(options.debug, 'logEvent', 'processing chunk');
    if (isJsonHeader(res) || startWithJson(chunk)) {
      var parsedResBody = safeJsonParse(chunk);
      logData.response.transferEncoding = parsedResBody.transferEncoding;
      logData.response.body = parsedResBody.body;
    } else {
      logData.response.transferEncoding = 'base64';
      logData.response.body = bodyToBase64(chunk);
    }
  }

  logMessage(options.debug, 'logEvent', 'created data: \n' + JSON.stringify(logData));

  logData = options.maskContent(logData);

  logData.userId = options.identifyUser(req, res);
  logData.sessionToken = options.getSessionToken(req, res);
  logData.tags = options.getTags(req, res);
  logData.request.apiVerion = options.getApiVersion(req, res);
  logData.metadata = options.getMetadata(req, res);


  logMessage(options.debug, 'logEvent', 'applied options to data: \n' + JSON.stringify(logData));

  ensureValidLogData(logData);

  // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
  if (!options.skip(req, res)) {
    logMessage(options.debug, 'logEvent', 'sending data invoking moesifAPI');

    moesifController.createEvent(new EventModel(logData), function(err) {
      logMessage(options.debug, 'logEvent', 'moesif API callback err=' + err);
      if (err) {
        logMessage(options.debug, 'logEvent', 'moesif API failed with error.');
        if (options.callback) {
          options.callback(err, logData);
        }
      } else {
        logMessage(options.debug, 'logEvent', 'moesif API succeeded');
        if(options.callback) {
          options.callback(null, logData);
        }
      }
    });
  }
}

function safeJsonParse(body) {

  try {
    if (!Buffer.isBuffer(body) &&
      (typeof body === 'object' || Array.isArray(body))) {
      return {
        body:  body,
        transferEncoding: undefined
      }
    }
    return {
      body:  JSON.parse(body.toString()),
      transferEncoding: undefined
    }
  } catch (e) {
    return {
      body:  bodyToBase64(body),
      transferEncoding: 'base64'
    }
  }
}

function bodyToBase64(body) {
  if(!body) {
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

function isJsonHeader(msg) {
  if (msg) {
    var headers = msg.headers || msg._moHeaders;
    if(headers['content-encoding']) {
      return false;
    }
    if(headers['content-type'] && headers['content-type'].indexOf('json') >= 0) {
      return true;
    }
  }
  return false;
}

function startWithJson(body) {

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

function decodeHeaders(header) {

  try {
    var keyVal = header.split("\r\n")

    // Remove Request Line or Status Line
    keyVal.shift()

    var obj = {};
    var i;
    for (i in keyVal) {
      keyVal[i] = keyVal[i].split(":", 2);
      if (keyVal[i].length != 2) {
        continue;
      }
      obj[keyVal[i][0].trim()] = keyVal[i][1].trim();
    }
    return obj
  }
  catch (err) {
    return {}
  }
}

function ensureValidOptions(options) {
  if (!options) throw new Error('options are required by moesif-express middleware');
  if (!options.applicationId) throw new Error('A moesif application id is required. Please obtain it through your settings at www.moesif.com');
  if (options.identifyUser && !_.isFunction(options.identifyUser)) {
    throw new Error('identifyUser should be a function');
  }
  if (options.getMetadata && !_.isFunction(options.getMetadata)) {
    throw new Error('getMetadata should be a function');
  }
  if (options.getSessionToken && !_.isFunction(options.getSessionToken)) {
    throw new Error('getSessionToken should be a function');
  }
  if (options.getTags && !_.isFunction(options.getTags)) {
    throw new Error('getTags should be a function');
  }
  if (options.getApiVersion && !_.isFunction(options.getApiVersion)) {
    throw new Error('identifyUser should be a function');
  }
  if (options.maskContent && !_.isFunction(options.maskContent)) {
    throw new Error('maskContent should be a function');
  }
  if (options.skip && !_.isFunction(options.skip)) {
    throw new Error('skip should be a function');
  }
}

function ensureValidLogData(logData) {
  if (!logData.request) {
    throw new Error('For Moesif events, request and response objects are required. Please check your maskContent function do not remove this');
  }
  else {
    if (!logData.request.time) {
      throw new Error('For Moesif events, request time is required. Please check your maskContent function do not remove this');
    }
    if (!logData.request.verb) {
      throw new Error('For Moesif events, request verb is required. Please check your maskContent function do not remove this');
    }
    if (!logData.request.uri) {
      throw new Error('For Moesif events, request uri is required. Please check your maskContent function do not remove this');
    }
  }
  if (!logData.response) {
    throw new Error('For Moesif events, request and response objects are required. Please check your maskContent function do not remove this');
  }
  else {
    // if (!logData.response.body) {
    //   throw new Error('for log events, response body objects is required but can be empty object');
    // }
    if (!logData.request.time) {
      throw new Error('For Moesif events, response time is required. The middleware should populate it automatically. Please check your maskContent function do not remove this');
    }
  }
}

function ensureValidUserModel(userModel) {
  if (!userModel.userId) {
    throw new Error('To update user, a userId field is required');
  }
}
