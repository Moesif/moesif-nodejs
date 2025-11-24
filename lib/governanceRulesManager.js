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
var getReqHeaders = dataUtils.getReqHeaders;

var moesifController = require('moesifapi').ApiController;

const CONFIG_UPDATE_DELAY = 60000; // 1 minutes
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

function getFieldValueForPath(path, requestFields, requestBody, requestHeaders) {
  if (path && path.indexOf('request.body.') === 0 && requestBody) {
    const bodyKey = path.replace('request.body.', '');
    return requestBody[bodyKey];
  } else if (path && path.indexOf('request.headers.') === 0 && requestHeaders) {
    const headerKey = path.replace('request.headers.', '');
    return requestHeaders[headerKey] || requestHeaders[headerKey.toLowerCase()];
  } else if (path && requestFields) {
    return requestFields[path];
  }
  return '';
}

function doesRegexConfigMatch(regexConfig, requestFields, requestBody, requestHeaders) {
  if (!regexConfig || regexConfig.length <= 0 || !Array.isArray(regexConfig)) {
    // means customer do not care about regex match and only cohort match.
    return true;
  }

  const arrayToOr = regexConfig.map(function (oneGroupOfConditions) {
    const conditions = oneGroupOfConditions.conditions || [];

    return conditions.reduce(function (andSoFar, currentCondition) {
      if (!andSoFar) return false;

      const path = currentCondition.path;

      const fieldValue = getFieldValueForPath(path, requestFields, requestBody, requestHeaders);

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

function replaceVariableNameWithValueWithDefault(inputString, variables) {
  // This regular expression matches patterns like {{VARIABLE_NAME}} or {{VARIABLE_NAME|DEFAULT_VALUE}}
  const variablePattern = /\{\{([^\{\}|]+)(\|([^}]+))?\}\}/g;

  return inputString.replace(variablePattern, (match, variableName, _, defaultValue) => {
    // Check if the variableName exists in the variables object and is not null/undefined
    if (
      variables.hasOwnProperty(variableName) &&
      variables[variableName] !== null &&
      variables[variableName] !== undefined
    ) {
      // Replace with the variable value from the variables object
      return variables[variableName];
    } else {
      // If the variable is not provided, use the default value (if available)
      // If defaultValue is undefined (i.e., not provided in the template), this will return an empty string
      return defaultValue || 'UNKNOWN';
    }
  });
}
// // Example usage:
// const inputString = "This string has {{VARIABLE_NAME}} and {{MISSING_VARIABLE|default value}} to be {{foo.bar|default name}} replaced {{no_default.field}}.";

// // Suppose VARIABLE_NAME is provided, but MISSING_VARIABLE is not
// const variables = {
//   VARIABLE_NAME: "some value",
//   'foo.bar': 'nihao'
//   // MISSING_VARIABLE is not provided, so its default value from the template should be used
//   // no_default.field is not provided, the template have no default either, so it becomes "UNKNOWN"
// };

// const result = replaceVariableNameWithValueWithDefault(inputString, variables);
// console.log(result):
// // This string has some value and default value to be nihao replaced UNKNOWN.

function recursivelyReplaceValues(tempObjectOrVal, mergeTagValues, ruleVariables) {
  if (!ruleVariables || ruleVariables.length <= 0) {
    return tempObjectOrVal;
  }

  if (typeof tempObjectOrVal === 'string') {
    let tempString = tempObjectOrVal;
    const variablesAndValues = {};
    ruleVariables.forEach(function (ruleVar) {
      const varName = ruleVar.name;
      const replacementValue = safeGet(mergeTagValues, varName);

      if (replacementValue) {
        variablesAndValues[varName] = replacementValue;
      }
    });

    const replacedString = replaceVariableNameWithValueWithDefault(tempString, variablesAndValues);
    return replacedString;
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
    // also need to set this in case it is missing.
    // blocked body is always json
    responseHolder.headers['Content-Type'] = 'application/json';
    // in case of rule block, we replace the status and body.
    const ruleResBody = safeGet(rule, 'response.body');
    const replacedBody = recursivelyReplaceValues(ruleResBody, mergeTagValues, ruleVariables);
    responseHolder.body = replacedBody;
    responseHolder.status = safeGet(rule, 'response.status');
    responseHolder.blocked_by = rule._id;
  }

  return responseHolder;
}

// Internal helper to compute applicable rules based only on cohort membership and applied_to.
// Logic (ignoring regex):
//  - If entity (user/company) is in rule cohort and rule.applied_to !== 'not_matching' -> include.
//  - If entity NOT in rule cohort and rule.applied_to === 'not_matching' -> include.
function getApplicableRulesByCohortOnly(configRuleValues, rulesHashByRuleId, logger) {
  const rulesEntityInCohortHash = {};
  const applicable = [];

  if (Array.isArray(configRuleValues) && configRuleValues.length > 0) {
    configRuleValues.forEach(function (entry) {
      const ruleId = entry.rules;
      rulesEntityInCohortHash[ruleId] = true;
      const rule = rulesHashByRuleId[ruleId];
      if (!rule) {
        if (logger) logger('rule not found for rule id from config: ' + ruleId + '. It could be deleted.');
        return;
      }
      if (rule.applied_to === 'not_matching') {
        // entity is in cohort; rule applies only to those NOT in cohort -> skip
        return;
      }
      applicable.push(rule);
    });
  }

  Object.values(rulesHashByRuleId).forEach(function (rule) {
    if (rule.applied_to === 'not_matching' && !rulesEntityInCohortHash[rule._id]) {
      applicable.push(rule);
    }
  });

  return applicable;
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
  return !this._rules || now() - this._lastUpdate > CONFIG_UPDATE_DELAY;
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
            if (Array.isArray(self._rules)) {
              self.log('obtained ' + self._rules.length + 'rules');
              self._cacheRules(self._rules);
            } else {
              self.log('unexpected: rules from server is not array', self._rules);
            }
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
        break;
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

GovernanceRulesManager.prototype._getApplicableRegexRules = function (
  requestFields,
  requestBody,
  requestHeaders
) {
  if (this.regexRules) {
    return this.regexRules.filter((rule) => {
      const regexConfig = rule.regex_config;
      return doesRegexConfigMatch(regexConfig, requestFields, requestBody, requestHeaders);
    });
  }
  return [];
};

GovernanceRulesManager.prototype._getApplicableUnidentifiedUserRules = function (
  requestFields,
  requestBody,
  requestHeaders
) {
  if (this.unidentifiedUserRules) {
    return this.unidentifiedUserRules.filter((rule) => {
      const regexConfig = rule.regex_config;
      return doesRegexConfigMatch(regexConfig, requestFields, requestBody, requestHeaders);
    });
  }
  return [];
};

GovernanceRulesManager.prototype._getApplicableUnidentifiedCompanyRules = function (
  requestFields,
  requestBody,
  requestHeaders
) {
  if (this.unidentifiedCompanyRules) {
    return this.unidentifiedCompanyRules.filter((rule) => {
      const regexConfig = rule.regex_config;
      return doesRegexConfigMatch(regexConfig, requestFields, requestBody, requestHeaders);
    });
  }
  return [];
};

GovernanceRulesManager.prototype._getApplicableUserRules = function (
  configUserRulesValues,
  requestFields,
  requestBody,
  requestHeaders
) {
  // Use cohort-only helper then apply regex filtering identical to original behavior.
  const userRulesHashByRuleId = this.userRulesHashByRuleId || {};
  const cohortCandidates = getApplicableRulesByCohortOnly(
    configUserRulesValues,
    userRulesHashByRuleId,
    (msg) => this.log(msg)
  );
  return cohortCandidates.filter((rule) =>
    doesRegexConfigMatch(rule.regex_config, requestFields, requestBody, requestHeaders)
  );
};

GovernanceRulesManager.prototype._getApplicableCompanyRules = function (
  configCompanyRulesValues,
  requestFields,
  requestBody,
  requestHeaders
) {
  const companyRulesHashByRuleId = this.companyRulesHashByRuleId || {};
  const cohortCandidates = getApplicableRulesByCohortOnly(
    configCompanyRulesValues,
    companyRulesHashByRuleId,
    (msg) => this.log(msg)
  );
  return cohortCandidates.filter((rule) =>
    doesRegexConfigMatch(rule.regex_config, requestFields, requestBody, requestHeaders)
  );
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
      self.log('modify file response for one rule, prev responseHolder ', {
        prevResponseHolder,
        currentRule,
        mergeTagValues,
      });
      const resultResponseHolder = modifyResponseForOneRule(
        currentRule,
        prevResponseHolder,
        mergeTagValues
      );
      self.log('finished modify response', { resultResponseHolder });
      return resultResponseHolder;
    } catch (err) {
      self.log('error applying rule ' + currentRule._id + ' ' + err.toString());
      return prevResponseHolder;
    }
  }, responseHolder);
};

GovernanceRulesManager.prototype.governInternal = function (
  config,
  userId,
  companyId,
  requestFields,
  requestBody,
  requestHeaders,
  originalUrl
) {
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
    const applicableRegexRules = this._getApplicableRegexRules(
      requestFields,
      requestBody,
      requestHeaders
    );
    responseHolder = this.applyRuleList(applicableRegexRules, responseHolder);

    if (isNil(companyId)) {
      const anonCompanyRules = this._getApplicableUnidentifiedCompanyRules(
        requestFields,
        requestBody,
        requestHeaders
      );
      responseHolder = this.applyRuleList(anonCompanyRules, responseHolder);
    } else {
      const configCompanyRulesValues = safeGet(safeGet(config, 'company_rules'), companyId);
      // Get cohort-based list using new public helper then filter by regex for current request context.
      const companyCohortCandidates = this.getApplicableRulesForCompanyId(companyId, config);
      const idCompanyRules = companyCohortCandidates.filter((rule) =>
        doesRegexConfigMatch(rule.regex_config, requestFields, requestBody, requestHeaders)
      );
      responseHolder = this.applyRuleList(idCompanyRules, responseHolder, configCompanyRulesValues);
    }

    if (isNil(userId)) {
      const anonUserRules = this._getApplicableUnidentifiedUserRules(
        requestFields,
        requestBody,
        requestHeaders
      );
      responseHolder = this.applyRuleList(anonUserRules, responseHolder);
    } else {
      const configUserRulesValues = safeGet(safeGet(config, 'user_rules'), userId);
      // Cohort-only then regex filter for current request context.
      const userCohortCandidates = this.getApplicableRulesForUserId(userId, config);
      const idUserRules = userCohortCandidates.filter((rule) =>
        doesRegexConfigMatch(rule.regex_config, requestFields, requestBody, requestHeaders)
      );
      responseHolder = this.applyRuleList(idUserRules, responseHolder, configUserRulesValues);
    }
  } catch (err) {
    this.log('error trying to govern request ' + err.toString, {
      url: originalUrl,
      userId,
      companyId,
    });
  }
  this.log('govern results', responseHolder);

  return responseHolder;
};

GovernanceRulesManager.prototype.governRequestNextJs = function (
  config,
  userId,
  companyId,
  requestBody,
  requestHeaders,
  originalUrl,
  originalIp,
  originalMethod
) {
  const requestFields = {
    'request.verb': originalMethod,
    'request.ip': originalIp,
    'request.route': originalUrl,
    'request.body.operationName': safeGet(requestBody, 'operationName'),
  };

  return this.governInternal(
    config,
    userId,
    companyId,
    requestFields,
    requestBody,
    requestHeaders,
    originalUrl
  );
};

GovernanceRulesManager.prototype.governRequest = function (config, userId, companyId, request) {
  const requestBody = prepareRequestBody(request);
  const requestFields = prepareFieldValues(request, requestBody);
  const requestHeaders = getReqHeaders(request);
  this.log('preparing to govern', {
    requestBody,
    requestFields,
    userId,
    companyId,
    requestHeaders,
  });

  return this.governInternal(
    config,
    userId,
    companyId,
    requestFields,
    requestBody,
    requestHeaders,
    request && request.originalUrl
  );
};

/**
 * Return all user rules applicable for the given userId based solely on cohort membership
 * (config user_rules values) and the rule's applied_to property. Ignores request fields,
 * body, headers, and regex matching. Logic:
 *  - If user is in a rule cohort and rule.applied_to !== 'not_matching' -> include.
 *  - If user is NOT in a rule cohort and rule.applied_to === 'not_matching' -> include.
 * @param {String} userId
 * @param {Object} config Full config object containing user_rules hash
 * @returns {Array<Object>} array of rule objects applicable to the userId
 */
GovernanceRulesManager.prototype.getApplicableRulesForUserId = function (userId, config) {
  if (isNil(userId)) {
    return [];
  }
  const userRulesHashByRuleId = this.userRulesHashByRuleId || {};
  const configUserRulesValues = safeGet(safeGet(config, 'user_rules'), userId);
  return getApplicableRulesByCohortOnly(
    configUserRulesValues,
    userRulesHashByRuleId,
    (msg) => this.log(msg)
  );
};

/**
 * Return all company rules applicable for the given companyId based solely on cohort membership
 * (config company_rules values) and the rule's applied_to property. Ignores request fields,
 * body, headers, and regex matching. Logic:
 *  - If company is in a rule cohort and rule.applied_to !== 'not_matching' -> include.
 *  - If company is NOT in a rule cohort and rule.applied_to === 'not_matching' -> include.
 * @param {String} companyId
 * @param {Object} config Full config object containing company_rules hash
 * @returns {Array<Object>} array of rule objects applicable to the companyId
 */
GovernanceRulesManager.prototype.getApplicableRulesForCompanyId = function (companyId, config) {
  if (isNil(companyId)) {
    return [];
  }
  const companyRulesHashByRuleId = this.companyRulesHashByRuleId || {};
  const configCompanyRulesValues = safeGet(safeGet(config, 'company_rules'), companyId);
  return getApplicableRulesByCohortOnly(
    configCompanyRulesValues,
    companyRulesHashByRuleId,
    (msg) => this.log(msg)
  );
};

module.exports = new GovernanceRulesManager();
