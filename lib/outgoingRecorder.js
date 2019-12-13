var assign = require('lodash/assign');
var dataUtils = require('./dataUtils');
var moesifapi = require('moesifapi');

var EventModel = moesifapi.EventModel;
var hashSensitive = dataUtils.hashSensitive;

function createMockIncomingRequestResponse(logData) {
  var getHeader = function(name) {
    var lowerCaseName = typeof name === 'string' && name.toLowerCase();
    return this.headers[name] || this.headers[lowerCaseName];
  };
  var req = {
    _mo_mocked: true,
    headers: logData.request.headers || {},
    method: logData.request.verb,
    url: logData.request.uri,
    getHeader: getHeader,
    get: getHeader,
    body: logData.request.body
  };

  var res = {
    _mo_mocked: true,
    headers: logData.response.headers || {},
    statusCode: logData.response.status,
    getHeader: getHeader,
    get: getHeader,
    body: logData.response.body
  };

  return {
    request: req,
    response: res
  };
}

function _createOutgoingRecorder(saveEvent, moesifOptions, logger) {
  return function(capturedData) {

    // Already have more comprehensive short circuit upstream.
    // so comment below check.
    // if (capturedData.request.uri && capturedData.request.uri.includes('moesif.net')) {
    //   // skip if it is moesif.
    //   logger('request skipped since it is moesif');
    //   return;
    // }

    // apply moesif options:

    // we do this to make the outging request and response look like signature of
    // incoming request and responses, so that the moesif express options (which are designed for incoming request)
    // can be called.
    // and put everything in try block, just in case.
    var mock = createMockIncomingRequestResponse(capturedData);

    var logData = assign({}, capturedData);

    if (!moesifOptions.skip(mock.request, mock.response)) {
      if (!moesifOptions.noAutoHideSensitive) {
        // autoHide
        try {
          logData.request.headers = hashSensitive(logData.request.headers, moesifOptions.debug);
          logData.request.body = hashSensitive(logData.request.body, moesifOptions.debug);
          logData.response.headers = hashSensitive(logData.response.headers, moesifOptions.debug);
          logData.response.body = hashSensitive(logData.response.body, moesifOptions.debug);
        } catch (err) {
          logger('error on hashSensitive err=' + err);
        }
      }

      logData = moesifOptions.maskContent(logData);

      try {
        logData.userId = moesifOptions.identifyUser(mock.request, mock.response);
      } catch (err) {
        logger('error identify user:' + err);
      }

      try {
        logData.companyId = moesifOptions.identifyCompany(mock.request, mock.response);
      } catch (err) {
        logger('error identifying company:' + err);
      }

      try {
        logData.sessionToken = moesifOptions.getSessionToken(mock.request, mock.response);
      } catch (err) {
        logger('error getSessionToken' + err);
      }

      try {
        logData.tags = moesifOptions.getTags(mock.request, mock.response);
      } catch (err) {
        logger('error getTags' + err);
      }

      try {
        logData.request.apiVersion = moesifOptions.getApiVersion(mock.request, mock.response);
      } catch (err) {

      }

      try {
        logData.metadata = moesifOptions.getMetadata(mock.request, mock.response);
      } catch (err) {
        logger('error adding metadata:' + err);
      }

      // logBody option
      if (!moesifOptions.logBody) {
        logData.request.body = null;
        logData.response.body = null;
      }

      // Set API direction
      logData.direction = "Outgoing"

      logger('queueing event to be sent to Moesif');
      logger(JSON.stringify(logData));

      // moesifController.createEvent(new EventModel(logData), function(err) {
      //   if (err) {
      //     logger('moesif API failed with error.');
      //     logger(JSON.stringify(err));
      //     if (moesifOptions.callback) {
      //       moesifOptions.callback(err, logData);
      //     }
      //   } else {
      //     logger('moesif API succeeded');
      //     if (moesifOptions.callback) {
      //       moesifOptions.callback(null, logData);
      //     }
      //   }
      // });
      saveEvent(logData);
    }
  };
}

module.exports = _createOutgoingRecorder;