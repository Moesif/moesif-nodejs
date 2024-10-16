'use strict';
const { bodyToBase64, ensureToString, logMessage, hashSensitive } = require('./dataUtils');

const TRANSACTION_ID_HEADER = 'x-moesif-transaction-id';

function getNextJsFullUrl(request) {

  const url = request.url;

  if (url && url.indexOf('http') === 0) {
    return url;
  }

  const protocol = request.headers.get('x-forwarded-proto') || 'http';

  // Get the host
  const host = request.headers.get('host');

  // Get the full URL
  const fullUrl = `${protocol}://${host}${request.url}`;

  return fullUrl;
}

async function safeGetNextJsBody(clonedObj, options) {
  try {
    const body = await clonedObj.json();
    logMessage(options.debug, 'safeGetNExtBody got body', body);

    return {
      body: body,
    };
  } catch (error) {
    // Attempt to read the body as text if it's not JSON
    logMessage(options.debug, 'safeGetNextBody Not JSON', error);

    try {
      const textBody = await clonedObj.text();
      if (!textBody) {
        return {};
      }

      logMessage(options.debug, 'safeGetNextBody got text body', textBody);

      return {
        body: bodyToBase64(textBody),
        transferEncoding: 'base64',
      };
    } catch (textError) {
      // we can not get body. so just move on.
      logMessage(options.debug, 'text exract error', textError);
      return {};
    }
  }
}

function getNextJsIp(request) {
  try {
    const xForwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = xForwardedFor
      ? xForwardedFor.split(',')[0].trim()
      : request.headers.get('x-real-ip') || request.connection.remoteAddress;

    return clientIp;
  } catch (err) {
    return null;
  }
}

function getNextJsHeaders(rawHeadersObject) {
  const entries = Array.from(rawHeadersObject.entries());
  const result = {};
  entries.forEach((item) => {
    result[item[0]] = item[1];
  });

  return result;
}

async function extractNextJsEventDataAndSave({
  request,
  requestTime,
  response,
  responseTime,
  options,
  saveEvent,
  blockedBy,
}) {
  if (options.skip(request, response)) {
    logMessage(options.debug, 'skipped logging to moesif due to skip', request.url);
    return;
  }

  let logData = {
    blockedBy,
    userId: ensureToString(options.identifyUser(request, response)),
    companyId: ensureToString(options.identifyUser(request, response)),
    metadata: options.getMetadata(request, response),
    sessionToken: options.getSessionToken(request, response),
  };

  logData.request = {
    ipAddress: getNextJsIp(request),
    time: requestTime,
    uri: getNextJsFullUrl(request),
    verb: request.method,
    headers: getNextJsHeaders(request.headers),
  };
  logData.request.verb = request.method;

  logData.response = {
    time: responseTime,
    headers: getNextJsHeaders(response.headers),
    status: response.status,
  };

  if (options.logBody) {
    const requestBodyInfo = await safeGetNextJsBody(request, options);
    logData.request.body = requestBodyInfo.body;
    logData.request.transferEncoding = requestBodyInfo.transferEncoding;
    const responseBodyInfo = await safeGetNextJsBody(response, options);
    logData.response.body = responseBodyInfo.body;
    logData.response.transferEncoding = requestBodyInfo.transferEncoding;
  }

  if (!options.noAutoHideSensitive) {
    var noAutoHideSensitiveStartTime = Date.now();
    // autoHide
    try {
      logData.request.headers = hashSensitive(logData.request.headers, options.debug);
      logData.request.body = hashSensitive(logData.request.body, options.debug);
      logData.response.headers = hashSensitive(logData.response.headers, options.debug);
      logData.response.body = hashSensitive(logData.response.body, options.debug);
    } catch (err) {
      logMessage(options.debug, 'formatEventDataAndSave', 'error on hashSensitive err=' + err);
    }
    var noAutoHideSensitiveEndTime = Date.now();
  }
  if (logData.response.headers[TRANSACTION_ID_HEADER]) {
    logData.request.headers[TRANSACTION_ID_HEADER] =
      logData.response.headers[TRANSACTION_ID_HEADER];
  }

  logMessage(options.debug, `extractNextJsEventDataAndSave`, `finished formatting nextjs log data and sending to moesif`);

  logData = options.maskContent(logData);

  return saveEvent(logData);
}

module.exports = {
  extractNextJsEventDataAndSave,
};
