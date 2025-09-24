/**
 * Created by Xingheng on 10/16/16.
 */

var isNil = require('lodash/isNil');
var moesifapi = require('moesifapi');
var EventModel = moesifapi.EventModel;
var UserModel = moesifapi.UserModel;
var CompanyModel = moesifapi.CompanyModel;
var SubscriptionModel = moesifapi.SubscriptionModel;
var ActionModel = moesifapi.ActionModel;

var dataUtils = require('./dataUtils');
var patch = require('./outgoing');
var createOutgoingRecorder = require('./outgoingRecorder');
var createBatcher = require('./batcher');
var moesifConfigManager = require('./moesifConfigManager');
var uuid4 = require('uuid4');
var unparsed = require('koa-body/unparsed.js');
var ensureValidUtils = require('./ensureValidUtils');
var formatEventDataAndSave = require('./formatEventDataAndSave');
var governanceRulesManager = require('./governanceRulesManager');
const { extractNextJsEventDataAndSave } = require('./nextjsUtils');

// express converts headers to lowercase
const TRANSACTION_ID_HEADER = 'x-moesif-transaction-id';

var logMessage = dataUtils.logMessage;
var timeTookInSeconds = dataUtils.timeTookInSeconds;
var appendChunk = dataUtils.appendChunk;
var totalChunkLength = dataUtils.totalChunkLength;
var ensureToString = dataUtils.ensureToString;
var getReqHeaders = dataUtils.getReqHeaders;

var ensureValidOptions = ensureValidUtils.ensureValidOptions;
var ensureValidUserModel = ensureValidUtils.ensureValidUserModel;
var ensureValidUsersBatchModel = ensureValidUtils.ensureValidUsersBatchModel;
var ensureValidCompanyModel = ensureValidUtils.ensureValidCompanyModel;
var ensureValidCompaniesBatchModel = ensureValidUtils.ensureValidCompaniesBatchModel;
var ensureValidActionModel = ensureValidUtils.ensureValidActionModel;
var ensureValidActionsBatchModel = ensureValidUtils.ensureValidActionsBatchModel;

// default option utility functions.

var noop = function () {}; // implicitly return undefined

