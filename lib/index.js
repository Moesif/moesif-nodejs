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
  return req.path && req.path === '/';
};

//
// ### function moesifExpress(options)
// #### @options {Object} options to initialize the middleware.
//

module.exports = function (options) {

  ensureValidOptions(options);

  // config moesifapi
  var config = moesifapi.configuration;
  config.ApplicationId = options.applicationId;
  var moesifController = moesifapi.ApiController;

  // function to identify user.
  options.identifyUser = options.identifyUser || function () {
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
    // console.log('middleware is called');

    if (options.skip(req, res)) {
      // console.log('skipped ' + req.originalUrl);
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
        if (!err) {
          if (isJsonHeader(req) || startWithJson(string)) {
            const parsedBody = safeJsonParse(string);
            req._moTransferEncoding = parsedBody.transferEncoding;
            req._moBody = parsedBody.body
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
      resBodyBuf = appendChunk(resBodyBuf, chunk);
      res._mo_write(chunk, encoding, callback);
    };

    // Manage to get information from the response too, just like Connect.logger does:
    res._mo_end = res.end;

    res.end = function (chunk, encoding, callback) {

      res.time = new Date();
      res.responseTime = (new Date) - req._startTime;

      if (chunk && typeof chunk !== 'function') {
        resBodyBuf = appendChunk(resBodyBuf, chunk);
      };

      res.end = res._mo_end;
      res.end(chunk, encoding, callback);

      logEvent(resBodyBuf, req, res, options, moesifController);
    };

    next();
  };

  moesifMiddleware.updateUser = function (userModel, cb) {
    ensureValidUserModel(userModel);
    moesifController.updateUser(userModel, cb);
  };

  return moesifMiddleware;
};

function appendChunk(buf, chunk) {
  if (chunk) {
    if (Buffer.isBuffer(chunk)) {
      return buf ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
    } else if (typeof chunk === 'string') {
      return buf ? Buffer.concat([buf, Buffer.from(chunk)]) : Buffer.from(chunk);
    } else if (typeof chunk.toString === 'function') {
      return buf ? Buffer.concat([buf, Buffer.from(chunk.toString())]) : Buffer.from(chunk.toString());
    } else {
      console.error("Response body chunk is not a Buffer or String.");
    }
  }
}

function logEvent(chunk, req, res, options, moesifController) {
  // console.log('logEvent is called' + req.originalUrl);
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
    logData.request.transferEncoding = req._moTransferEncoding;
    logData.request.body = req._moBody;
  } else if (req.body) {
    var isReqBodyMaybeJson = isJsonHeader(req) || startWithJson(req.body);

    if (isReqBodyMaybeJson) {
      const parsedBody = safeJsonParse(req.body);

      logData.request.transferEncoding = parsedBody.transferEncoding;
      logData.request.body = parsedBody.body;
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

    if (isJsonHeader(res) || startWithJson(chunk)) {
      const parsedBody = safeJsonParse(chunk);
      logData.response.transferEncoding = parsedBody.transferEncoding;
      logData.response.body = parsedBody.body;
    } else {
      logData.response.transferEncoding = 'base64';
      logData.response.body = bodyToBase64(chunk);
    }
  }

  logData = options.maskContent(logData);

  logData.userId = options.identifyUser(req, res);
  logData.sessionToken = options.getSessionToken(req, res);
  logData.tags = options.getTags(req, res);
  logData.request.apiVerion = options.getApiVersion(req, res);

  ensureValidLogData(logData);

  // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
  if (!options.skip(req, res)) {
    // console.log('not skipped about to send data');
    moesifController.createEvent(new EventModel(logData), function(err) {
      // console.log('inside moesif API callback');
      if (err) {
        if (options.callback) {
          options.callback(err, logData);
        }
      } else {
        if(options.callback) {
          options.callback(null, logData);
        }
      }
    });
  }
}

function safeJsonParse(body) {

  try {
    const bodyString = body.toString();
    if (!Buffer.isBuffer(body) && startWithJson(bodyString) &&
      (typeof body === 'object' || typeof body === 'array')) {
      return {
        body:  body,
        transferEncoding: undefined
      }
    }
    return {
      body:  JSON.parse(bodyString),
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
  return false;
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
