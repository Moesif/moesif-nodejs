'use strict';
var http = require('http');
var https = require('https');
var moesifapi = require('moesifapi');
var patch = require('../lib/outgoing');
var createRecorder = require('../lib/outgoingRecorder');

var RUN_TEST = true;

if (RUN_TEST) {
  describe('test capture using actual moesif api', function() {
    this.timeout(9000);

    before(function() {
      var config = moesifapi.configuration;
      config.ApplicationId = '';
      // config.BaseUri = options.baseUri || options.BaseUri || config.BaseUri;
      var moesifController = moesifapi.ApiController;
      var logger = function(text) {
        console.log('[test logger]:' + text);
      };

      var options = {};

      options.identifyUser =
        options.identifyUser ||
        function() {
          return undefined;
        };

      options.identifyCompany =
      options.identifyCompany ||
      function() {
        return undefined;
      };

      options.logBody = true;

      options.getMetadata =
        options.getMetadata ||
        function(req, res) {
          console.log('test get metadata is called');
          console.log(JSON.stringify(req.headers));
          console.log(JSON.stringify(res.headers));
          console.log(res.getHeader('Date'));
          console.log(res.getHeader('date'));
          return undefined;
        };

      options.getSessionToken =
        options.getSessionToken ||
        function() {
          return undefined;
        };
      options.getTags =
        options.getTags ||
        function() {
          return undefined;
        };
      options.getApiVersion =
        options.getApiVersion ||
        function() {
          return '123,523';
        };
      options.maskContent =
        options.maskContent ||
        function(eventData) {
          return eventData;
        };
      options.ignoreRoute = function() {
        return false;
      };
      options.skip =
        options.skip ||
        function(req, res) {
          return false;
        };

      var trySaveEventLocal = function(eventData) {
        moesifController.createEvent(new moesifapi.EventModel(eventData), function(err) {
          console.log('moesif API callback err=' + err);
          if (err) {
            console.log('moesif API failed with error.');
            if (options.callback) {
              options.callback(err, eventData);
            }
          } else {
              console.log('moesif API succeeded');
            if (options.callback) {
              options.callback(null, eventData);
            }
          }
        });
      };

      var recorder = createRecorder(trySaveEventLocal, options, logger);

      var unpatch = patch(recorder, logger);
      console.log('patched successfully, return value of patch is');
      console.log(unpatch);
    });

    it('test a non json string body', function(done) {
      var req = http.request(
        {
          method: 'POST',
          host: 'jsonplaceholder.typicode.com',
          path: '/posts'
        },
        function(res) {
          var body = '';
          res.on('data', function(d) {
            body += d;
          });

          res.on('end', function() {
            var parsed = JSON.parse(body);
            console.log(parsed);
            setTimeout(function() {
              // I need make sure the
              // recorder's end is triggered
              // before this ends.
              done();
            }, 500);
          });
        }
      );

      req.write('not a json');

      req.end();
    });

    // end of describe
  });
}
