'use strict';
var http = require('http');
var https = require('https');
var dataUtils = require('../lib/dataUtils');
var assert = require('assert');

var RUN_TEST = true;

if (RUN_TEST) {
  describe('test hashSensitive', function() {
    it('test simple hash with passwords', function(done) {
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

  }); // end of describe
}
