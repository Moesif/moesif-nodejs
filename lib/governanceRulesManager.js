/*
 * MoesifConfigManager is responsible for fetching and ensuring
 * the config for our api appId is up to date.
 *
 * This is done by ensuring the x-moesif-config-etag doesn't change.
 */

var safeGet = require('lodash/get');
var isNil = require('lodash/isNil');
var assign = require('lodash/assign');
var requestIp = require('request-ip');
var dataUtils = require('./dataUtils');

var safeJsonParse = dataUtils.safeJsonParse;

var moesifController = require('moesifapi').ApiController;

const CONFIG_UPDATE_DELAY = 300000; // 5 minutes
const HASH_HEADER = 'x-moesif-config-etag';

function now() {
  return new Date().getTime();
}

const RULE_TYPES = {
  USER: 'user',
  COMPANY: 'company',
  REGEX: 'regex',
};

function prepareFieldValues(request, requestBody) {
  return {
    'request.verb': request.method,
    'request.ip': requestIp.getClientIp(req),
    'request.route': request.originalUrl || request.url,
    'request.body.operationName': safeGet(requestBody, 'operationName')
  };
}

function prepareRequestBody(request) {
  if (request.body) {
    if (typeof request.body === 'object') {
      return request.body;
    }
    if (typeof request.body === 'string') {
      return safeJsonParse(request.body);
    }
  }

  return null;
}

function getFieldValueForPath(path, requestFields, requestBody) {
  if (path && path.indexOf('request.body.') === 0 && requestBody) {
    const bodyKey = path.replace('request.body.', '');
    return requestBody[bodyKey];
  }
  if (path && requestFields) {
    return requestFields[path];
  }
  return '';
}

function doesRegexConfigMatch(regexConfig, requestFields, requestBody) {
  if (!regexConfig || regexConfig.length <= 0 || !Array.isArray(regexConfig)) {
    // means customer do not care about regex match
    return true;
  }

  const arrayToOr = regexConfig.map(function (oneGroupOfConditions) {
    const conditions = oneGroupOfConditions.conditions || [];

    return conditions.reduce(function (andSoFar, currentCondition) {
      if (!andSofar) return false;

      const path = currentCondition.path;

      const fieldValue = getFieldValueForPath(path, requestFields, requestBody);

      try {
        const regex = new RegExp(currentCondition.value);
        return regex.test(fieldValue);
      } catch (err) {
        return false;
      }
    }, true);
  });

  return arrayToOr.reduce(function (sofar, curr) {
    return sofar || curr;
  }, false);
}

function recursivelyReplaceValues(tempObjectOrVal, mergeTagValues, ruleVariables) {
  if (!ruleVariables || ruleVariables.length <= 0) {
    return tempObjectOrVal;
  }

  if (typeof tempObjectOrVal === 'string') {
    let tempString = tempObjectOrVal;
    ruleVariables.forEach(function (ruleVar) {
      const varName = ruleVar.name;
      const replacementValue = safeGet(mergeTagValues, varName) || 'UNKNOWN';

      tempString = tempString.replace('{{' + varName + '}}', replacementValue);
    });
  }

  if (isNil(tempObjectOrVal)) {
    return tempObjectOrVal;
  }

  if (Array.isArray(tempObjectOrVal)) {
    return tempObjectOrVal.map(function (val) {
      return recursivelyReplaceValues(val, mergeTagValues, ruleVariables);
    });
  }

  if (typeof tempObjectOrVal === 'object') {
    const tempReturnValue = {};
    Object.entries(tempObjectOrVal).forEach(function ([key, val]) {
      tempReturnValue[key] = recursivelyReplaceValues(val, mergeTagValues, ruleVariables);
    });

    return tempReturnValue;
  }
  return tempObjectOrVal;
}

function modifyResponseForOneRule(rule, responseHolder, mergeTagValues) {
  // headers are merge add to existing
  const ruleVariables = rule.variables;

  const ruleHeaders = safeGet(rule, 'response.headers');
  if (ruleHeaders) {
    const valueReplacedHeaders = recursivelyReplaceValues(
      ruleHeaders,
      mergeTagValues,
      ruleVariables
    );
    responseHolder.headers = assign(responseHolder.headers, valueReplacedHeaders);
  }

  if (rule.block) {
    // in case of rule block, we replace the status and body.
    const ruleResBody = safeGet(rule, 'response.body');
    const replacedBody = recursivelyReplaceValues(ruleResBody, mergeTagValues, ruleVariables);
    responseHolder.body = replacedBody;
    responseHolder.status = safeGet(rule, 'response.status');
    responseHolder.blocked_by = rule._id;
  }

  return responseHolder;
}

