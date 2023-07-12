/*
 * Governance Rules Manager is responsible for fetching governance rules
 * and figure out if rules needs to be applied and apply the rules
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
    'request.ip': requestIp.getClientIp(request),
    'request.route': request.originalUrl || request.url,
    'request.body.operationName': safeGet(requestBody, 'operationName'),
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
    // means customer do not care about regex match and only cohort match.
    return true;
  }

  const arrayToOr = regexConfig.map(function (oneGroupOfConditions) {
    const conditions = oneGroupOfConditions.conditions || [];

    return conditions.reduce(function (andSoFar, currentCondition) {
      if (!andSoFar) return false;

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

/**
 *
 * @type Class
 *
 * */
function GovernanceRulesManager() {
  this._lastUpdate = 0;
}

GovernanceRulesManager.prototype.setLogger = function (logger) {
  this._logger = logger;
};

GovernanceRulesManager.prototype.log = function (message, details) {
  if (this._logger) {
    this._logger(message, details);
  }
};

GovernanceRulesManager.prototype.hasRules = function () {
  return Boolean(this._rules && this._rules.length > 0);
};

GovernanceRulesManager.prototype.shouldFetch = function () {
  // wait to reload the config, since different collector instances
  // might have different versions of the config
  return (
    !this._rules ||
    now() - this._lastUpdate > CONFIG_UPDATE_DELAY
  );
};

GovernanceRulesManager.prototype.tryGetRules = function () {
  var self = this;

  return new Promise(function (resolve, reject) {
    if (!self._loading && self.shouldFetch()) {
      // only send one config request at a time
      self._loading = true;
      self.log('loading rules');
      moesifController.getRules(function (err, response, event) {
        self._loading = false;
        // prevent keep calling.
        self._rules = [];
        if (err) {
          self.log('load gov rules failed' + err.toString());
          // we resolve anyways and move on.
          // it will be retried again.
          resolve();
        }

        if (response && response.statusCode === 200) {
          self._configHash = event.response.headers[HASH_HEADER];
          try {
            self._rules = response.body;
            self._cacheRules(self._rules);
            self._lastUpdate = now();
            resolve(self._rules);
          } catch (e) {
            self.log('moesif-nodejs: error parsing rules ' + e.toString());
          }
        }
      });
    } else {
      self.log('skip loading rules, already loaded recently');
      resolve(self._rules);
    }
  });
};

GovernanceRulesManager.prototype._cacheRules = function (rules) {
  var self = this;
  this.regexRules = rules.filter(function (item) {
    return item.type === RULE_TYPES.REGEX;
  });
  this.userRulesHashByRuleId = {};
  this.companyRulesHashByRuleId = {};

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
  const self = this;

  const applicableRules = [];
  const rulesThatUserIsInCohortHash = {};

  const userRulesHashByRuleId = this.userRulesHashByRuleId;

  // handle if user is in cohort.
  // if user is in a rule's cohort, the data is from config_rule_rules_values
  if (Array.isArray(configUserRulesValues) && configUserRulesValues.length > 0) {
    configUserRulesValues.forEach(function (entry) {
      const ruleId = entry.rules;

      // cache the fact current user is in the cohort of this rule.
      rulesThatUserIsInCohortHash[ruleId] = true;

      const foundRule = userRulesHashByRuleId[ruleId];
      if (!foundRule) {
        // skip not found, but shouldn't be the case here.
        self.log('rule not found for rule id from config' + ruleId);
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

  // handle if rule is not matching and user is not in the cohort.
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
  const self = this;

  const rulesHashByRuleId = this.companyRulesHashByRuleId;

  // handle if company is in cohort.
  // if company is in a rule's cohort, the data is from config_rules_values
  if (Array.isArray(configCompanyRulesValues) && configCompanyRulesValues.length > 0) {
    configCompanyRulesValues.forEach(function (entry) {
      const ruleId = entry.rules;

      // cache the fact current company is in the cohort of this rule.
      rulesThatCompanyIsInCohortHash[ruleId] = true;

      const foundRule = rulesHashByRuleId[ruleId];
      if (!foundRule) {
        // skip not found, but shouldn't be the case here.
        self.log('rule not found for rule id from config' + ruleId);
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

  //  company is not in cohort, and if rule is not matching we apply the rule.
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

GovernanceRulesManager.prototype.applyRuleList = function (
  applicableRules,
  responseHolder,
  configRuleValues
) {
  const self = this;
  if (!applicableRules || !Array.isArray(applicableRules) || applicableRules.length <= 0) {
    return responseHolder;
  }

  return applicableRules.reduce(function (prevResponseHolder, currentRule) {
    const ruleValuePair = (configRuleValues || []).find(
      (ruleValuePair) => ruleValuePair.rules === currentRule._id
    );
    const mergeTagValues = ruleValuePair && ruleValuePair.values;
    try {
      return modifyResponseForOneRule(currentRule, prevResponseHolder, mergeTagValues);
    } catch (err) {
      self.log('error applying rule ' + currentRule._id + ' ' + err.toString());
      return prevResponseHolder;
    }
  }, responseHolder);
};

GovernanceRulesManager.prototype.governRequest = function (config, userId, companyId, request) {
  const requestBody = prepareRequestBody(request);
  const requestFields = prepareFieldValues(request, requestBody);
  this.log('preparing to govern', { requestBody, requestFields, userId, companyId });

  // start with null for everything except for headers with empty hash that can accumulate values.
  let responseHolder = {
    status: null,
    headers: {},
    body: null,
    blocked_by: null,
  };

  try {
    // apply in reverse order of priority will results in highest priority rules is final rule applied.
    // highest to lowest priority are: user rules, company rules, and regex rules.
    const applicableRegexRules = this._getApplicableRegexRules(requestFields, requestBody);
    responseHolder = this.applyRuleList(applicableRegexRules, responseHolder);

    if (isNil(companyId)) {
      const anonCompanyRules = this._getApplicableUnidentifiedCompanyRules(
        requestFields,
        requestBody
      );
      responseHolder = this.applyRuleList(anonCompanyRules, responseHolder);
    } else {
      const configCompanyRulesValues = safeGet(safeGet(config, 'company_rules'), companyId);
      const idCompanyRules = this._getApplicableCompanyRules(
        configCompanyRulesValues,
        requestFields,
        requestBody
      );
      responseHolder = this.applyRuleList(idCompanyRules, responseHolder, configCompanyRulesValues);
    }

    if (isNil(userId)) {
      const anonUserRules = this._getApplicableUnidentifiedUserRules(requestFields, requestBody);
      responseHolder = this.applyRuleList(anonUserRules, responseHolder);
    } else {
      const configUserRulesValues = safeGet(safeGet(config, 'user_rules'), userId);
      const idUserRules = this._getApplicableUserRules(
        configUserRulesValues,
        requestFields,
        requestBody
      );
      responseHolder = this.applyRuleList(idUserRules, responseHolder, configUserRulesValues);
    }
  } catch (err) {
    this.log('error trying to govern request ' + err.toString, {
      url: request && request.originalUrl,
      userId,
      companyId,
    });
  }
  this.log('govern results', responseHolder);

  return responseHolder;
};

module.exports = new GovernanceRulesManager();
