var moesifapi = require('moesifapi');
var assert = require('assert');
var moesifConfigManager = require('../lib/moesifConfigManager');


var RUN_TEST = false;

if (RUN_TEST) {
  describe('moesif config manager tests', function () {
    var config = moesifapi.configuration;

    config.ApplicationId = 'Application Id';

    it('can get moesif config manager', function (done) {
      moesifConfigManager.tryGetConfig();
      setTimeout(() => {
        console.log('got config back');
        console.log(JSON.stringify(moesifConfigManager._config, null, ' '));
        assert(
          typeof moesifConfigManager._config === 'object',
          'we should have app config back as object'
        );
        done();
      }, 1000);
    });
  });
}
