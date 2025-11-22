const assert = require('assert');
const governanceRulesManager = require('../lib/governanceRulesManager');

// Cohort-only tests for getApplicableRulesForUserId and getApplicableRulesForCompanyId.
// These ignore regex matching; we construct simple rule objects and a config hash.

describe('GovernanceRulesManager cohort-only applicability', function () {
  before(function () {
    const sampleRules = [
      { _id: 'ruleUserIn', type: 'user', applied_to: 'matching' },
      { _id: 'ruleUserInExclude', type: 'user', applied_to: 'not_matching' },
      { _id: 'ruleUserOutInclude', type: 'user', applied_to: 'not_matching' },
      { _id: 'ruleCompanyIn', type: 'company', applied_to: 'matching' },
      { _id: 'ruleCompanyInExclude', type: 'company', applied_to: 'not_matching' },
      { _id: 'ruleCompanyOutInclude', type: 'company', applied_to: 'not_matching' }
    ];
    // Seed the singleton's internal rule caches.
    governanceRulesManager._cacheRules(sampleRules);
  });

  it('returns correct user rules when user is in cohort', function () {
    const config = {
      user_rules: {
        user123: [
          { rules: 'ruleUserIn', values: {} },
          { rules: 'ruleUserInExclude', values: {} }
        ]
      }
    };
    const applicable = governanceRulesManager.getApplicableRulesForUserId('user123', config);
    const ruleIds = applicable.map(r => r._id).sort();
    assert.strictEqual(ruleIds.length, 2, 'expected 2 applicable user rules');
    assert(ruleIds.includes('ruleUserIn'), 'should include cohort rule with matching applied_to');
    assert(ruleIds.includes('ruleUserOutInclude'), 'should include non-cohort rule with not_matching');
    assert(!ruleIds.includes('ruleUserInExclude'), 'should exclude cohort rule with not_matching');
  });

  it('returns correct user rules when user is NOT in cohort', function () {
    const config = {
      user_rules: {
        user123: [
          { rules: 'ruleUserIn', values: {} },
          { rules: 'ruleUserInExclude', values: {} }
        ]
      }
    };
    const applicable = governanceRulesManager.getApplicableRulesForUserId('otherUser', config);
    const ruleIds = applicable.map(r => r._id).sort();
    assert.strictEqual(ruleIds.length, 2, 'expected 2 applicable user rules for non-cohort user');
    assert(ruleIds.includes('ruleUserInExclude'), 'should include not_matching rule when user not in cohort');
    assert(ruleIds.includes('ruleUserOutInclude'), 'should include rule not in cohort with not_matching');
    assert(!ruleIds.includes('ruleUserIn'), 'should not include matching rule for user outside cohort');
  });

  it('returns empty array when userId is null', function () {
    const applicable = governanceRulesManager.getApplicableRulesForUserId(null, { user_rules: {} });
    assert.strictEqual(applicable.length, 0, 'null user should yield no rules');
  });

  it('returns correct company rules when company is in cohort', function () {
    const config = {
      company_rules: {
        companyABC: [
          { rules: 'ruleCompanyIn', values: {} },
          { rules: 'ruleCompanyInExclude', values: {} }
        ]
      }
    };
    const applicable = governanceRulesManager.getApplicableRulesForCompanyId('companyABC', config);
    const ruleIds = applicable.map(r => r._id).sort();
    assert.strictEqual(ruleIds.length, 2, 'expected 2 applicable company rules');
    assert(ruleIds.includes('ruleCompanyIn'), 'should include cohort company rule with matching applied_to');
    assert(ruleIds.includes('ruleCompanyOutInclude'), 'should include non-cohort company rule with not_matching');
    assert(!ruleIds.includes('ruleCompanyInExclude'), 'should exclude cohort company rule with not_matching');
  });

  it('returns correct company rules when company is NOT in cohort', function () {
    const config = {
      company_rules: {
        companyABC: [
          { rules: 'ruleCompanyIn', values: {} },
          { rules: 'ruleCompanyInExclude', values: {} }
        ]
      }
    };
    const applicable = governanceRulesManager.getApplicableRulesForCompanyId('otherCompany', config);
    const ruleIds = applicable.map(r => r._id).sort();
    assert.strictEqual(ruleIds.length, 2, 'expected 2 applicable company rules for non-cohort company');
    assert(ruleIds.includes('ruleCompanyInExclude'), 'should include not_matching rule when company not in cohort');
    assert(ruleIds.includes('ruleCompanyOutInclude'), 'should include rule not in cohort with not_matching');
    assert(!ruleIds.includes('ruleCompanyIn'), 'should not include matching rule for company outside cohort');
  });

  it('returns empty array when companyId is undefined', function () {
    const applicable = governanceRulesManager.getApplicableRulesForCompanyId(undefined, { company_rules: {} });
    assert.strictEqual(applicable.length, 0, 'undefined company should yield no rules');
  });
});
