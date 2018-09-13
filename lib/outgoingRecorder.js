var assign = require('lodash/assign');
var dataUtils = require('./dataUtils');
var moesifapi = require('moesifapi');

var EventModel = moesifapi.EventModel;
var hashSensitive = dataUtils.hashSensitive;

function createMockIncomingRequestResponse(logData) {
  var req = {
    headers: logData.request.headers || {},
    method: logData.request.verb,
    url: logData.request.uri,
    getHeader: function(name) {
      return this.headers[name];
    },
    body: logData.request.body
  };

  var res = {
    headers: logData.response.headers || {},
    statusCode: logData.response.status,
    getHeader: function(name) {
      return this.headers[name];
    },
    body: logData.response.body
  };

  return {
    request: req,
    response: res
  };
}

function _createOutgoingRecorder(moesifController, moesifOptions, logger) {
  return function(capturedData) {
    // apply moesif options:

    // we do this to make the outging request and response look like signature of
    // incoming request and responses, so that the moesif express options (which are designed for incoming request)
    // can be called.
    // and put everything in try block, just in case.
    if (capturedData.request.uri && capturedData.request.uri.includes('moesif.net')) {
      // skip if it is moesif.
      logger('request skipped since it is moesif');
      return;
    }

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
        logData.userId = moesifOptions.identifyUser(mockIncoming.req, mockIncoming.res);
      } catch (err) {}
      try {
        logData.sessionToken = moesifOptions.getSessionToken(mockIncoming.req, mockIncoming.res);
      } catch (err) {}

      try {
        logData.tags = moesifOptions.getTags(mockIncoming.req, mockIncoming.res);
      } catch (err) {}

      try {
        logData.request.apiVerion = moesifOptions.getApiVersion(mockIncoming.req, mockIncoming.res);
      } catch (err) {}
      try {
        logData.metadata = moesifOptions.getMetadata(mockIncoming.req, mockIncoming.res);
      } catch (err) {}

      moesifController.createEvent(new EventModel(logData), function (err) {
        logger('moesif API callback err=');
        logger(JSON.stringify(err));
        if (err) {
          logger('moesif API failed with error.');
          if (moesifOptions.callback) {
            moesifOptions.callback(err, logData);
          }
        } else {
          logger('moesif API succeeded');
          if (moesifOptions.callback) {
            moesifOptions.callback(null, logData);
          }
        }
      });
    }
  };
}

module.exports = _createOutgoingRecorder;