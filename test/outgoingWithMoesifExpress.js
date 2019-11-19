'use strict';
var http = require('http');
var https = require('https');
var patch = require('../lib/outgoing');
var moesifExpress = require('../lib');
var _ = require('lodash');

var RUN_TEST = true;

if (RUN_TEST) {
  describe('test capture using actual moesif express attached api', function() {
    this.timeout(9000);

    before(function() {
      var options = {
        debug: false,
        applicationId:'Your Moesif Application Id'
      };
      // function to identify user.
      options.identifyUser =
        options.identifyUser ||
        function() {
          return undefined;
        };

      options.logBody = true;

      options.getMetadata =
        options.getMetadata ||
        function(req, res) {
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

      var middleware = moesifExpress(options);
      middleware.startCaptureOutgoing();
    });

    it('test simple http get request is captured', function(done) {
      https.get(
        {
          host: 'jsonplaceholder.typicode.com',
          path: '/posts/1'
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
              // recorder's end is called
              // before this ends.
              done();
            }, 2000);
          });
        }
      );
    });
  });
}
