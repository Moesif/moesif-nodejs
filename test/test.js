/**
 * Created by Xingheng on 10/13/16.
 */

var assert = require('assert');
var util = require('util');

var mocks = require('node-mocks-http');
var Promise = require('promise/lib/es6-extensions');
var should = require('should');
var expect = require('chai').expect;
var _ = require('lodash');
var moesifExpress = require('../lib');

var TEST_API_SECRET_KEY = 'eyJhcHAiOiIzNjU6NiIsInZlciI6IjIuMCIsIm9yZyI6IjM1OTo0IiwiaWF0IjoxNDczMzc5MjAwfQ.9WOx3D357PGMxrXzFm3pV3IzJSYNsO4oRudiMI8mQ3Q';

function mockReq(reqMock) {
  var reqSpec = _.extend({
    method: 'GET',
    url: '/hello',
    host: 'localhost:3000',
    protocol: 'http',
    headers: {
      'header1': 'value 1'
    },
    get: function (key) {
      switch (key) {
        case 'host':
          return 'localhost:3000';
        default:
          return 'blahblah';
      }
    },
    ip: '127.0.0.1',
    query: {
      val: '1'
    },
    params: {
      id: 20
    }
  }, reqMock);

  return mocks.createRequest(reqSpec);
}

function mockRes() {
  var res = mocks.createResponse();
  res.status(200);
  return res;
}


function loggerTestHelper(providedOptions, moesifOptions) {
  var options = _.extend({
    loggerOptions: null,
    req: null,
    res: null,
    next: function (req, res, next) {
      res.end('{ "msg": "ok."}');
    }
  }, providedOptions);

  var req = mockReq(options.req);
  var res = _.extend(mockRes(), options.res);


  return new Promise(function (resolve, reject) {
    var moesifMiddleWareOptions = _.extend({
      applicationId: TEST_API_SECRET_KEY,
      callback: function(err, logData) {
        if (err) {
          reject(err);
        } else {
          resolve(logData);
        }
      }
    }, moesifOptions);

    var middleware = moesifExpress(moesifMiddleWareOptions);

    middleware(req, res, function(_req, _res, next) {
      options.next(req, res, next);
      //resolve(result);
    });

  });
}

describe('moesif-express', function () {
  describe('fail cases', function () {
    it('throw an error when not provided an application id.', function () {
      expect(function () {
        moesifExpress({})
      }).to.throw(Error);
    });

    it('throw an error when identifyUser is not a function', function () {
      expect(function () {
        moesifExpress({
          applicationId: TEST_API_SECRET_KEY,
          identifyUser: 'abc'
        })
      }).to.throw(Error);
    });
  });



  describe('success cases', function () {
    it('middleware should be function that takes 3 arguments', function() {
      expect(moesifExpress({applicationId: TEST_API_SECRET_KEY}).length).to.equal(3);
    });

    it('test one successful submission', function() {
      function next(req, res, next) {
        res.end();
      }

      var testHelperOptions = {
        next: next,
        req: {
          body: {},
          url: '/hello'
        },
      };
      return loggerTestHelper(testHelperOptions).then(function (result) {
        expect(result.response).to.exist;
        expect(result.request).to.exist;
        // console.log('result in tester is:' + JSON.stringify(result, null, '  '));
      });

    });


    it('test moesif with body', function () {
      function next(req, res, next) {
        res.end('{"bodycontent1": "bodycontent1"}');
      }

      var testHelperOptions = {
        next: next,
        req: {
          body: {},
          url: '/hello'
        }
      };

      return loggerTestHelper(testHelperOptions).then(function (result) {
        expect(result.response.body).to.equal('{"bodycontent1": "bodycontent1"}');
      });
    });

    it('test moesif with identifyUser function', function () {
      function next(req, res, next) {
        res.end();
      }

      var testHelperOptions = {
        next: next,
        req: {
          body: {},
          url: '/hello'
        }
      };

      var testMoesifOptions = {
        applicationId: TEST_API_SECRET_KEY,
        identifyUser: function (_req, _res) {
          return 'abc';
        }
      };

      return loggerTestHelper(testHelperOptions, testMoesifOptions).then(function (result) {
        expect(result.userId).to.equal('abc');
      });
    });


    it('test moesif with maskContent function', function () {
      function next(req, res, next) {
        res.end();
      }

      var testHelperOptions = {
        next: next,
        req: {
          headers: {
            'header1': 'value 1',
            'header2': 'value 2',
            'header3': 'value 3'
          },
          body: {},
          url: '/hello'
        }
      };

      var testMoesifOptions = {
        applicationId: TEST_API_SECRET_KEY,
        maskContent: function (_logData) {
          var maskedLogData = _.extend({}, _logData);
          maskedLogData.request.headers.header1 = undefined;
          return maskedLogData;
        }
      };

      return loggerTestHelper(testHelperOptions, testMoesifOptions).then(function (result) {
        expect(result.request.headers.header1).to.not.exist;
        expect(result.request.headers.header2).to.equal('value 2');
      });
    });
  });

});
