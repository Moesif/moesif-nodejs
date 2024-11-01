
var isFunction = require('lodash/isFunction');
var isNumber = require('lodash/isNumber');

function ensureValidOptions(options) {
  if (!options) throw new Error('options are required by moesif-nodejs middleware');
  if (!options.applicationId || typeof options.applicationId !== 'string') {
    throw new Error(
      'A moesif application id is required. Please obtain it through your settings at www.moesif.com'
    );
  }
  if (options.applicationId.length < 50) {
    throw new Error(
      'A moesif application id is required. The format of the moesif application id provided does not look correct. Please obtain it through your settings at www.moesif.com'
    );
  }
  if (options.identifyUser && !isFunction(options.identifyUser)) {
    throw new Error('identifyUser should be a function');
  }
  if (options.identifyCompany && !isFunction(options.identifyCompany)) {
    throw new Error('identifyCompany should be a function');
  }
  if (options.getMetadata && !isFunction(options.getMetadata)) {
    throw new Error('getMetadata should be a function');
  }
  if (options.getSessionToken && !isFunction(options.getSessionToken)) {
    throw new Error('getSessionToken should be a function');
  }
  if (options.getTags && !isFunction(options.getTags)) {
    throw new Error('getTags should be a function');
  }
  if (options.getApiVersion && !isFunction(options.getApiVersion)) {
    throw new Error('getApiVersion should be a function');
  }
  if (options.maskContent && !isFunction(options.maskContent)) {
    throw new Error('maskContent should be a function');
  }
  if (options.skip && !isFunction(options.skip)) {
    throw new Error('skip should be a function');
  }
  if (options.retry && (!isNumber(options.retry) || options.retry > 3 || options.retry < 0)) {
    throw new Error('If retry is set, it must be a number between 0 to 3.');
  }
  if (options.batchSize && (!isNumber(options.batchSize) || options.batchSize <= 1)) {
    throw new Error('batchSize must be a number greater than or equal to 1');
  }
  if (options.batchMaxTime && (!isNumber(options.batchMaxTime) || options.batchMaxTime <= 500)) {
    throw new Error('batchMaxTime must be greater than 500 milliseonds');
  }
  if (options.requestMaxBodySize && (!isNumber(options.requestMaxBodySize) || options.requestMaxBodySize < 0)) {
    throw new Error('requestMaxBodySize must be a number greater than 0');
  }
  if (options.responseMaxBodySize && (!isNumber(options.responseMaxBodySize) || options.responseMaxBodySize < 0)) {
    throw new Error('responseMaxBodySize must be a number greater than 0');
  }
}

function ensureValidLogData(logData) {
  if (!logData.request) {
    throw new Error(
      'For Moesif events, request and response objects are required. Please check your maskContent function do not remove this'
    );
  } else {
    if (!logData.request.time) {
      throw new Error(
        'For Moesif events, request time is required. Please check your maskContent function do not remove this'
      );
    }
    if (!logData.request.verb) {
      throw new Error(
        'For Moesif events, request verb is required. Please check your maskContent function do not remove this'
      );
    }
    if (!logData.request.uri) {
      throw new Error(
        'For Moesif events, request uri is required. Please check your maskContent function do not remove this'
      );
    }
  }
  if (!logData.response) {
    throw new Error(
      'For Moesif events, request and response objects are required. Please check your maskContent function do not remove this'
    );
  } else {
    // if (!logData.response.body) {
    //   throw new Error('for log events, response body objects is required but can be empty object');
    // }
    if (!logData.request.time) {
      throw new Error(
        'For Moesif events, response time is required. The middleware should populate it automatically. Please check your maskContent function do not remove this'
      );
    }
  }
}

function ensureValidUserModel(userModel) {
  if (!userModel.userId) {
    throw new Error('To update a user, a userId field is required');
  }
}

function ensureValidUsersBatchModel(usersBatchModel) {
  for (let userModel of usersBatchModel) {
    if (!userModel.userId) {
      throw new Error('To update a user, a userId field is required');
    }
  }
}

function ensureValidCompanyModel(companyModel) {
  if (!companyModel.companyId) {
    throw new Error('To update a company, a companyId field is required');
  }
}

function ensureValidCompaniesBatchModel(companiesBatchModel) {
  for (let companyModel of companiesBatchModel) {
    if (!companyModel.companyId) {
      throw new Error('To update a company, a companyId field is required');
    }
  }
}

function ensureValidActionModel(actionModel) {
  if (!actionModel.actionName || !(actionModel.request && actionModel.request.uri)) {
    throw new Error('To send an Action, the actionName, request, and request.uri fields are required');
  }
}

function ensureValidActionsBatchModel(actionsBatchModel) {
  for (const actionModel of actionsBatchModel)
    if (!actionModel.actionName || !(actionModel.request && actionModel.request.uri)) {
      throw new Error('To send an Action, the actionName, request, and request.uri fields are required');
    }
}

module.exports = {
  ensureValidOptions: ensureValidOptions,
  ensureValidLogData: ensureValidLogData,
  ensureValidUserModel: ensureValidUserModel,
  ensureValidUsersBatchModel: ensureValidUsersBatchModel,
  ensureValidCompanyModel: ensureValidCompanyModel,
  ensureValidCompaniesBatchModel: ensureValidCompaniesBatchModel,
  ensureValidActionModel: ensureValidActionModel,
  ensureValidActionsBatchModel: ensureValidActionsBatchModel
};
