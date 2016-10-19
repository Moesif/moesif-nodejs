/**
 * Created by Xingheng on 10/16/16.
 */

var _ = require('lodash');
var moesifapi = require('moesifapi');
var EventModel = moesifapi.EventModel;

exports.defaultSkip = function () {
  return false;
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
  var apiVersion = options.apiVersion || undefined;
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

  return function (req, res, next) {

    req._startTime = (new Date);

    req._routeWhitelists = {
      req: [],
      res: [],
      body: []
    };

    req._routeBlacklists = {
      body: []
    };

    // Manage to get information from the response too, just like Connect.logger does:
    var end = res.end;

    res.end = function (chunk, encoding) {
      res.time = new Date();

      res.responseTime = (new Date) - req._startTime;

      res.end = end;
      res.end(chunk, encoding);


      var logData = {};
      logData.request = {};
      logData.request.verb = req.method;
      logData.request.uri = req.protocol + '://' + req.get('host') + (req.originalUrl || req.url);
      logData.request.body = req.body;
      logData.request.headers = req.headers;
      logData.request.ipAddress = req.ip;
      logData.request.apiVerion = options.apiVerion;
      logData.request.time = req._startTime;

      logData.response = {};
      logData.response.status = res._header ? res.statusCode : 520;
      logData.response.headers = res._headers;
      logData.response.time = res.time;

      if (chunk) {
        var isJson = (res._headers && res._headers['content-type']
        && res._headers['content-type'].indexOf('json') >= 0);
        logData.response.body = bodyToString(chunk, isJson);
      } else {
        logData.response.body = {};
      }

      logData = options.maskContent(logData);

      logData.userId = options.identifyUser(logData.request, logData.response);
      logData.sessionToken = options.getSessionToken(logData.request, logData.response);
      logData.tags = options.getTags(logData.request, logData.response);
      logData.request.apiVerion = options.getApiVersion(logData.request, logData.response);

      ensureValidLogData(logData);

      // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
      if (!options.skip(logData.request, logData.response)) {


        moesifController.createEvent(new EventModel(logData), function(err) {
          if (err) {
            // console.log(err);
            if (options.callback) {
              options.callback(err, null);
            }
          }
          else {
            // console.log('success submitted');
            if (options.callback) {
              options.callback(null, logData);
            }
          }
        });
      }
    };
    next();
  };
};

function safeJSONParse(string) {
  try {
    return JSON.parse(string);
  } catch (e) {
    return undefined;
  }
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
  if (!options.applicationId) throw new Error('an moesif app secret key is required');
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
