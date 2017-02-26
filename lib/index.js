/**
 * Created by Xingheng on 10/16/16.
 */

var _ = require('lodash');
var moesifapi = require('moesifapi');
var getRawBody = require('raw-body');
var contentType = require('content-type');
var EventModel = moesifapi.EventModel;
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

    if (options.skip(req, res)) {
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
          req._jsonbody = safeJSONParse(string);
        };
      })
    };

    req._routeWhitelists = {
      req: [],
      res: [],
      body: []
    };

    req._routeBlacklists = {
      body: []
    };

    // Manage to get information from the response too, just like Connect.logger does:
    var write = res.write;

    res.write = function (chunk, encoding, callback) {

      res.time = new Date();
      res.responseTime = (new Date) - req._startTime;

      res.write = write;
      res.write(chunk, encoding, callback);

      if (chunk) {
        logEvent(chunk, req, res, options, moesifController);
      };
    };

    // Manage to get information from the response too, just like Connect.logger does:
    var end = res.end;

    res.end = function (chunk, encoding, callback) {

      res.time = new Date();
      res.responseTime = (new Date) - req._startTime;

      res.end = end;
      res.end(chunk, encoding, callback);

      if (chunk) {
        logEvent(chunk, req, res, options, moesifController);
      }
    };

    next();
  };

  moesifMiddleware.updateUser = function (userModel, cb) {
    ensureValidUserModel(userModel);
    moesifController.updateUser(userModel, cb);
  };

  return moesifMiddleware;
};

function logEvent(chunk, req, res, options, moesifController) {
  res.time = new Date();
  res.responseTime = (new Date) - req._startTime;

  var logData = {};
  logData.request = {};
  logData.request.verb = req.method;
  var host = req.get('host') || req.hostname;
  logData.request.uri = req.protocol + '://' + host + (req.originalUrl || req.url);
  logData.request.body = req.body || req._jsonbody;
  logData.request.headers = req.headers;
  logData.request.ipAddress = req.ip;
  logData.request.apiVerion = options.apiVerion;
  logData.request.time = req._startTime;

  logData.response = {};
  logData.response.status = res._header ? res.statusCode : 520;
  logData.response.headers = res._headers;
  logData.response.time = res.time;

  logData.response.body = {};

  if (chunk) {
    var isJson = (res._headers && res._headers['content-type']
    && res._headers['content-type'].indexOf('json') >= 0);

    if (typeof chunk === 'string') {
      logData.response.body = safeJSONParse(chunk);
    }
    if (typeof chunk === 'object') {
      logData.response.body = bodyToJson(chunk, isJson);
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
    moesifController.createEvent(new EventModel(logData), function(err) {
      if (err) {
        // console.error(err);
        if (options.callback) {
          options.callback(err, null);
        }
      }
    });
  }
}

function safeJSONParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    // console.error('parsing response body JSON failure' + e);
    return {
      moesif_error: {
        code: 'json_parse_error',
        src: 'moesif-express',
        msg: ['Body is not a JSON Object or JSON Array'],
        args: [str]
      }
    };
  }
}

function bodyToJson(body, isJSON) {
  var stringBody = body && body.toString();
  if (isJSON) {
    return (safeJSONParse(stringBody) || {});
  }
  return body;
}

function bodyToString(body, isJSON) {
  var stringBody = body && body.toString();
  if (isJSON) {
    return (safeJSONParse(body) || stringBody);
  }
  return stringBody;
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
    if (!logData.response.body) {
      throw new Error('for log events, response body objects is required but can be empty object');
    }
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