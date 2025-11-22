const assert = require('assert');
const governanceRulesManager = require('../lib/governanceRulesManager');

// Integration tests exercising governRequest which internally uses
// getApplicableRulesForUserId and getApplicableRulesForCompanyId plus regex filtering.

describe('GovernanceRulesManager integration governRequest', function () {
  before(function () {
    const integrationRules = [
      {
        _id: 'regexRule',
        type: 'regex',
        applied_to: 'matching',
        regex_config: [
          {
            conditions: [
              { path: 'request.route', value: '/api/blocked' }
            ]
          }
        ],
        block: true,
        response: {
          status: 403,
          body: { reason: 'regex blocked' }
        }
      },
      {
        _id: 'companyHeaderRule',
        type: 'company',
        applied_to: 'matching',
        response: {
          headers: { 'X-Company-Plan': '{{company.plan|Free}}' }
        },
        variables: [ { name: 'company.plan' } ]
      },
      {
        _id: 'userHeaderRule',
        type: 'user',
        applied_to: 'not_matching', // only applies when user NOT in cohort
        response: {
          headers: { 'X-Unused': '1' }
        }
      },
      {
        _id: 'userBlockRule',
        type: 'user',
        applied_to: 'matching',
        block: true,
        response: {
          status: 401,
          body: { message: 'Hello {{user.name|Friend}}', missing: '{{not.provided}}' }
        },
        variables: [ { name: 'user.name' } ]
      }
    ];
    governanceRulesManager._cacheRules(integrationRules);
  });

  function mockRequest(route) {
    return {
      method: 'GET',
      url: route,
      headers: { 'x-test': 'abc' },
      body: { operationName: 'opName' }
    };
  }

  it('applies user block rule overriding earlier regex and company rules when user in cohort', function () {
    const config = {
      user_rules: {
        user123: [
          { rules: 'userBlockRule', values: { 'user.name': 'Alice' } },
          { rules: 'userHeaderRule', values: {} }
        ]
      },
      company_rules: {
        companyABC: [
          { rules: 'companyHeaderRule', values: { 'company.plan': 'Gold' } }
        ]
      }
    };
    const responseHolder = governanceRulesManager.governRequest(
      config,
      'user123',
      'companyABC',
      mockRequest('/api/blocked')
    );
    assert.strictEqual(responseHolder.status, 401, 'final status should be from user block rule');
    assert.strictEqual(responseHolder.blocked_by, 'userBlockRule', 'blocked_by should be userBlockRule');
    assert.strictEqual(responseHolder.body.message, 'Hello Alice', 'user name variable replaced');
    assert.strictEqual(responseHolder.body.missing, 'UNKNOWN', 'missing variable replaced with UNKNOWN');
    assert.strictEqual(responseHolder.headers['X-Company-Plan'], 'Gold', 'company header merged');
    assert.strictEqual(responseHolder.headers['Content-Type'], 'application/json', 'content type set on block');
    // userHeaderRule should not apply since user is in cohort and it is not_matching rule
    assert(!responseHolder.headers['X-Unused'], 'not_matching user rule should not apply for cohort member');
  });

  it('applies regex and company rules when user outside cohort (no user block)', function () {
    const config = {
      user_rules: {
        user123: [
          { rules: 'userBlockRule', values: { 'user.name': 'Alice' } },
          { rules: 'userHeaderRule', values: {} }
        ]
      },
      company_rules: {
        companyABC: [
          { rules: 'companyHeaderRule', values: { 'company.plan': 'Gold' } }
        ]
      }
    };
    const responseHolder = governanceRulesManager.governRequest(
      config,
      'otherUser',
      'companyABC',
      mockRequest('/api/blocked')
    );
    assert.strictEqual(responseHolder.status, 403, 'status should be from regex rule');
    assert.strictEqual(responseHolder.blocked_by, 'regexRule', 'blocked_by should be regexRule');
    assert.strictEqual(responseHolder.body.reason, 'regex blocked', 'regex body applied');
    assert.strictEqual(responseHolder.headers['X-Company-Plan'], 'Gold', 'company header merged');
    // userHeaderRule should apply now because user not in cohort and rule is not_matching
    assert.strictEqual(responseHolder.headers['X-Unused'], '1', 'not_matching user header applied');
  });
});
