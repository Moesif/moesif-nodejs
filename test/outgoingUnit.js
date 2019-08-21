'use strict';
var http = require('http');
var https = require('https');
var patch = require('../lib/outgoing');

var RUN_TEST = true;

if (RUN_TEST) {
  describe('unit test capture outgoing http requests', function() {
    before(function() {
      var logger = function(str) {
        console.log('[logger]: ' + str);
      };
      var recorder = function(logData) {
        console.log('recorder is called');
        console.log(JSON.stringify(logData, null, '  '));
      };
      patch(recorder, logger);
    });

    it('test simple http get request is captured', function(done) {
      https.get({
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
          }, 500);
        });
      })
    });
  });
}