var defaultSkip = function (req, res) {
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

/**
 * @typedef {Object} MoesifOptions
 * @property {string} applicationId
 * @property {(req: object, res: object) => string | undefined | null} [identifyUser]
 * @property {(req: object, res: object) => string | undefined | null} [identifyCompany]
 * @property {(req: object, res: object) => string | undefined | null} [getSessionToken]
 * @property {(req: object, res: object) => string | undefined | null} [getApiVersion]
 * @property {(req: object, res: object) => object | undefined | null} [getMetadata]
 * @property {(req: object, res: object) => boolean | undefined | null | any} [skip]
 * @property {(eventModel: object) => object} [maskContent]
 * @property {boolean} [logBody] - default true
 * @property {boolean} [debug]
 * @property {boolean} [noAutoHideSensitive]
 * @property {(error: object) => any} [callback]
 * @property {boolean} [disableBatching]
 * @property {number} [batchSize] - default 200
 * @property {number} [batchMaxTime] - default 2000
 * @property {string} [baseUri] - switch to another collector endpoint when using proxy
 * @property {number} [retry] - must be between 0 to 3 if provided.
 * @property {number} [requestMaxBodySize] - default 100000
 * @property {number} [responseMaxBodySize] - default 100000
 * @property {number} [maxOutgoingTimeout] - default 30000
 * @property {boolean} [isNextJsAppRouter] - default false
 */

/**
 *  @param {MoesifOptions} options
 */
function makeMoesifMiddleware(options) {
  logMessage(options.debug, 'moesifInitiator', 'start');

  var ensureValidOptionsStartTime = Date.now();

  ensureValidOptions(options);

  var ensureValidOptionsEndTime = Date.now();

  logMessage(
    options.debug,
    'ensureValidOptions took time ',
    timeTookInSeconds(ensureValidOptionsStartTime, ensureValidOptionsEndTime)
  );

  // config moesifapi
  var config = moesifapi.configuration;
  /**
   * @type {string}
   */
  config.ApplicationId = options.applicationId || options.ApplicationId;
  config.UserAgent = 'moesif-nodejs/' + '3.10.0';
  config.BaseUri = options.baseUri || options.BaseUri || config.BaseUri;
  // default retry to 1.
  config.retry = isNil(options.retry) ? 1 : options.retry;
  var moesifController = moesifapi.ApiController;

  var logGovernance = function (message, details) {
    logMessage(options.debug, 'governance', message, details);
  };
  governanceRulesManager.setLogger(logGovernance);
  moesifConfigManager.tryGetConfig();
  governanceRulesManager.tryGetRules();

  /**
   * @type {function}
   */
  options.identifyUser = options.identifyUser || defaultIdentifyUser;

  /**
   * @type {function}
   */
  options.identifyCompany = options.identifyCompany || noop;

  // function to add custom metadata (must be an object that can be converted to JSON)
  /**
   * @type {function}
   */
  options.getMetadata = options.getMetadata || noop;

  // function to add custom session token (must be a string)
  options.getSessionToken = options.getSessionToken || noop;

  // function to allow adding of custom tags (this is decprecated - getMetadata should be used instead)
  options.getTags = options.getTags || noop;

  // function to declare the api version used for the request
  /**
   * @type {function}
   */
  options.getApiVersion = options.getApiVersion || noop;

  // logBody option
  var logBody = true;
  if (typeof options.logBody !== 'undefined' && options.logBody !== null) {
    logBody = Boolean(options.logBody);
  }
  /**
   * @type {function}
   */
  options.logBody = logBody;

  // function that allows removal of certain, unwanted fields, before it will be sent to moesif
  options.maskContent =
    options.maskContent ||
    function (eventData) {
      return eventData;
    };

  // function where conditions can be declared, when a request should be skipped and not be tracked by moesif
  options.skip = options.skip || defaultSkip;

  var batcher = null;

  options.batchSize = options.batchSize || 200;
  options.batchMaxTime = options.batchMaxTime || 2000;
  options.requestMaxBodySize = options.requestMaxBodySize || 100000;
  options.responseMaxBodySize = options.responseMaxBodySize || 100000;

  options.maxOutgoingTimeout = options.maxOutgoingTimeout || 30000;

  if (options.disableBatching) {
    batcher = null;
  } else {
    batcher = createBatcher(
      function (eventArray) {
        // start log time batcher took staring here.
        var batcherStartTime = Date.now();
        moesifController.createEventsBatch(
          eventArray.map(function (logData) {
            return new EventModel(logData);
          }),
          function (err, response) {
            var batcherEndTime = Date.now();
            logMessage(
              options.debug,
              'createBatcher took time ',
              timeTookInSeconds(batcherStartTime, batcherEndTime)
            );
            if (err) {
              logMessage(options.debug, 'saveEventsBatch', 'moesif API failed with error: ', err);
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

  var trySaveEventLocal = function (eventData) {
    var trySaveEventLocalStartTime = Date.now();
    var tryGetConfigStartTime = Date.now();
    moesifConfigManager.tryGetConfig();
    governanceRulesManager.tryGetRules();

    var tryGetConfigEndTime = Date.now();
    logMessage(
      options.debug,
      'tryGetConfig took time ',
      timeTookInSeconds(tryGetConfigStartTime, tryGetConfigEndTime)
    );

    if (
      moesifConfigManager.shouldSend(
        eventData && eventData.userId,
        eventData && eventData.companyId
      )
    ) {
      var getSampleRateStartTime = Date.now();
      let sampleRate = moesifConfigManager._getSampleRate(
        eventData && eventData.userId,
        eventData && eventData.companyId
      );
      var getSampleRateEndTime = Date.now();
      logMessage(
        options.debug,
        'getSampleRate took time ',
        timeTookInSeconds(getSampleRateStartTime, getSampleRateEndTime)
      );
      eventData.weight = sampleRate === 0 ? 1 : Math.floor(100 / sampleRate);
      if (batcher) {
        var eventAddedToTheBatchStartTime = Date.now();
        batcher.add(eventData);
        var eventAddedToTheBatchEndTime = Date.now();
        logMessage(
          options.debug,
          'eventAddedToTheBatch took time ',
          timeTookInSeconds(eventAddedToTheBatchStartTime, eventAddedToTheBatchEndTime)
        );
      } else {
        var sendEventStartTime = Date.now();
        var sendEventEndTime;
        moesifController.createEvent(new EventModel(eventData), function (err) {
          logMessage(options.debug, 'saveEvent', 'moesif API callback err=' + err);
          if (err) {
            logMessage(options.debug, 'saveEvent', 'moesif API failed with error.');
            if (options.callback) {
              options.callback(err, eventData);
            }
            sendEventEndTime = Date.now();
            logMessage(
              options.debug,
              'sendSingleEvent took time ',
              timeTookInSeconds(sendEventStartTime, sendEventEndTime)
            );
          } else {
            logMessage(options.debug, 'saveEvent', 'moesif API succeeded');
            if (options.callback) {
              options.callback(null, eventData);
            }
            sendEventEndTime = Date.now();
            logMessage(
              options.debug,
              'sendSingleEvent took time ',
              timeTookInSeconds(sendEventStartTime, sendEventEndTime)
            );
          }
        });
      }
    }
    var trySaveEventLocalEndTime = Date.now();
    logMessage(
      options.debug,
      'trySaveEventLocal took time ',
      timeTookInSeconds(trySaveEventLocalStartTime, trySaveEventLocalEndTime)
    );
  };

  /**
   * @param {object} arg1 - the middleware arguments may vary depends framework
   * @param {any} [arg2]
   * @param {any} [arg3]
   */
  let moesifMiddleware = function (arg1, arg2, arg3) {
    var req = arg1;
    var res = arg2;
    var next = arg3;
    logMessage(options.debug, 'moesifMiddleware', 'start');
    var middleWareStartTime = Date.now();

    var koaContext = null;
    // If Koa context, use correct arguments
    if (arg1.req && arg1.res && arg1.state && arg1.app) {
      logMessage(options.debug, 'moesifMiddleware', 'Using Koa context');
      koaContext = arg1;
      req = koaContext.req;

      // capture request body in case of Koa and in case req body is already set.
      req.body = req.body ? req.body : koaContext.request && koaContext.request.body;

      req.state = koaContext.state;
      res = koaContext.res;
      next = arg3 || arg2;
    }

    req._startTime = new Date();

    if (options.skip(req, res)) {
      logMessage(options.debug, 'moesifMiddleware', 'skipped ' + req.originalUrl);
      if (next) {
        return next();
      }
    }

    // declare getRawBodyPromise here so in scope.
    var getRawBodyPromise;
    var rawReqDataFromEventEmitter;
    var dataEventTracked = false;

    var reqHeaders = getReqHeaders(req);

    // determines if the request is or isn't a multipart/form-data "file" type
    function isMultiPartUpload() {
      const contentTypeHeader = reqHeaders && reqHeaders['content-type'];
      if (!contentTypeHeader) {
        return false;
      } else if (contentTypeHeader.indexOf('multipart/form-data') >= 0) {
        return true;
      }
      return false;
    }

    var multiPartUpload = isMultiPartUpload();

    if (
      options.logBody &&
      !req.body &&
      reqHeaders &&
      reqHeaders['content-type'] &&
      reqHeaders['content-length'] &&
      parseInt(reqHeaders['content-length']) > 0 &&
      //if the request is "multipart/form-data" file type, we do not attempt to capture the body, otherwise we capture it
      !multiPartUpload
    ) {
      // this will attempt to capture body in case body parser or some other body reader is used.
      // by instrumenting the "data" event.
      // notes: in its source code: readable stream pipe (incase of proxy) will also trigger "data" event
      req._mo_on = req.on;
      req.on = function (evt, handler) {
        var passedOnFunction = handler;
        if (evt === 'data' && !dataEventTracked) {
          logMessage(options.debug, 'patched on', 'instrument on data event');
          dataEventTracked = true;
          passedOnFunction = function (chs) {
            logMessage(options.debug, 'req data event', 'chunks=', chs);
            if (totalChunkLength(rawReqDataFromEventEmitter, chs) < options.requestMaxBodySize) {
              rawReqDataFromEventEmitter = appendChunk(rawReqDataFromEventEmitter, chs);
            } else {
              rawReqDataFromEventEmitter =
                '{ "msg": "request body size exceeded options requestMaxBodySize" }';
            }
            handler(chs);
          };
        }
        return req._mo_on(evt, passedOnFunction);
      };

      // this is used if no one ever ever read request data after response ended already.
      getRawBodyPromise = function () {
        return new Promise(function (resolve, reject) {
          logMessage(options.debug, 'getRawBodyPromise executor', 'started');
          var total;

          if (!req.readable) {
            resolve(total);
          }
          req._mo_on('data', function (chs) {
            if (totalChunkLength(total, chs) < options.requestMaxBodySize) {
              total = appendChunk(total, chs);
            } else {
              total = '{ "msg": "request body size exceeded options requestMaxBodySize" }';
            }
          });
          req._mo_on('error', function (err) {
            logMessage(options.debug, 'getRawBodyPromise executor', 'error reading request body');
            resolve('{ "msg": "error reading request body"}');
          });
          req._mo_on('end', function () {
            resolve(total);
          });
          // a fail safe to always exit
          setTimeout(function () {
            resolve(total);
          }, 1000);
        });
      };
    }

    // Manage to get information from the response too, just like Connect.logger does:
    res._mo_write = res.write;
    var resBodyBuf;
    var resBodyBufLimitedExceeded;

    var responseWriteAppendChunkStartTime = Date.now();

    if (options.logBody) {
      // we only need to patch res.write if we are logBody
      res.write = function (chunk, encoding, callback) {
        logMessage(options.debug, 'response write', 'append chunk=' + chunk);
        if (
          !resBodyBufLimitedExceeded &&
          totalChunkLength(resBodyBuf, chunk) < options.responseMaxBodySize
        ) {
          resBodyBuf = appendChunk(resBodyBuf, chunk);
        } else {
          resBodyBufLimitedExceeded = true;
        }
        res._mo_write(chunk, encoding, callback);
      };
    }
    var responseWriteAppendChunkEndTime = Date.now();
    logMessage(
      options.debug,
      'responseWriteAppendChunk took time ',
      timeTookInSeconds(responseWriteAppendChunkStartTime, responseWriteAppendChunkEndTime)
    );

    // Manage to get information from the response too, just like Connect.logger does:
    if (!res._mo_end) {
      logMessage(
        options.debug,
        'moesifMiddleware',
        '_mo_end is not defined so saving original end.'
      );
      res._mo_end = res.end;
    } else {
      logMessage(
        options.debug,
        'moesifMiddleware',
        '_mo_end is already defined. Did you attach moesif express twice?'
      );
    }

    // Add TransactionId to the response send to the client
    var addTxIdToResponseStartTime = Date.now();
    let disableTransactionId = options.disableTransactionId ? options.disableTransactionId : false;
    if (!disableTransactionId) {
      let txId = reqHeaders[TRANSACTION_ID_HEADER] || dataUtils.generateUUIDv4();
      // Use setHeader() instead of set() so it works with plain http-module and Express
      res.setHeader(TRANSACTION_ID_HEADER, txId);
    }
    var addTxIdToResponseEndTime = Date.now();
    logMessage(
      options.debug,
      'addTxIdToResponse took time ',
      timeTookInSeconds(addTxIdToResponseStartTime, addTxIdToResponseEndTime)
    );

    res.end = function (chunk, encoding, callback) {
      var finalBuf = resBodyBuf;

      if (chunk && typeof chunk !== 'function' && options.logBody) {
        logMessage(options.debug, 'response end', 'append chunk', chunk);
        if (
          !resBodyBufLimitedExceeded &&
          totalChunkLength(resBodyBuf, chunk) < options.responseMaxBodySize
        ) {
          finalBuf = appendChunk(resBodyBuf, chunk);
        } else {
          finalBuf = '{ "msg": "response.body.length exceeded options responseMaxBodySize of "}';
        }
      }

      res._mo_end(chunk, encoding, callback);

      res._endTime = new Date();

      try {
        // if req.body does not exist by koaContext exists try to extract body
        if (!req.body && koaContext && options.logBody) {
          try {
            logMessage(options.debug, 'moesifMiddleware', 'try to get koa unparsed body');
            req.body =
              koaContext.request && (koaContext.request.body || koaContext.request.body[unparsed]);
          } catch (err) {
            logMessage(
              options.debug,
              'moesifMiddleware',
              'try to get koa unparsed body failed: ' + err
            );
          }
        }

        if (!req.body && rawReqDataFromEventEmitter && options.logBody) {
          logMessage(
            options.debug,
            'moesifMiddleware',
            'rawReqDatFromEventEmitter exists, getting body from it'
          );
          req._moRawBody = rawReqDataFromEventEmitter;
        }

        // if req body or rawReqBody still does not exists but we can getRawBodyPromise.
        if (!req.body && !req._moRawBody && getRawBodyPromise && options.logBody) {
          logMessage(
            options.debug,
            'moesifMiddleware',
            'req have no body attached and we have handle on getRawBodyPromise'
          );
          // at this point, the response already ended.
          // if no one read the request body, we can consume the stream.
          getRawBodyPromise()
            .then((str) => {
              logMessage(
                options.debug,
                'getRawBodyPromise',
                'successful. append request object with raw body: ' + (str && str.length)
              );
              req._moRawBody = str;
              return req;
            })
            .then(() => {
              var logEventAfterGettingRawBodyStartTime = Date.now();
              formatEventDataAndSave(finalBuf, req, res, options, trySaveEventLocal);
              var logEventAfterGettingRawBodyEndTime = Date.now();
              logMessage(
                options.debug,
                'logEventAfterGettingRawBody took time ',
                timeTookInSeconds(
                  logEventAfterGettingRawBodyStartTime,
                  logEventAfterGettingRawBodyEndTime
                )
              );
            })
            .catch((err) => {
              logMessage(options.debug, 'getRawBodyPromise', 'error getting rawbody' + err);
            });
        } else {
          // this covers three use cases:
          // case 1: options.logBody is false. request body doesn't matter.
          // case 2: request.body is already attached to req.body
          // case 3: request.body doesn't exist anyways.
          var logEventWithoutGettingRawBodyStartTime = Date.now();
          formatEventDataAndSave(finalBuf, req, res, options, trySaveEventLocal);
          var logEventWithoutGettingRawBodyEndTime = Date.now();
          logMessage(
            options.debug,
            'logEventWithoutGettingRawBody took time ',
            timeTookInSeconds(
              logEventWithoutGettingRawBodyStartTime,
              logEventWithoutGettingRawBodyEndTime
            )
          );
        }
      } catch (err) {
        logMessage(options.debug, 'moesifMiddleware', 'error occurred during log event: ' + err);
        logMessage(options.debug, 'moesifMiddleware', 'stack trace \n' + err.stack);
        if (options.callback) {
          options.callback(err);
        }
      }
      //end of patched res.end function
    };

    if (governanceRulesManager.hasRules()) {
      var governedResponseHolder = governanceRulesManager.governRequest(
        moesifConfigManager._config,
        // this may cause identifyUser and identifyCompany to be called twice,
        // but this should be ok, but in order to block for governance rule
        // we have to trigger this earlier in the stream before response might be ready
        ensureToString(options.identifyUser(req, res)),
        ensureToString(options.identifyCompany(req, res)),
        req
      );
      // always add the headers if exists in case of non blocking rules that
      // just add headers.
      if (governedResponseHolder.headers) {
        Object.entries(governedResponseHolder.headers).forEach(function (entry) {
          var headerKey = entry[0];
          var headerVal = entry[1];
          res.setHeader(headerKey, headerVal);
        });
      }

      if (governedResponseHolder.blocked_by) {
        res._mo_blocked_by = governedResponseHolder.blocked_by;
        res._mo_blocked_body = governedResponseHolder.body;

        res.statusCode = governedResponseHolder.status;
        res.end(JSON.stringify(governedResponseHolder.body));
      }
    }

    var middleWareEndTime = Date.now();
    logMessage(options.debug, 'moesifMiddleware', 'finished, pass on to next().');
    logMessage(
      options.debug,
      'moesifMiddleware took time ',
      timeTookInSeconds(middleWareStartTime, middleWareEndTime)
    );

    // do not trigger next in middleware chain if it is already blocked.
    if (next && !res._mo_blocked_by) {
      return next();
    }
  };

  if (options.isNextJsAppRouter) {
    // this is special handler for nextJS
    moesifMiddleware = function (handler) {
      return async function (request, context) {
        // if we need to log requestBody we need to clone it.
        const requestTime = new Date().toISOString();
        let requestForLogging = options?.logBody ? request.clone() : request;

        const response = await handler(request, context);

        if (!options.disableTransactionId) {
          let txId = request.headers.get(TRANSACTION_ID_HEADER) || dataUtils.generateUUIDv4();
          response.headers.set(TRANSACTION_ID_HEADER, txId);
        }

        let responseForLogging = options?.logBody ? response.clone() : response;
        const responseTime = new Date().toISOString();
        extractNextJsEventDataAndSave({
          request: requestForLogging,
          requestTime,
          response: responseForLogging,
          responseTime,
          options,
          saveEvent: trySaveEventLocal
        });

        return response;
      };
    };
  }
  /**
   * @param {object} userModel - https://www.moesif.com/docs/api?javascript--nodejs#update-a-user
   * @param {function} [cb]
   */
  moesifMiddleware.updateUser = function (userModel, cb) {
    var user = new UserModel(userModel);
    logMessage(options.debug, 'updateUser', 'convertedUserObject=', user);
    ensureValidUserModel(user);
    logMessage(options.debug, 'updateUser', 'userModel valid');
    if (cb) {
      moesifController.updateUser(user, cb);
    } else {
      return new Promise(function (resolve, reject) {
        moesifController.updateUser(user, function (err, response) {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  /**
   * @param {object[]} usersBatchModel
   * @param {function} [cb]
   */
  moesifMiddleware.updateUsersBatch = function (usersBatchModel, cb) {
    var usersBatch = [];
    for (var userModel of usersBatchModel) {
      usersBatch.push(new UserModel(userModel));
    }
    logMessage(options.debug, 'updateUsersBatch', 'convertedUserArray=', usersBatch);
    ensureValidUsersBatchModel(usersBatch);
    logMessage(options.debug, 'updateUsersBatch', 'usersBatchModel valid');
    if (cb) {
      moesifController.updateUsersBatch(usersBatch, cb);
    } else {
      return new Promise(function (resolve, reject) {
        moesifController.updateUsersBatch(usersBatch, function (err, response) {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  /**
   * @param {object} companyModel - https://www.moesif.com/docs/api?javascript--nodejs#companies
   * @param {function} [cb]
   */
  moesifMiddleware.updateCompany = function (companyModel, cb) {
    var company = new CompanyModel(companyModel);
    logMessage(options.debug, 'updateCompany', 'convertedCompany=', company);
    ensureValidCompanyModel(company);
    logMessage(options.debug, 'updateCompany', 'companyModel valid');
    if (cb) {
      moesifController.updateCompany(company, cb);
    } else {
      return new Promise(function (resolve, reject) {
        moesifController.updateCompany(company, function (err, response) {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  /**
   * @param {object[]} companiesBatchModel
   * @param {function} [cb]
   */
  moesifMiddleware.updateCompaniesBatch = function (companiesBatchModel, cb) {
    var companiesBatch = [];
    for (var companyModel of companiesBatchModel) {
      companiesBatch.push(new CompanyModel(companyModel));
    }
    logMessage(options.debug, 'updateCompaniesBatch', 'convertedCompaniesArray=', companiesBatch);
    ensureValidCompaniesBatchModel(companiesBatch);
    logMessage(options.debug, 'updateCompaniesBatch', 'companiesBatchModel valid');

    if (cb) {
      moesifController.updateCompaniesBatch(companiesBatch, cb);
    } else {
      return new Promise(function (resolve, reject) {
        moesifController.updateCompaniesBatch(companiesBatch, function (err, response) {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  moesifMiddleware.updateSubscription = function (subscriptionModel, cb) {
    var subscription = new SubscriptionModel(subscriptionModel);
    logMessage(options.debug, 'updateSubscription', 'convertedSubscription=', subscription);
    if (cb) {
      moesifController.updateSubscription(subscription, cb);
    } else {
      return new Promise(function (resolve, reject) {
        moesifController.updateSubscription(subscription, function (err, response) {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  moesifMiddleware.updateSubscriptionsBatch = function (subscriptionBatchModel, cb) {
    var subscriptionsBatch = [];
    for (var subscriptionModel of subscriptionBatchModel) {
      subscriptionsBatch.push(new SubscriptionModel(subscriptionModel));
    }
    logMessage(
      options.debug,
      'updateSubscriptionsBatch',
      'convertedSubscriptionsArray=',
      subscriptionsBatch
    );
    if (cb) {
      moesifController.updateSubscriptionsBatch(subscriptionsBatch, cb);
    } else {
      return new Promise(function (resolve, reject) {
        moesifController.updateSubscriptionsBatch(subscriptionsBatch, function (err, response) {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  /**
   * @param {object} actionModel - https://www.moesif.com/docs/api?javascript--nodejs#track-a-custom-action
   * @param {function} [cb]
   */
  moesifMiddleware.sendAction = function (actionModel, cb) {
    var action = new ActionModel(actionModel);
    logMessage(options.debug, 'sendAction', 'convertedActionObject=', action);
    ensureValidActionModel(action);
    logMessage(options.debug, 'sendAction', 'actionModel valid');
    if (cb) {
      moesifController.sendAction(action, cb);
    } else {
      return new Promise(function (resolve, reject) {
        moesifController.sendAction(action, function (err, response) {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  /**
   * @param {object[]} actionsBatchModel
   * @param {function} [cb]
   */
  moesifMiddleware.sendActionsBatch = function (actionsBatchModel, cb) {
    var actionsBatch = [];
    for (let action of actionsBatchModel) {
      actionsBatch.push(new ActionModel(action));
    }

    logMessage(options.debug, 'sendActionsBatch', 'convertedActionArray=', actionsBatch);
    ensureValidActionsBatchModel(actionsBatchModel);
    logMessage(options.debug, 'sendActionsBatch', 'actionsBatchModel valid');

    if (cb) {
      moesifController.sendActionsBatch(actionsBatch, cb);
    } else {
      return new Promise(function (resolve, reject) {
        moesifController.sendActionsBatch(actionsBatch, function (err, response) {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  moesifMiddleware.startCaptureOutgoing = function () {
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
      moesifMiddleware._mo_patch = patch(recorder, patchLogger, options);
    }
  };

  logMessage(options.debug, 'moesifInitiator', 'returning moesifMiddleware Function');
  return moesifMiddleware;
}

module.exports = makeMoesifMiddleware;