function applyRuleList(applicableRules, responseHolder, configRuleValues) {
  if (!applicableRules || !Array.isArray(applicableRules) || applicableRules.length <= 0) {
    return responseHolder;
  }

  return applicableRules.reduce(function (prevResponseHolder, currentRule) {
    const ruleValuePair = (configRuleValues || []).find(
      (ruleValuePair) => ruleValuePair.rules === currentRule._id
    );
    const mergeTagValues = ruleValuePair && ruleValuePair.values;
    return modifyResponseForOneRule(currentRule, responseHolder, mergeTagValues);
  }, responseHolder);
}

/**
 *
 * @type Class
 *
 * */
function GovernanceRulesManager() {
  this._lastUpdate = 0;
}

GovernanceRulesManager.prototype.hasRules = function () {
  return Boolean(this._rules && this._rules.length > 0);
};

GovernanceRulesManager.prototype.shouldFetch = function () {
  // wait to reload the config, since different collector instances
  // might have different versions of the config
  return (
    !this._config ||
    (this._lastSeenHash !== this._configHash && now() - this._lastUpdate > CONFIG_UPDATE_DELAY)
  );
};

GovernanceRulesManager.prototype.tryGetRules = function () {
  if (!this._loading && this.shouldFetch()) {
    // only send one config request at a time
    this._loading = true;

    var that = this;

    moesifController.getRules(function (err, response, event) {
      that._loadingConfig = false;

      if (response && response.statusCode === 200) {
        that._configHash = event.response.headers[HASH_HEADER];
        try {
          that._rules = JSON.parse(event.response.body);
          that._cacheRules(that_rules);
          that._lastUpdate = now();
        } catch (e) {
          console.warn('moesif-nodejs: error parsing rules');
        }
      }
    });
  }
};

GovernanceRulesManager.prototype._cacheRules = function (rules) {
  this.regexRules = rules.filter(function (item) {
    return item.type === RULE_TYPES.REGEX;
  });
  this.userRulesHashByRuleId = {};
  this.companyRulesHashByRuleId = {};

  var self = this;

  rules.forEach(function (rule) {
    switch (rule.type) {
      case RULE_TYPES.COMPANY:
        self.companyRulesHashByRuleId[rule._id] = rule;
        break;
      case RULE_TYPES.USER:
        self.userRulesHashByRuleId[rule._id] = rule;
      case RULE_TYPES.REGEX:
        break;
      default:
        break;
    }
  });

  this.unidentifiedUserRules = rules.filter(function (rule) {
    return rule.type === RULE_TYPES.USER && rule.applied_to_unidentified;
  });

  this.unidentifiedCompanyRules = rules.filter(function (rule) {
    return rule.type === RULE_TYPES.COMPANY && rule.applied_to_unidentified;
  });
};

GovernanceRulesManager.prototype._getApplicableRegexRules = function (requestFields, requestBody) {
  if (this.regexRules) {
    return this.regexRules.filter((rule) => {
      const regexConfig = rule.regex_config;
      return doesRegexConfigMatch(regexConfig, requestFields, requestBody);
    });
  }
  return [];
};

GovernanceRulesManager.prototype._getApplicableUnidentifiedUserRules = function (
  requestFields,
  requestBody
) {
  if (this.unidentifiedUserRules) {
    return this.unidentifiedUserRules.filter((rule) => {
      const regexConfig = rule.regex_config;
      return doesRegexConfigMatch(regexConfig, requestFields, requestBody);
    });
  }
  return [];
};

GovernanceRulesManager.prototype._getApplicableUnidentifiedCompanyRules = function (
  requestFields,
  requestBody
) {
  if (this.unidentifiedCompanyRules) {
    return this.unidentifiedCompanyRules.filter((rule) => {
      const regexConfig = rule.regex_config;
      return doesRegexConfigMatch(regexConfig, requestFields, requestBody);
    });
  }
  return [];
};

