/**
 * Created by Xingheng on 10/16/16.
 */

// express converts headers to lowercase
const TRANSACTION_ID_HEADER = 'x-moesif-transaction-id';

var _ = require('lodash');
var moesifapi = require('moesifapi');
var getRawBody = require('./getRawBody');
var contentType = require('content-type');
var EventModel = moesifapi.EventModel;
var UserModel = moesifapi.UserModel;
var CompanyModel = moesifapi.CompanyModel;
var requestIp = require('request-ip');
var dataUtils = require('./dataUtils');
var patch = require('./outgoing');
var createRecorder = require('./outgoingRecorder');
var createBatcher = require('./batcher');
var PassThrough = require('stream').PassThrough;
var moesifConfigManager = require('./moesifConfigManager');
var uuid4 = require('uuid4');

exports.defaultSkip = function(req, res) {
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

var noop = function () {}; // implicitly return undefined

var hashSensitive = dataUtils.hashSensitive;
var safeJsonParse = dataUtils.safeJsonParse;
var bodyToBase64 = dataUtils.bodyToBase64;
var startWithJson = dataUtils.startWithJson;

module.exports = function(options) {
  logMessage(options.debug, 'moesifInitiator', 'start');

  ensureValidOptions(options);

  // config moesifapi
  var config = moesifapi.configuration;
  config.ApplicationId = options.applicationId || options.ApplicationId;
  config.BaseUri = options.baseUri || options.BaseUri || config.BaseUri;
  var moesifController = moesifapi.ApiController;

  options.identifyUser = options.identifyUser || noop;
  options.identifyCompany = options.identifyCompany || noop;

  // function to add custom metadata (must be an object that can be converted to JSON)
  options.getMetadata = options.getMetadata || noop;

  // function to add custom session token (must be a string)
  options.getSessionToken = options.getSessionToken || noop;

  // function to allow adding of custom tags (this is decprecated - getMetadata should be used instead)
  options.getTags = options.getTags || noop;

  // function to declare the api versionused for the request
  options.getApiVersion = options.getApiVersion || noop;

  // logBody option
  var logBody = true;
  if (typeof options.logBody !== 'undefined' && options.logBody !== null){
    logBody = Boolean(options.logBody);
 }
  options.logBody = logBody;

  // function that allows removal of certain, unwanted fields, before it will be sent to moesif
  options.maskContent =
    options.maskContent ||
    function(eventData) {
      return eventData;
    };
  options.ignoreRoute =
    options.ignoreRoute ||
    function() {
      return false;
    };

  // function where conditions can be declared, when a request should be skipped and not be tracked by moesif
  options.skip = options.skip || exports.defaultSkip;

  var batcher = null;

  options.batchSize = options.batchSize || 25;
  options.batchMaxTime = options.batchMaxTime || 2000;

  if (options.disableBatching) {
    batcher = null;
  } else {
    batcher = createBatcher(
      function(eventArray) {
        moesifController.createEventsBatch(
          eventArray.map(function(logData) {
            return new EventModel(logData);
          }),
          function(err, response) {
            if (err) {
              logMessage(
                options.debug,
                'saveEventsBatch',
                'moesif API failed with error: ' + JSON.stringify(err)
              );
              if (options.callback) {
                options.callback(err, eventArray);
              }
            } else {
              moesifConfigManager.tryUpdateHash(response);

              logMessage(
                options.debug,
                'saveEventsBatch',
                'moesif API succeeded with batchSize ' + eventArray.length
              );
              if (options.callback) {
                options.callback(null, eventArray);
              }
            }
          }
        );
      },
      options.batchSize,
      options.batchMaxTime
    );
  }

  var trySaveEventLocal = function(eventData) {
    moesifConfigManager.tryGetConfig();

    if (moesifConfigManager.shouldSend(eventData && eventData.userId, eventData && eventData.companyId)) {
      if (batcher) {
        batcher.add(eventData);
      } else {
        moesifController.createEvent(new EventModel(eventData), function(err) {
          logMessage(options.debug, 'saveEvent', 'moesif API callback err=' + err);
          if (err) {
            logMessage(options.debug, 'saveEvent', 'moesif API failed with error.');
            if (options.callback) {
              options.callback(err, eventData);
            }
          } else {
            logMessage(options.debug, 'saveEvent', 'moesif API succeeded');
            if (options.callback) {
              options.callback(null, eventData);
            }
          }
        });
      }
    }
  };

  var moesifMiddleware = function(req, res, next) {
    logMessage(options.debug, 'moesifMiddleware', 'start');

    if (options.skip(req, res)) {
      logMessage(options.debug, 'moesifMiddleware', 'skipped ' + req.originalUrl);
      return next();
    }

    req._startTime = new Date();

    var getRawBodyPromise;
    // declare getRawBodyPromise here so in scope.

    if (
      !req.body &&
      req.headers &&
      req.headers['content-type'] &&
      req.headers['content-length'] &&
      parseInt(req.headers['content-length']) > 0
    ) {
      logMessage(options.debug, 'moesifMiddleware', 'request have content but request body is not set, patch pipe to split stream.');
      req._mo_pipe = req.pipe;

      req.pipe = function(writeStream, pipeOpts) {
        var split1 = new PassThrough();
        var split2 = new PassThrough();

        req._mo_pipe(split1);
        req._mo_pipe(split2);

        try {
          logMessage(options.debug, 'moesifMiddleware', 'creating get Raw');
          // create getRawBodyPromise here.
          getRawBodyPromise = getRawBody(split1, {
            encoding: contentType.parse(req).parameters.charset
          });
        } catch (err) {
          logMessage(options.debug, 'getRawBody', 'continue with getRawBody error' + err);
        }

        return split2.pipe(writeStream, pipeOpts);
      }
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

    res.write = function(chunk, encoding, callback) {
      logMessage(options.debug, 'response write', 'append chunk=' + chunk);
      resBodyBuf = appendChunk(resBodyBuf, chunk);
      res._mo_write(chunk, encoding, callback);
    };

    // Manage to get information from the response too, just like Connect.logger does:
    res._mo_end = res.end;

    // Add TransactionId to the response send to the client
    let disableTransactionId = options.disableTransactionId ? options.disableTransactionId : false;
    if (!disableTransactionId) {
      let txId = req.headers[TRANSACTION_ID_HEADER] || uuid4();
      // Use setHeader() instead of set() so it works with plain http-module and Express
      res.setHeader(TRANSACTION_ID_HEADER, txId);
    }

    res.end = function(chunk, encoding, callback) {
      logMessage(options.debug, 'response end', 'append chunk=' + chunk);

      var finalBuf = resBodyBuf;

      res.time = new Date();
      res.responseTime = new Date() - req._startTime;

      if (chunk && typeof chunk !== 'function') {
        finalBuf = Buffer.from(appendChunk(resBodyBuf, chunk));
      }

      res.end = res._mo_end;
      res.end(chunk, encoding, callback);

      try {
        // if req body already exists (set by another middleware) we can skip get rawBody.
        if (!req.body && getRawBodyPromise) {
          logMessage(options.debug, 'moesifMiddleware', 'req have no body attached and we have handle on getRawBodyPromise');
          getRawBodyPromise
            .then((str) => {
              logMessage(options.debug, 'getRawBodyPromise', 'successful. append request object with raw body: ' + (str && str.length));
              if (isJsonHeader(req) || startWithJson(str)) {
                var parsedReqBody = safeJsonParse(str);
                req._moTransferEncoding = parsedReqBody.transferEncoding;
                req._moBody = parsedReqBody.body;
              } else {
                req._moTransferEncoding = 'base64';
                req._moBody = bodyToBase64(str);
              }
              return req;
            })
            .then(() => {
              logEvent(finalBuf, req, res, options, trySaveEventLocal);
            })
            .catch((err) => {
              logMessage(options.debug, 'getRawBodyPromise', 'error getting rawbody' + err);
            });
        } else {
          logEvent(finalBuf, req, res, options, trySaveEventLocal);
        }
      } catch (err) {
        logMessage(options.debug, 'moesifMiddleware', 'error occurred during log event: ' + err);
      }
    };

    logMessage(options.debug, 'moesifMiddleware', 'finished, pass on to next().');

    if (next) {
      next();
    }
  };

  moesifMiddleware.updateUser = function(userModel, cb) {
    const user = new UserModel(userModel);
    logMessage(options.debug, 'updateUser', 'userModel=' + JSON.stringify(userModel));
    ensureValidUserModel(user);
    logMessage(options.debug, 'updateUser', 'userModel valid');
    moesifController.updateUser(user, cb);
  };

  moesifMiddleware.updateUsersBatch = function(usersBatchModel, cb) {
    usersBatch = [];
    for (let userModel of usersBatchModel) {
      usersBatch.push(new UserModel(userModel));
    }
    logMessage(options.debug, 'updateUsersBatch', 'usersBatchModel=' + JSON.stringify(usersBatchModel));
    ensureValidUsersBatchModel(usersBatch);
    logMessage(options.debug, 'updateUsersBatch', 'usersBatchModel valid');
    moesifController.updateUsersBatch(usersBatch, cb);
  };

  moesifMiddleware.updateCompany = function(companyModel, cb) {
    const company = new CompanyModel(companyModel);
    logMessage(options.debug, 'updateCompany', 'companyModel=' + JSON.stringify(companyModel));
    ensureValidCompanyModel(company);
    logMessage(options.debug, 'updateCompany', 'companyModel valid');
    moesifController.updateCompany(company, cb);
  }

  moesifMiddleware.updateCompaniesBatch = function(companiesBatchModel, cb) {
    companiesBatch = [];
    for (let companyModel of companiesBatchModel) {
      companiesBatch.push(new CompanyModel(companyModel));
    }
    logMessage(options.debug, 'updateCompaniesBatch', 'companiesBatchModel=' + JSON.stringify(companiesBatchModel));
    ensureValidCompaniesBatchModel(companiesBatch);
    logMessage(options.debug, 'updateCompaniesBatch', 'companiesBatchModel valid');
    moesifController.updateCompaniesBatch(companiesBatch, cb);
  };

  moesifMiddleware.startCaptureOutgoing = function() {
    if (moesifMiddleware._mo_patch) {
      logMessage(
        options.debug,
        'startCaptureOutgoing',
        'already started capturing outgoing requests.'
      );
    } else {
      function patchLogger(text) {
        logMessage(options.debug, 'outgoing capture', text);
      }
      var recorder = createRecorder(trySaveEventLocal, options, patchLogger);
      moesifMiddleware._mo_patch = patch(recorder, patchLogger);
    }
  };

  logMessage(options.debug, 'moesifInitiator', 'returning moesifMiddleware Function');
  return moesifMiddleware;
};

// START Helper functions.

function appendChunk(buf, chunk) {
  if (chunk) {
    if (Buffer.isBuffer(chunk)) {
      return buf ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
    } else if (typeof chunk === 'string') {
      return buf ? Buffer.concat([buf, Buffer.from(chunk)]) : Buffer.from(chunk);
    } else if (typeof chunk === 'object' || Array.isArray(chunk)) {
      try {
        return buf
          ? Buffer.concat([buf, Buffer.from(JSON.stringify(chunk))])
          : Buffer.from(JSON.stringify(chunk));
      } catch (err) {
        return buf;
      }
    } else {
      console.error('Response body chunk is not a Buffer or String.');
    }
  }
}

function logEvent(chunk, req, res, options, saveEvent) {
  logMessage(options.debug, 'logEvent', 'reqUrl=' + req.originalUrl);
  logMessage(options.debug, 'logEvent', 'chunk=', chunk);
  // res.time = new Date();
  // res.responseTime = new Date() - req._startTime;

  var logData = {};
  logData.request = {};
  logData.request.verb = req.method;
  var protocol =
    (req.connection && req.connection.encrypted) || req.secure ? 'https://' : 'http://';

  var host = req.headers.host || req.hostname;
  logData.request.uri = protocol + host + (req.originalUrl || req.url);
  logData.request.headers = req.headers;

  if (options.logBody) {
    if (req._moBody) {
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
  }

  logData.request.ipAddress = requestIp.getClientIp(req);
  logData.request.apiVerion = options.apiVerion;
  logData.request.time = req._startTime;

  logData.response = {};
  logData.response.status = res.statusCode ? res.statusCode : 599;
  logData.response.headers = res._moHeaders =
    res._headers || res.headers || decodeHeaders(res._header);
  logData.response.time = res.time;

  if (options.logBody) {
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
  }

  logMessage(options.debug, 'logEvent', 'created data: \n' + JSON.stringify(logData));

  logData = options.maskContent(logData);

  logData.userId = options.identifyUser(req, res);
  logData.companyId = options.identifyCompany(req, res);
  logData.sessionToken = options.getSessionToken(req, res);
  logData.tags = options.getTags(req, res);
  logData.request.apiVersion = options.getApiVersion(req, res);
  logData.metadata = options.getMetadata(req, res);

  logMessage(options.debug, 'logEvent', 'applied options to data: \n' + JSON.stringify(logData));

  ensureValidLogData(logData);

  // This is fire and forget, we don't want logging to hold up the request so don't wait for the callback
  if (!options.skip(req, res)) {
    logMessage(options.debug, 'logEvent', 'queue data to send to moesif');

    if (!options.noAutoHideSensitive) {
      // autoHide
      try {
        logData.request.headers = hashSensitive(logData.request.headers, options.debug);
        logData.request.body = hashSensitive(logData.request.body, options.debug);
        logData.response.headers = hashSensitive(logData.response.headers, options.debug);
        logData.response.body = hashSensitive(logData.response.body, options.debug);
      } catch (err) {
        logMessage(options.debug, 'logEvent', 'error on hashSensitive err=' + err);
      }
    }

    // Add Transaction Id to Event Request Model
    if (logData.response.headers[TRANSACTION_ID_HEADER]) {
      logData.request.headers[TRANSACTION_ID_HEADER] = logData.response.headers[TRANSACTION_ID_HEADER];
    }

    saveEvent(logData);
  }
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

function ensureValidOptions(options) {
  if (!options) throw new Error('options are required by moesif-express middleware');
  if (!options.applicationId)
    throw new Error(
      'A moesif application id is required. Please obtain it through your settings at www.moesif.com'
    );
  if (options.identifyUser && !_.isFunction(options.identifyUser)) {
    throw new Error('identifyUser should be a function');
  }
  if (options.identifyCompany && !_.isFunction(options.identifyCompany)) {
    throw new Error('identifyCompany should be a function');
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
    throw new Error('getApiVersion should be a function');
  }
  if (options.maskContent && !_.isFunction(options.maskContent)) {
    throw new Error('maskContent should be a function');
  }
  if (options.skip && !_.isFunction(options.skip)) {
    throw new Error('skip should be a function');
  }
  if (options.batchSize && (!_.isNumber(options.batchSize) || options.batchSize <= 1)) {
    throw new Error('batchSize must be a number great than 1');
  }
  if (options.batchMaxTime && (!_.isNumber(options.batchMaxTime) || options.batchMaxTime <= 500)) {
    throw new Error('batchMaxTime must be greater than 500 milliseonds');
  }
}

function ensureValidLogData(logData) {
  if (!logData.request) {
    throw new Error(
      'For Moesif events, request and response objects are required. Please check your maskContent function do not remove this'
    );
  } else {
    if (!logData.request.time) {
      throw new Error(
        'For Moesif events, request time is required. Please check your maskContent function do not remove this'
      );
    }
    if (!logData.request.verb) {
      throw new Error(
        'For Moesif events, request verb is required. Please check your maskContent function do not remove this'
      );
    }
    if (!logData.request.uri) {
      throw new Error(
        'For Moesif events, request uri is required. Please check your maskContent function do not remove this'
      );
    }
  }
  if (!logData.response) {
    throw new Error(
      'For Moesif events, request and response objects are required. Please check your maskContent function do not remove this'
    );
  } else {
    // if (!logData.response.body) {
    //   throw new Error('for log events, response body objects is required but can be empty object');
    // }
    if (!logData.request.time) {
      throw new Error(
        'For Moesif events, response time is required. The middleware should populate it automatically. Please check your maskContent function do not remove this'
      );
    }
  }
}

function ensureValidUserModel(userModel) {
  if (!userModel.userId) {
    throw new Error('To update a user, a userId field is required');
  }
}

function ensureValidUsersBatchModel(usersBatchModel) {
  for (let userModel of usersBatchModel) {
    if (!userModel.userId) {
      throw new Error('To update a user, a userId field is required');
    }
  }
}

function ensureValidCompanyModel(companyModel) {
  if (!companyModel.companyId) {
    throw new Error('To update a company, a companyId field is required');
  }
}

function ensureValidCompaniesBatchModel(companiesBatchModel) {
  for (let companyModel of companiesBatchModel) {
    if (!companyModel.companyId) {
      throw new Error('To update a company, a companyId field is required');
    }
  }
}
