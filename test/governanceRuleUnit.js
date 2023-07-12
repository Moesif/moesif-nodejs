var moesifapi = require('moesifapi');
var assert = require('assert');
var moesifConfigManager = require('../lib/moesifConfigManager');
var governanceRulesManager = require('../lib/governanceRulesManager');


var RUN_TEST = true;

if (RUN_TEST) {
  describe('governance rules unit test', function () {
    var config = moesifapi.configuration;
    config.ApplicationId = 'Your Application Id';

    it('can load rules and verify cached correctly', function () {
      return governanceRulesManager.tryGetRules().then((result) => {
        console.log(JSON.stringify(result, null, '  '));
        console.log(JSON.stringify(governanceRulesManager.userRulesHashByRuleId, null, '  '));
        console.log(JSON.stringify(governanceRulesManager.unidentifiedCompanyRules, null, '  '));
      });
    });

    it('can get applicable rules for unidentified user', function () {
      var requestFields = {
        'request.route': 'test/no_italy',
      };

      var requestBody = {
        subject: 'should_block',
      };

      var userId = 'rome1';
      // https://www.moesif.com/wrap/app/88:210-660:387/governance-rule/64a783a3e7d62b036d16006e

      var config_user_rules_values = [
        {
          rules: '64a783a3e7d62b036d16006e',
          values: {
            0: 'rome',
            1: 'some value for 1',
            2: 'some value for 2',
          },
        },
      ];

      var applicableRules = governanceRulesManager._getApplicableUserRules(config_user_rules_values, requestFields, requestBody);
      console.log('applicableRules : ' + applicableRules.length + "   " + JSON.stringify(applicableRules));
      assert(applicableRules.length === 1, 'expected 1 rule to match for applicable user rules');
    });

  }); // end describe



}
