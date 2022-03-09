'use strict';
var http = require('http');
var https = require('https');
var dataUtils = require('../lib/dataUtils');
var assert = require('assert');

var RUN_TEST = true;

if (RUN_TEST) {
  describe('test data utils', function () {
    it('test simple hash sensitive with passwords', function (done) {
      const testData = {
        blah: '123421',
        stuff: [
          {
            password1: '12342DIOSDLDS'
          },
          {
            password2: 'Adsfdsadf23432431234123A'
          }
        ],
        pass: '12341241'
      };

      const hashedValue = dataUtils.hashSensitive(testData);
      console.log(testData);
      console.log(hashedValue);

      assert(hashedValue.stuff[0].password1 !== testData.stuff[0].password1);
      assert(hashedValue.stuff[1].password2 !== testData.stuff[1].password2);
      assert(hashedValue.pass === testData.pass);
      done();
    }); // end of test simp

    it('test computeBodySize', function () {
      const body = {
        random: '22505296759'
      };

      console.log('size of json: ' + dataUtils.computeBodySize(body));
    });

    it('test safeJsonParse', function () {
      var nonPlainObject = new Map();
      nonPlainObject.set('a', 1);
      nonPlainObject.set('b', 2);

      var nonPlainObject2 = {
        abc: 'foo',
        stuff: function () {
          console.log('hello');
        }
      }

      var arrayWithNonPlainObjects = [{}, new Map(), { abc: 12 }, function() { console.log('hello'); } ];

      var function2 = function() {
        console.log('helloworld');
      }

      var arrayOfPlainObjects = [{ a: 1234}, { b: 'abc'}];
      console.log('test non plain object');
      console.log(JSON.stringify(dataUtils.safeJsonParse(nonPlainObject)));
      console.log('test plain object with function as property');
      console.log(JSON.stringify(dataUtils.safeJsonParse(nonPlainObject2)));
      console.log('test array with non plain objects');
      console.log(JSON.stringify(dataUtils.safeJsonParse(arrayWithNonPlainObjects)));
      console.log('test array with all plain objects');
      console.log(JSON.stringify(dataUtils.safeJsonParse(arrayOfPlainObjects)));
      console.log('test number');
      console.log(JSON.stringify(dataUtils.safeJsonParse(123432)));
      console.log('test boolean');
      console.log(JSON.stringify(dataUtils.safeJsonParse(true)));
      console.log('test array of numbers');
      console.log(JSON.stringify(dataUtils.safeJsonParse([1, 2, 3, 4, 5])));
      console.log('test null');
      console.log(JSON.stringify(dataUtils.safeJsonParse(null)));
      console.log('test undefined');
      console.log(JSON.stringify(dataUtils.safeJsonParse(undefined)));
      console.log('test function');
      console.log(JSON.stringify(dataUtils.safeJsonParse(function2)));
    });
  }); // end of describe
}
