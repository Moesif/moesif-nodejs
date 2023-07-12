var moesifapi = require('moesifapi');
var assert = require('assert');
var moesifConfigManager = require('../lib/moesifConfigManager');
var governanceRulesManager = require('../lib/governanceRulesManager');


var RUN_TEST = true;

if (RUN_TEST) {
  describe('governance rules unit test', function () {
    var config = moesifapi.configuration;
    config.ApplicationId = 'Your Application Id';

    it ('can load rules and verify cached correctly', function () {
      return governanceRulesManager.tryGetRules().then((result) => {
        console.log(JSON.stringify(result, null, '  '));
        console.log(JSON.stringify(governanceRulesManager.userRulesHashByRuleId, null, '  '));
        console.log(JSON.stringify(governanceRulesManager.unidentifiedCompanyRules, null, '  '));
      });
    });
  });


}
