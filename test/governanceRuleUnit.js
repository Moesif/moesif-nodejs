var moesifapi = require('moesifapi');
var assert = require('assert');
var moesifConfigManager = require('../lib/moesifConfigManager');
var governanceRulesManager = require('../lib/governanceRulesManager');

var RUN_TEST = false;

if (RUN_TEST) {
  describe('governance rules unit test', function () {
    var config = moesifapi.configuration;
    config.ApplicationId = 'Your Moesif Applicaiton Id';

    it('can load rules and verify cached correctly', function () {
      return governanceRulesManager.tryGetRules().then((result) => {
        console.log(JSON.stringify(result, null, '  '));
        console.log(JSON.stringify(governanceRulesManager.userRulesHashByRuleId, null, '  '));
        console.log(JSON.stringify(governanceRulesManager.unidentifiedCompanyRules, null, '  '));
      });
    });

    it('get applicable user rules for unidentifed user', function () {
      var requestFields = {
        'request.verb': 'GET',
        'request.ip_address': '125.2.3.2',
        'request.route': '',
        'request.body.operationName': 'operator name',
      };
      var requestBody = {
        subject: 'should_block',
      };

      var applicableRules = governanceRulesManager._getApplicableRegexRules(
        requestFields,
        requestBody
      );
      console.log(
        'applicableRules : ' + applicableRules.length + '   ' + JSON.stringify(applicableRules)
      );
      assert(applicableRules.length === 1, 'expected 1 rule to match for regex rule');
    });

    it('can get applicable rules for identified user who is in cohort rule', function () {
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

      var applicableRules = governanceRulesManager._getApplicableUserRules(
        config_user_rules_values,
        requestFields,
        requestBody
      );
      console.log(
        'applicableRules : ' + applicableRules.length + '   ' + JSON.stringify(applicableRules)
      );
      assert(applicableRules.length === 1, 'expected 1 rule to match for applicable user rules');
    });

    it('get applicable users rules to a user in cohort but rule is not in cohort', function () {
      var requestFields = {
        'request.route': 'hello/canada',
      };

      var requestBody = {
        from_location: 'canada',
      };

      var userId = 'vancouver';

      // https://www.moesif.com/wrap/app/88:210-660:387/governance-rule/64a783a43660b60f7c766a06
      var config_user_rules_values = [
        {
          rules: '64a783a43660b60f7c766rando',
          values: {
            0: 'city',
            1: 'some value for 1',
            2: 'some value for 2',
          },
        },
      ];

      var applicableRules = governanceRulesManager._getApplicableUserRules(
        config_user_rules_values,
        requestFields,
        requestBody
      );
      console.log(
        'applicableRules : ' + applicableRules.length + '   ' + JSON.stringify(applicableRules)
      );
      assert(
        applicableRules.length === 1,
        'expected 1 rule to match for user in cohort rule is not in cohort'
      );
    });

    it('can apply multiple rules', function () {
      var requestFields = {
        'request.route': 'hello/canada',
      };
      var requestBody = {
        from_location: 'cairo',
      };

      var applicableRules = governanceRulesManager._getApplicableUserRules(
        null,
        requestFields,
        requestBody
      );
      console.log(
        'applicableRules : ' + applicableRules.length + '   ' + JSON.stringify(applicableRules)
      );
      assert(
        applicableRules.length === 2,
        'expected 2 rules for user not in cohort, regex should match 2 rules'
      );

      var responseHolder = {
        headers: {},
      };

      var newResponseHolder = governanceRulesManager.applyRuleList(
        applicableRules,
        responseHolder,
        null
      );

      console.log(JSON.stringify(newResponseHolder, null, '  '));

      assert(!!newResponseHolder.blocked_by, 'blocked by should exists');
    });
  }); // end describe
}
