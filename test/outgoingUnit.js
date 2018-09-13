'use strict';
var http = require('http');
var https = require('https');
var patch = require('../lib/outgoing');

var RUN_TEST = false;

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

    // it('test a simple http post captured properly', function(done) {
    //   var req = https.request({
    //     method: 'POST',
    //     host: 'jsonplaceholder.typicode.com',
    //     path: '/posts'
    //   }, function (res) {
    //     var body = '';
    //     res.on('data', function(d) {
    //       body += d;
    //     });

    //     res.on('end', function() {
    //       var parsed = JSON.parse(body);
    //       console.log(parsed);
    //       setTimeout(function () {
    //         // I need make sure the
    //         // recorder's end is called
    //         // before this ends.
    //         done();
    //       }, 500);
    //     });
    //   });

    //   req.write(JSON.stringify({
    //     title: 'foo',
    //     body: 'bar',
    //     userId: 1
    //   }));

    //   req.end();
    // });

    // it('test a simple http del captured properly', function(done) {
    //   var options = {
    //     host: 'jsonplaceholder.typicode.com',
    //     path: '/posts/2',
    //     method: 'DELETE',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     }
    //   };

    //   var myrequest = http.request(options, function (res) {
    //     var body = '';
    //     res.on('data', function(d) {
    //       body += d;
    //     });

    //     res.on('end', function() {
    //       var parsed = JSON.parse(body);
    //       console.log(parsed);
    //       setTimeout(function () {
    //         // I need make sure the
    //         // recorder's end is called
    //         // before this ends.
    //         done();
    //       }, 500);
    //     });
    //   });

    //   myrequest.end();
    // });

    // it('test a simple http patch captured properly', function(done) {
    //   var options = {
    //     host: 'jsonplaceholder.typicode.com',
    //     path: '/posts/3',
    //     method: 'PATCH',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     }
    //   };

    //   var myrequest = http.request(options, function (res) {
    //     var body = '';
    //     res.on('data', function(d) {
    //       body += d;
    //     });

    //     res.on('end', function() {
    //       var parsed = JSON.parse(body);
    //       console.log(parsed);
    //       setTimeout(function () {
    //         // I need make sure the
    //         // recorder's end is called
    //         // before this ends.
    //         done();
    //       }, 500);
    //     });
    //   });

    //   myrequest.write(JSON.stringify({
    //     title: 'food'
    //   }));

    //   myrequest.end();
    // });

    // it('test a patch a simple post requests', function(done) {
    //   var myrequest = http.request({
    //     host: 'jsonplaceholder.typicode.com',
    //     path: '/posts/2'
    //   }, function (response) {
    //     console.log('in response callback');
    //     // response.on('response', function (d) {
    //     //   console.log('on response');
    //     //   console.log(d);
    //     // })
    //     response.on('data', function (d) {
    //       console.log('on data 1');
    //       console.log(d);
    //       console.log('' + d);
    //     })

    //     response.on('data', function (d) {
    //       console.log('on data 2 is called');
    //       console.log(d);
    //       console.log('' + d);
    //     })

    //     response.on('end', function(data) {
    //       console.log('response headers');
    //       console.log(response.headers);
    //       console.log(data);
    //       // done();
    //     });
    //     response.on('error', function(err) {
    //       console.log('error');
    //       console.log(err);
    //       // done();
    //     })

    //     response.on('close', function(d) {
    //       console.log('close on response is called');
    //       done();
    //     })
    //   });

    //   myrequest.end();
    //   myrequest.on('close', function() {
    //     console.log('done with third request');
    //     done();
    //   });

    // });

    // it('test a http post aborted', function(done) {
    //   var req = http.request(
    //     {
    //       method: 'POST',
    //       host: 'jsonplaceholder.typicode.com',
    //       path: '/posts'
    //     },
    //     function(res) {
    //       var body = '';
    //       res.on('data', function(d) {
    //         body += d;
    //       });

    //       res.on('end', function() {
    //         var parsed = JSON.parse(body);
    //         console.log(parsed);
    //         setTimeout(function() {
    //           // I need make sure the
    //           // recorder's end is triggered
    //           // before this ends.
    //           done();
    //         }, 500);
    //       });
    //     }
    //   );

    //   req.write(
    //     JSON.stringify({
    //       title: 'foo',
    //       body: 'bar',
    //       userId: 1
    //     })
    //   );

    //   req.end();

    //   setTimeout(function() {
    //     console.log('about to call abort');
    //     req.abort();
    //   }, 100);
    // });
    // end of describe
  });
}
