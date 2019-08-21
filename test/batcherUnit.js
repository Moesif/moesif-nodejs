'use strict';
var assert = require('assert');
var creatBatcher = require('../lib/batcher');


var RUN_TEST = true;

if (RUN_TEST) {
  describe('unit test for batcher module', function() {
    this.timeout(10000);

    it('simple batch triggered by size', function(done) {
      var batcher = creatBatcher(function(dataArray) {
        console.log(dataArray);
        assert(dataArray.length === 3);
        done();
      }, 3, 10000);

      batcher.add('2');
      batcher.add('1352');
      batcher.add('523');
      batcher.add('523423');
    }); // end of it

    it('simple batch triggered bu maxtime.', function(done) {
      var batcher = creatBatcher(function(dataArray) {
        console.log(dataArray);
        assert(dataArray.length === 1);
        done();
      }, 3, 1000);

      batcher.add('2');
    }); // end of it



    it('batch triggered by size 3 times, and then triggered by time', function(done) {
      var triggerCount = 0;
      var batcher = creatBatcher(function(dataArray) {
        console.log('batcher triggered:' + triggerCount);
        console.log(dataArray);

        if (triggerCount === 0) {
          assert(dataArray.length === 3);
        }
        if (triggerCount === 1) {
          assert(dataArray.length === 3);
        }
        if (triggerCount === 2) {
          assert(dataArray.length === 1);
          done();
        }
        triggerCount = triggerCount + 1;
      }, 3, 1000);

      batcher.add('1');
      batcher.add('2');
      batcher.add('3');
      batcher.add('4');
      batcher.add('5');
      batcher.add('6');
      batcher.add('7');
    }); // end of it

    it('batch triggered by time 2 times, and then triggered by size', function(done) {
      var triggerCount = 0;

      var startTime = Date.now();

      var batcher = creatBatcher(function(dataArray) {
        console.log('batcher triggered:' + triggerCount);
        console.log(dataArray);
        console.log('from now');
        console.log(Date.now() - startTime);

        if (triggerCount === 0) {
          assert(dataArray.length === 2);
        }
        if (triggerCount === 1) {
          assert(dataArray.length === 1);
        }
        if (triggerCount === 2) {
          assert(dataArray.length === 3);
          done();
        }
        triggerCount = triggerCount + 1;
      }, 3, 1000);


      batcher.add('1');
      batcher.add('2');

      setTimeout(() => {
        batcher.add('3');
      }, 2000);

      setTimeout(() => {
        batcher.add('4');
        batcher.add('5');
        batcher.add('6');
      }, 4000);
    }); // end of it

  }); // end of describe

} // end of if(RUN_TEST)
