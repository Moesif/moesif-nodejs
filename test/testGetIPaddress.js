var requestIp = require('request-ip');
var assert = require('assert');

var RUN_TEST = true;

if (RUN_TEST) {
  describe('Test the isolated case', function() {
    var fakeRequest = {
      headers: {
        'x-forwarded-for': '20.56.20.20, 234.134.211.173'
      }
    }
    console.log('test fake requst');

    const result = requestIp.getClientIp(fakeRequest);
    assert(result === '20.56.20.20', 'ip address should match first one');
  });
}