GovernanceRulesManager.prototype._getApplicableUserRules = function (
  configUserRulesValues,
  requestFields,
  requestBody
) {
  const applicableRules = [];
  const rulesThatUserIsInCohortHash = {};

  const userRulesHashByRuleId = this.userRulesHashByRuleId;

  // handle if user is in cohort.
  // if user is in a rule's cohort, the data is from config_rule_rules_values
  if (Array.isArray(configUserRulesValues) && configUserRulesValues.length > 0) {
    config_user_rules_values.forEach(function (entry) {
      const ruleId = entry.rules;

      // cache the fact current user is in the cohort of this rule.
      rulesThatUserIsInCohortHash[ruleId] = true;

      const foundRule = userRulesHashByRuleId[ruleId];
      if (!foundRule) {
        // TODO: print a warning
        // skip not found, but shouldn't be the case here.
        return;
      }

      const regexMatched = doesRegexConfigMatch(foundRule.regex_config, requestFields, requestBody);

      if (!regexMatched) {
        // skipping because regex didn't not match.
        return;
      }

      if (foundRule.applied_to === 'not_matching') {
        // TODO: print debug skipping because we only apply to not matching)
      } else {
        applicableRules.push(foundRule);
      }
    });
  }

  // now handle if rule is not matching and user is not in cohort.
  Object.values(userRulesHashByRuleId).forEach((rule) => {
    if (rule.applied_to === 'not_matching' && !rulesThatUserIsInCohortHash[rule._id]) {
      const regexMatched = doesRegexConfigMatch(rule.regex_config, requestFields, requestBody);
      if (regexMatched) {
        applicableRules.push(rule);
      }
    }
  });

  return applicableRules;
};

GovernanceRulesManager.prototype._getApplicableCompanyRules = function (
  configCompanyRulesValues,
  requestFields,
  requestBody
) {
  const applicableRules = [];
  const rulesThatCompanyIsInCohortHash = {};

  const rulesHashByRuleId = this.companyRulesHashByRuleId;

  // handle if user is in cohort.
  // if user is in a rule's cohort, the data is from config_rules_values
  if (Array.isArray(configCompanyRulesValues) && configCompanyRulesValues.length > 0) {
    config_user_rules_values.forEach(function (entry) {
      const ruleId = entry.rules;

      // cache the fact current company is in the cohort of this rule.
      rulesThatCompanyIsInCohortHash[ruleId] = true;

      const foundRule = rulesHashByRuleId[ruleId];
      if (!foundRule) {
        // TODO: print a warning
        // skip not found, but shouldn't be the case here.
        return;
      }

      const regexMatched = doesRegexConfigMatch(foundRule.regex_config, requestFields, requestBody);

      if (!regexMatched) {
        // skipping because regex didn't not match.
        return;
      }

      if (foundRule.applied_to === 'not_matching') {
        // TODO: print debug skipping because we only apply to not matching)
      } else {
        applicableRules.push(foundRule);
      }
    });
  }

  // now handle if rule is not matching and user is not in cohort.
  Object.values(rulesHashByRuleId).forEach((rule) => {
    if (rule.applied_to === 'not_matching' && !rulesThatCompanyIsInCohortHash[rule._id]) {
      const regexMatched = doesRegexConfigMatch(rule.regex_config, requestFields, requestBody);
      if (regexMatched) {
        applicableRules.push(rule);
      }
    }
  });

  return applicableRules;
};

GovernanceRulesManager.prototype.governRequest = function (
  config,
  userId,
  companyId,
  request,
) {
  const requestBody = prepareRequestBody(request);
  const requestFields = prepareFieldValues(request, requestBody);

  // we start with null for everything except for headers which is just empty hash.
  let responseHolder = {
    status: null,
    headers: {},
    body: null,
    blocked_by: null,
  };

  // apply in reverse order of priority will results in highest priority rules is final rule applied.
  // highest to lowest priority are: user rules, company rules, and regex rules.
  const applicableRegexRules = this._getApplicableRegexRules(requestFields, requestBody);
  responseHolder = applyRuleList(applicableRegexRules, responseHolder);

  if (isNil(companyId)) {
    const anonCompanyRules = this._getApplicableUnidentifiedCompanyRules(
      requestFields,
      requestBody
    );
    responseHolder = applyRuleList(anonCompanyRules, responseHolder);
  } else {
    const configCompanyRulesValues = safeGet(safeGet(config, 'company_rules'), companyId);
    const idCompanyRules = this._getApplicableCompanyRules(
      configCompanyRulesValues,
      requestFields,
      requestBody
    );
    responseHolder = applyRuleList(idCompanyRules, responseHolder, configCompanyRulesValues);
  }

  if (isNil(userId)) {
    const anonUserRules = this._getApplicableUnidentifiedUserRules(requestFields, requestBody);
    responseHolder = applyRuleList(anonUserRules, responseHolder);
  } else {
    const configUserRulesValues = safeGet(safeGet(config, 'user_rules'), userId);
    const idUserRules = this._getApplicableUserRules(
      configUserRulesValues,
      requestFields,
      requestBody
    );
    responseHolder = applyRuleList(idUserRules, responseHolder, configUserRulesValues);
  }

  return responseHolder;
};

GovernanceRulesManager.prototype.tryUpdateHash = function (response) {
  if (response && response.headers && response.headers[HASH_HEADER]) {
    this._lastSeenHash = response.headers[HASH_HEADER];
  }
};

module.exports = new GovernanceRulesManager();
