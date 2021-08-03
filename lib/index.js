/**
 * Created by Xingheng on 10/16/16.
 */

var isNil = require('lodash/isNil');
var moesifapi = require('moesifapi');
var getRawBody = require('./getRawBody');
var contentType = require('content-type');
var EventModel = moesifapi.EventModel;
var UserModel = moesifapi.UserModel;
var CompanyModel = moesifapi.CompanyModel;

var dataUtils = require('./dataUtils');
var patch = require('./outgoing');
var createOutgoingRecorder = require('./outgoingRecorder');
var createBatcher = require('./batcher');
var PassThrough = require('stream').PassThrough;
var moesifConfigManager = require('./moesifConfigManager');
var uuid4 = require('uuid4');
var unparsed = require('koa-body/unparsed.js');
var pjson = require('../package.json');
var ensureValidUtils = require('./ensureValidUtils');
var formatEventDataAndSave = require('./formatEventDataAndSave');

// express converts headers to lowercase
const TRANSACTION_ID_HEADER = 'x-moesif-transaction-id';

var logMessage = dataUtils.logMessage;
var timeTookInSeconds = dataUtils.timeTookInSeconds;

var ensureValidOptions = ensureValidUtils.ensureValidOptions;
var ensureValidUserModel = ensureValidUtils.ensureValidUserModel;
var ensureValidUsersBatchModel = ensureValidUtils.ensureValidUsersBatchModel;
var ensureValidCompanyModel = ensureValidUtils.ensureValidCompanyModel;
var ensureValidCompaniesBatchModel = ensureValidUtils.ensureValidCompaniesBatchModel;


function appendChunk(buf, chunk) {
  if (chunk) {
    var appendChunkFunctionStartTime = Date.now();
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
    var appendChunkFunctionEndTime = Date.now();
    logMessage(options.debug, 'appendChunkFunction took time ', timeTookInSeconds(appendChunkFunctionStartTime, appendChunkFunctionEndTime));
  }
}

// default option utility functions.

var noop = function () {}; // implicitly return undefined

var defaultSkip = function(req, res) {
  return false;
};

var defaultIdentifyUser = function (req, res) {
  if (req) {
    // Express Default User Id
    if (req.user) {
      return req.user.id;
    }
    // Koa Default User Id
    if (req.state && req.state.user) {
      return req.state.user.sub || req.state.user.id;
    }
  }
  return undefined;
};

