'use strict';
var http = require('http');
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

      // function to identify user.
      options.identifyUser =
        options.identifyUser ||
        function() {
          return undefined;
        };

      options.getMetadata =
        options.getMetadata ||
        function() {
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
          return undefined;
        };
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
      options.skip =
        options.skip ||
        function(req, res) {
          return false;
        };

      var recorder = createRecorder(moesifController, options, logger);

      patch(recorder, logger);
    });

    it('test simple http get request is captured', function(done) {
      http.get({
        host: 'jsonplaceholder.typicode.com',
        path: '/posts/1'
      }, function (res) {
        var body = '';
        res.on('data', function(d) {
          body += d;
        });

        res.on('end', function() {
          var parsed = JSON.parse(body);
          console.log(parsed);
          setTimeout(function () {
            // I need make sure the
            // recorder's end is called
            // before this ends.
            done();
          }, 2000);
        });
      })
    });

  });
}