//
// ### function moesif(options)
// #### @options {Object} options to initialize the middleware.
//
module.exports = function(options) {
  logMessage(options.debug, 'moesifInitiator', 'start');

  var ensureValidOptionsStartTime = Date.now();

  ensureValidOptions(options);

  var ensureValidOptionsEndTime = Date.now();

  logMessage(options.debug, 'ensureValidOptions took time ', timeTookInSeconds(ensureValidOptionsStartTime, ensureValidOptionsEndTime));

  // config moesifapi
  var config = moesifapi.configuration;
  config.ApplicationId = options.applicationId || options.ApplicationId;
  config.UserAgent = 'moesif-nodejs/' + pjson.version
  config.BaseUri = options.baseUri || options.BaseUri || config.BaseUri;
  // default retry to 1.
  config.retry = isNil(options.retry) ?  1 : options.retry;
  var moesifController = moesifapi.ApiController;

  options.identifyUser = options.identifyUser || defaultIdentifyUser;

  options.identifyCompany = options.identifyCompany || noop;

  // function to add custom metadata (must be an object that can be converted to JSON)
  options.getMetadata = options.getMetadata || noop;

  // function to add custom session token (must be a string)
  options.getSessionToken = options.getSessionToken || noop;

  // function to allow adding of custom tags (this is decprecated - getMetadata should be used instead)
  options.getTags = options.getTags || noop;

  // function to declare the api version used for the request
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
  options.requestMaxBodySize = options.requestMaxBodySize || 100000;
  options.responseMaxBodySize = options.responseMaxBodySize || 100000;

  if (options.disableBatching) {
    batcher = null;
  } else {
    batcher = createBatcher(
      function(eventArray) {
        // start log time batcher took staring here.
        var batcherStartTime = Date.now();
        moesifController.createEventsBatch(
          eventArray.map(function(logData) {
            return new EventModel(logData);
          }),
          function(err, response) {
            var batcherEndTime = Date.now();
            logMessage(options.debug, 'createBatcher took time ', timeTookInSeconds(batcherStartTime, batcherEndTime));
            if (err) {
              logMessage(
                options.debug,
                'saveEventsBatch',
                'moesif API failed with error: ',
                err
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
    var trySaveEventLocalStartTime = Date.now();
    var tryGetConfigStartTime = Date.now();
    moesifConfigManager.tryGetConfig();
    var tryGetConfigEndTime = Date.now();
    logMessage(options.debug, 'tryGetConfig took time ', timeTookInSeconds(tryGetConfigStartTime, tryGetConfigEndTime));

    if (moesifConfigManager.shouldSend(eventData && eventData.userId, eventData && eventData.companyId)) {
      var getSampleRateStartTime = Date.now();
      let sampleRate = moesifConfigManager._getSampleRate(eventData && eventData.userId, eventData && eventData.companyId);
      var getSampleRateEndTime = Date.now();
      logMessage(options.debug, 'getSampleRate took time ', timeTookInSeconds(getSampleRateStartTime, getSampleRateEndTime));
      eventData.weight = sampleRate === 0 ? 1 : Math.floor(100 / sampleRate);
      if (batcher) {
        var eventAddedToTheBatchStartTime = Date.now();
        batcher.add(eventData);
        var eventAddedToTheBatchEndTime = Date.now();
        logMessage(options.debug, 'eventAddedToTheBatch took time ', timeTookInSeconds(eventAddedToTheBatchStartTime, eventAddedToTheBatchEndTime));
      } else {
        var sendEventStartTime = Date.now();
        moesifController.createEvent(new EventModel(eventData), function(err) {
          logMessage(options.debug, 'saveEvent', 'moesif API callback err=' + err);
          if (err) {
            logMessage(options.debug, 'saveEvent', 'moesif API failed with error.');
            if (options.callback) {
              options.callback(err, eventData);
            }
            var sendEventEndTime = Date.now();
            logMessage(options.debug, 'sendSingleEvent took time ', timeTookInSeconds(sendEventStartTime, sendEventEndTime));
          } else {
            logMessage(options.debug, 'saveEvent', 'moesif API succeeded');
            if (options.callback) {
              options.callback(null, eventData);
            }
            var sendEventEndTime = Date.now();
            logMessage(options.debug, 'sendSingleEvent took time ', timeTookInSeconds(sendEventStartTime, sendEventEndTime));
          }
        });
      }
    }
    var trySaveEventLocalEndTime = Date.now();
    logMessage(options.debug, 'trySaveEventLocal took time ', timeTookInSeconds(trySaveEventLocalStartTime, trySaveEventLocalEndTime));
  };

  const moesifMiddleware = function(arg1, arg2, arg3) {
    var req = arg1;
    var res = arg2;
    var next = arg3;

    logMessage(options.debug, 'moesifMiddleware', 'start');

    var koaContext = null;
    // If Koa context, use correct arguments
    if (arg1.req && arg1.res && arg1.state && arg1.app) {
      logMessage(options.debug, 'moesifMiddleware', 'Using Koa context');
      koaContext = arg1;
      req = koaContext.req;

      // capture request body in case of Koa and in case req body is already set.
      req.body = req.body ? req.body : (koaContext.request && koaContext.request.body);

      req.state = koaContext.state;
      res = koaContext.res;
      next = arg3 || arg2;
    }

    if (options.skip(req, res)) {
      logMessage(options.debug, 'moesifMiddleware', 'skipped ' + req.originalUrl);
      if (next) {
        return next();
      }
    }

    req._startTime = new Date();

    var getRawBodyPromise;
    // declare getRawBodyPromise here so in scope.

    if (
      options.logBody &&
      !req.body &&
      req.headers &&
      req.headers['content-type'] &&
      req.headers['content-length'] &&
      parseInt(req.headers['content-length']) > 0
    ) {
      // method one of capture request body. split stream.
      var patchPipeToSplitStreamStartTime = Date.now();
      logMessage(options.debug, 'moesifMiddleware', 'request have content but request body is not set, patch pipe to split stream.');
      req._mo_pipe = req.pipe;

      req.pipe = function(writeStream, pipeOpts) {
        var split1 = new PassThrough();
        var split2 = new PassThrough();

        req._mo_pipe(split1);
        req._mo_pipe(split2);

        try {
          logMessage(options.debug, 'moesifMiddleware', 'creating getRawBodyPromise for request body');
          // create getRawBodyPromise here.
          getRawBodyPromise = getRawBody(split1, {
            encoding: contentType.parse(req).parameters.charset
          });
        } catch (err) {
          logMessage(options.debug, 'getRawBody', 'continue with getRawBody error' + err);
        }

        var patchPipeToSplitStreamEndTime = Date.now();
        logMessage(options.debug, 'patchPipeToSplitStream took time ', timeTookInSeconds(patchPipeToSplitStreamStartTime, patchPipeToSplitStreamEndTime));
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

    var responseWriteAppendChunkStartTime = Date.now();

    if (options.logBody) {
      // we only need to patch res.write if we are logBody
      res.write = function(chunk, encoding, callback) {
        logMessage(options.debug, 'response write', 'append chunk=' + chunk);
        resBodyBuf = appendChunk(resBodyBuf, chunk);
        res._mo_write(chunk, encoding, callback);
      };
    }
    var responseWriteAppendChunkEndTime = Date.now();
    logMessage(options.debug, 'responseWriteAppendChunk took time ', timeTookInSeconds(responseWriteAppendChunkStartTime, responseWriteAppendChunkEndTime));

    // Manage to get information from the response too, just like Connect.logger does:
    if (!res._mo_end) {
      logMessage(options.debug, 'moesifMiddleware', '_mo_end is not defined so saving original end.');
      res._mo_end = res.end;
    } else {
      logMessage(options.debug, 'moesifMiddleware', '_mo_end is already defined. Did you attach moesif express twice?');
    }

    // Add TransactionId to the response send to the client
    var addTxIdToResponseStartTime = Date.now();
    let disableTransactionId = options.disableTransactionId ? options.disableTransactionId : false;
    if (!disableTransactionId) {
      let txId = req.headers[TRANSACTION_ID_HEADER] || uuid4();
      // Use setHeader() instead of set() so it works with plain http-module and Express
      res.setHeader(TRANSACTION_ID_HEADER, txId);
    }
    var addTxIdToResponseEndTime = Date.now();
    logMessage(options.debug, 'addTxIdToResponse took time ', timeTookInSeconds(addTxIdToResponseStartTime, addTxIdToResponseEndTime));

    res.end = function(chunk, encoding, callback) {
      var finalBuf = resBodyBuf;

      if (chunk && typeof chunk !== 'function') {
        logMessage(options.debug, 'response end', 'append chunk=' + chunk);
        finalBuf = Buffer.from(appendChunk(resBodyBuf, chunk));
      }

      res._mo_end(chunk, encoding, callback);

      res._endTime = new Date();

      try {
        // if req.body does not exist by koaContext exists.
        if (!req.body && koaContext && options.logBody) {
          try {
            logMessage(options.debug, 'moesifMiddleware', 'try to get koa unparsed body');
            req.body = koaContext.request && (koaContext.request.body || koaContext.request.body[unparsed]);
          } catch(err) {
            logMessage(options.debug, 'moesifMiddleware', 'try to get koa unparsed body failed: ' + err);
          }
        }

        // if req body still does not exists but we can skip get rawBody.
        if (!req.body && getRawBodyPromise && options.logBody) {
          logMessage(options.debug, 'moesifMiddleware', 'req have no body attached and we have handle on getRawBodyPromise');
          getRawBodyPromise
            .then((str) => {
              logMessage(options.debug, 'getRawBodyPromise', 'successful. append request object with raw body: ' + (str && str.length));
              req._moRawBody = str;
              return req;
            })
            .then(() => {
              var logEventAfterGettingRawBodyStartTime = Date.now();
              formatEventDataAndSave(finalBuf, req, res, options, trySaveEventLocal);
              var logEventAfterGettingRawBodyEndTime = Date.now();
              logMessage(options.debug, 'logEventAfterGettingRawBody took time ', timeTookInSeconds(logEventAfterGettingRawBodyStartTime, logEventAfterGettingRawBodyEndTime));
            })
            .catch((err) => {
              logMessage(options.debug, 'getRawBodyPromise', 'error getting rawbody' + err);
            });
        } else {
          // this covers three use cases:
          // case 1: options.logBody is false. doesn't request body doesn't matter.
          // case 2: request.body is already attached to req.body
          // case 3: request.body doesn't exist anyways.
          var logEventWithoutGettingRawBodyStartTime = Date.now();
          formatEventDataAndSave(finalBuf, req, res, options, trySaveEventLocal);
          var logEventWithoutGettingRawBodyEndTime = Date.now();
          logMessage(options.debug, 'logEventWithoutGettingRawBody took time ', timeTookInSeconds(logEventWithoutGettingRawBodyStartTime, logEventWithoutGettingRawBodyEndTime));
        }
      } catch (err) {
        logMessage(options.debug, 'moesifMiddleware', 'error occurred during log event: ' + err);
      }
      //end of patched res.end function
    };

    logMessage(options.debug, 'moesifMiddleware', 'finished, pass on to next().');

    if (next) {
      return next();
    }
  };

  moesifMiddleware.updateUser = function(userModel, cb) {
    const user = new UserModel(userModel);
    logMessage(options.debug, 'updateUser', 'userModel=', userModel);
    ensureValidUserModel(user);
    logMessage(options.debug, 'updateUser', 'userModel valid');
    moesifController.updateUser(user, cb);
  };

  moesifMiddleware.updateUsersBatch = function(usersBatchModel, cb) {
    usersBatch = [];
    for (let userModel of usersBatchModel) {
      usersBatch.push(new UserModel(userModel));
    }
    logMessage(options.debug, 'updateUsersBatch', 'usersBatchModel=', usersBatchModel);
    ensureValidUsersBatchModel(usersBatch);
    logMessage(options.debug, 'updateUsersBatch', 'usersBatchModel valid');
    moesifController.updateUsersBatch(usersBatch, cb);
  };

  moesifMiddleware.updateCompany = function(companyModel, cb) {
    const company = new CompanyModel(companyModel);
    logMessage(options.debug, 'updateCompany', 'companyModel=', companyModel);
    ensureValidCompanyModel(company);
    logMessage(options.debug, 'updateCompany', 'companyModel valid');
    moesifController.updateCompany(company, cb);
  }

  moesifMiddleware.updateCompaniesBatch = function(companiesBatchModel, cb) {
    companiesBatch = [];
    for (let companyModel of companiesBatchModel) {
      companiesBatch.push(new CompanyModel(companyModel));
    }
    logMessage(options.debug, 'updateCompaniesBatch', 'companiesBatchModel=', companiesBatchModel);
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
      function patchLogger(text, jsonObject) {
        logMessage(options.debug, 'outgoing capture', text, jsonObject);
      }
      var recorder = createOutgoingRecorder(trySaveEventLocal, options, patchLogger);
      moesifMiddleware._mo_patch = patch(recorder, patchLogger);
    }
  };

  logMessage(options.debug, 'moesifInitiator', 'returning moesifMiddleware Function');
  return moesifMiddleware;
};
