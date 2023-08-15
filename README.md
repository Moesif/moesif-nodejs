# Moesif Node.js Middleware

[![NPM](https://nodei.co/npm/moesif-nodejs.png?compact=true&stars=true)](https://nodei.co/npm/moesif-nodejs/)

[![Built For][ico-built-for]][link-built-for]
[![Total Downloads][ico-downloads]][link-downloads]
[![Software License][ico-license]][link-license]
[![Source Code][ico-source]][link-source]

Node.js SDK middleware that automatically logs _incoming_ or _outgoing_ API calls and sends to [Moesif](https://www.moesif.com) for API analytics and monitoring.
This SDK supports any Node.js framework including Express, Koa, Nest.js, etc.

[Source Code on GitHub](https://github.com/moesif/moesif-nodejs)

## Notes
- Previously, this NPM package was called `moesif-express` and has been renamed to `moesif-nodejs` in 3.0 to reflect support for any Node.js app.
- The library can capture both _incoming_ and _outgoing_ API Calls depending on how you configure the SDK (See examples).
- To ensure req body is captured, if you use a body parser middleware like `body-parser`, apply Moesif middleware _after_ it.

## How to install

```shell
npm install --save moesif-nodejs
```

## How to use

The following shows how import Moesif for an example app using Express

### 1. Import the module:

```javascript

// 1. Import Modules
var express = require('express');
var app = express();
var moesif = require('moesif-nodejs');

// 2. Set the options, the only required field is applicationId.
var options = {

  applicationId: 'Your Moesif Application Id',

  logBody: true,

  identifyUser: function (req, res) {
    if (req.user) {
      return req.user.id;
    }
    return undefined;
  },

  getSessionToken: function (req, res) {
    return req.headers['Authorization'];
  }
};

// 3. Initialize the middleware object with options
var moesifMiddleware = moesif(options);


// 4a. Start capturing outgoing API Calls to 3rd parties like Stripe
// Skip this step if you don't want to capture outgoing API calls
moesifMiddleware.startCaptureOutgoing();

// 4b. Use the Moesif middleware to start capturing incoming API Calls
// If you have a body parser middleware, apply Moesif middleware after any body parsers.
// Skip this step if you don't want to capture incoming API calls
app.use(moesifMiddleware);

```

If you are using babel or newer versions of nodejs, you can using more modern syntax for importing. For example: `import moesif from 'moesif-nodejs';`

### 2. Enter Moesif Application Id
Your Moesif Application Id can be found in the [_Moesif Portal_](https://www.moesif.com/).
After signing up for a Moesif account, your Moesif Application Id will be displayed during the onboarding steps.

You can always find your Moesif Application Id at any time by logging
into the [_Moesif Portal_](https://www.moesif.com/), click on the bottom left menu,
 and then clicking _Installation_.

```javascript
var moesif = require('moesif-nodejs');
const http = require('http');

var options = {
  applicationId: 'Your Application Id',
  logBody: true,
};

var server = http.createServer(function (req, res) {
  moesif(options)(req, res, function () {
    // Callback
  });

  req.on('end', function () {

    res.write(JSON.stringify({
      message: "hello world!",
      id: 2
    }));
    res.end();
  });
});

server.listen(8080);

```

## Configuration options

__If you're using Koa framework, you can access the state object via `request.state`__

#### __`logBody`__
Type: `Boolean`
logBody is default to true, set to false to remove logging request and response body to Moesif.

#### __`identifyUser`__

Type: `(Request, Response) => String`
identifyUser is a function that takes express `req` and `res` as arguments
and returns a `userId`. This enables Moesif to attribute API requests to individual unique users
so you can understand who calling your API. This can be used simultaneously with `identifyCompany`
to track both individual customers and the companies with which they're associated.

```javascript
var options = {
  identifyUser: function (req, res) {
    // your code here must return the user id as a string. Example Below
    return req.user ? req.user.id : undefined;
  }
}
```

#### __`identifyCompany`__

Type: `(Request, Response) => String`
identifyCompany is a function that takes express `req` and `res` as arguments
and returns a `companyId`. If your business is B2B, this enables Moesif to attribute
API requests to specific companies or organizations so you can understand which accounts are
calling your API. This can be used simultaneously with `identifyUser` to track both
individual customers and the companies with which they're associated.

```javascript
var options = {
  identifyCompany: function (req, res) {
    // your code here must return the company id as a string. Example Below
    return req.headers['X-Organization-Id']
  }
}
```

#### __`getSessionToken`__

Type: `(Request, Response) => String`
getSessionToken a function that takes express `req` and `res` arguments and returns a session token (i.e. such as an API key).

```javascript
var options = {
  getSessionToken: function (req, res) {
    // your code here must return a string. Example Below
    return req.headers['Authorization'];
  }
}
```

#### __`getApiVersion`__

Type: `(Request, Response) => String`
getApiVersion is a function that takes a express `req` and `res` arguments and returns a string to tag requests with a specific version of your API.

```javascript
var options = {
  getApiVersion: function (req, res) {
    // your code here must return a string. Example Below
    return req.headers['X-Api-Version']
  }
}
```

#### __`getMetadata`__

Type: `(Request, Response) => Object`
getMetadata is a function that takes a express `req` and `res` and returns an object that allows you
to add custom metadata that will be associated with the req. The metadata must be a simple javascript object that can be converted to JSON. For example, you may want to save a VM instance_id, a trace_id, or a tenant_id with the request.

```javascript
var options = {
  getMetadata: function (req, res) {
    // your code here:
    return {
      foo: 'custom data',
      bar: 'another custom data'
    };
  }
}
```

#### __`skip`__

Type: `(Request, Response) => Boolean`
skip is a function that takes a express `req` and `res` arguments and returns true if the event should be skipped (i.e. not logged)
<br/>_The default is shown below and skips requests to the root path "/"._

```javascript
var options = {
  skip: function (req, res) {
    // your code here must return a boolean. Example Below
    if (req.path === '/' || req.path === '/health') {
      // Skip logging traffic to root path or health probe.
      return true;
    }
    return false
  }
}
```

#### __`maskContent`__

Type: `MoesifEventModel => MoesifEventModel`
maskContent is a function that takes the final Moesif event model (rather than the Express req/res objects) as an argument before being sent to Moesif.
With maskContent, you can make modifications to headers or body such as removing certain header or body fields.

```javascript
import _ from 'lodash';

var options = {
  maskContent: function(event) {
    // remove any field that you don't want to be sent to Moesif.
    const newEvent = _.omit(event, ['request.headers.Authorization', 'event.response.body.sensitive_field'])
    return newEvent;
  }
};
 ```

`EventModel` format:

```json
{
  "request": {
    "time": "2022-08-08T04:45:42.914",
    "uri": "https://api.acmeinc.com/items/83738/reviews/",
    "verb": "POST",
    "api_version": "1.1.0",
    "ip_address": "61.48.220.123",
    "headers": {
      "Host": "api.acmeinc.com",
      "Accept": "*/*",
      "Connection": "Keep-Alive",
      "Content-Type": "application/json",
      "Content-Length": "126",
      "Accept-Encoding": "gzip"
    },
    "body": {
      "items": [
        {
          "direction_type": 1,
          "item_id": "fwdsfrf",
          "liked": false
        },
        {
          "direction_type": 2,
          "item_id": "d43d3f",
          "liked": true
        }
      ]
    }
  },
  "response": {
    "time": "2022-08-08T04:45:42.924",
    "status": 500,
    "headers": {
      "Vary": "Accept-Encoding",
      "Pragma": "no-cache",
      "Expires": "-1",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache"
    },
    "body": {
      "Error": "InvalidArgumentException",
      "Message": "Missing field location"
    }
  },
  "user_id": "my_user_id",
  "company_id": "my_company_id",
  "session_token":"end_user_session_token",
  "tags": "tag1, tag2"
}
````

#### __`debug`__
Type: `Boolean`
Set to true to print debug logs if you're having integration issues.

For more documentation regarding what fields and meaning,
see below or the [Moesif Node API Documentation](https://www.moesif.com/docs/api?javascript).

Name | Required | Description
--------- | -------- | -----------
request | __true__ | The object that specifies the request message
request.time| __true__ | Timestamp for the request in ISO 8601 format
request.uri| __true__ | Full uri such as _https://api.com/?query=string_ including host, query string, etc
request.verb| __true__ | HTTP method used, i.e. `GET`, `POST`
request.api_version| false | API Version you want to tag this request with such as _1.0.0_
request.ip_address| false | IP address of the requester, If not set, we use the IP address of your logging API calls.
request.headers| __true__ | Headers of the  request as a `Map<string, string>`. Multiple headers with the same key name should be combined together such that the values are joined by a comma. [HTTP Header Protocol on w3.org](https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.2)
request.body| false | Body of the request in JSON format or Base64 encoded binary data (see _transfer_encoding_)
request.transfer_encoding| false | A string that specifies the transfer encoding of Body being sent to Moesif. If field nonexistent, body assumed to be JSON or text. Only possible value is _base64_ for sending binary data like protobuf
||
response | false | The object that specifies the response message, not set implies no response received such as a timeout.
response.time| __true__ | Timestamp for the response in ISO 8601 format
response.status| __true__ | HTTP status code as number such as _200_ or _500_
response.ip_address| false | IP address of the responding server
response.headers| __true__ | Headers of the response as a `Map<string, string>`. Multiple headers with the same key name should be combined together such that the values are joined by a comma. [HTTP Header Protocol on w3.org](https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.2)
response.body| false | Body of the response in JSON format or Base64 encoded binary data (see _transfer_encoding_)
response.transfer_encoding| false | A string that specifies the transfer encoding of Body being sent to Moesif. If field nonexistent, body assumed to be JSON or text. Only possible value is _base64_ for sending binary data like protobuf
||
session_token | _Recommend_ | The end user session token such as a JWT or API key, which may or may not be temporary. Moesif will auto-detect the session token automatically if not set.
user_id | _Recommend_ | Identifies this API call to a permanent user_id
metadata | false | A JSON Object consisting of any custom metadata to be stored with this event.

#### __`noAutoHideSensitive`__

Type: boolean
Default 'false'. Before sending any data for analysis, automatically check the data (headers and body) and one way
hash strings or numbers that looks like a credit card or password. Turn this option
to `true` if you want to implement your specific `maskContent` function or you want to send all data to be analyzed.

#### `callback`

Type: `error => null`
callback is for internal errors. For example, if there is has been an error sending events
to Moesif or network issue, you can use this to see if there is any issues with integration.

#### __`disableBatching`__

Type: boolean
Default 'false'. By default, Moesif Express batches the Events. Turn this to true, this if you would like to send the API events one by one.

#### __`batchSize`__

Type: number
Default 25. If batching is not disabled, this is the batchSize of API events that will trigger flushing of queue and sending the data to Moesif. If set, must be greater than 1.

#### __`batchMaxTime`__

Type: number in milliseconds
Default 2000. If batching is not disabled, this is the maximum wait time (approximately) before triggering flushing of the queue and sending to Moesif. If set, it must be greater than 500 (milliseconds).

#### __`retry`__

Type: number of time to retry if fails to post to Moesif.
If set, must be a number between 0 to 3.

#### __`requestMaxBodySize`__

Type: number
Default 100000. Maximum request body size in bytes to log when sending the data to Moesif.

#### __`responseMaxBodySize`__

Type: number
Default 100000. Maximum response body size in bytes to log when sending the data to Moesif.

## Capture Outgoing

If you want to capture all outgoing API calls from your Node.js app to third parties like
Stripe or to your own dependencies, call `startCaptureOutgoing()` to start capturing.

```javascript
var moesifMiddleware = moesif(options);
moesifMiddleware.startCaptureOutgoing();
```

This method can be used to capture outgoing API calls even if you are not using the Express Middleware or having any incoming API calls.

The same set of above options is also applied to outgoing API calls, with a few key differences:

For options functions that take `req` and `res` as input arguments, the request and response objects passed in
are not Express or Node.js req or res objects when the request is outgoing, but Moesif does mock
some of the fields for convenience.
Only a subset of the Node.js req/res fields are available. Specifically:

- *_mo_mocked*: Set to `true` if it is a mocked request or response object (i.e. outgoing API Call)
- *headers*: object, a mapping of header names to header values. Case sensitive
- *url*: string. Full request URL.
- *method*: string. Method/verb such as GET or POST.
- *statusCode*: number. Response HTTP status code
- *getHeader*: function. (string) => string. Reads out a header on the request. Name is case insensitive
- *get*: function. (string) => string. Reads out a header on the request. Name is case insensitive
- *body*: JSON object. The request body as sent to Moesif

## Update a Single User

Create or update a user profile in Moesif.
The metadata field can be any customer demographic or other info you want to store.
Only the `userId` field is required.
This method is a convenient helper that calls the Moesif API lib.
For details, visit the [Node.js API Reference](https://www.moesif.com/docs/api?javascript--nodejs#update-a-user).

```javascript
var moesifMiddleware = moesif(options);

// Only userId is required.
// Campaign object is optional, but useful if you want to track ROI of acquisition channels
// See https://www.moesif.com/docs/api#users for campaign schema
// metadata can be any custom object
var user = {
  userId: '12345',
  companyId: '67890', // If set, associate user with a company object
  metadata: {
    email: 'john@acmeinc.com',
    firstName: 'John',
    lastName: 'Doe',
    title: 'Software Engineer',
    salesInfo: {
        stage: 'Customer',
        lifetimeValue: 24000,
        accountOwner: 'mary@contoso.com'
    }
  }
};

moesifMiddleware.updateUser(user, callback);
```

## Update Users in Batch
Similar to updateUser, but used to update a list of users in one batch.
Only the `userId` field is required.
This method is a convenient helper that calls the Moesif API lib.
For details, visit the [Node.js API Reference](https://www.moesif.com/docs/api?javascript--nodejs#update-users-in-batch).

```javascript
var moesifMiddleware = moesif(options);

// Only userId is required.
// Campaign object is optional, but useful if you want to track ROI of acquisition channels
// See https://www.moesif.com/docs/api#users for campaign schema
// metadata can be any custom object
var user = {
  userId: '12345',
  companyId: '67890', // If set, associate user with a company object
  metadata: {
    email: 'john@acmeinc.com',
    firstName: 'John',
    lastName: 'Doe',
    title: 'Software Engineer',
    salesInfo: {
        stage: 'Customer',
        lifetimeValue: 24000,
        accountOwner: 'mary@contoso.com'
    }
  }
};

var users = [user]

moesifMiddleware.updateUsersBatch(users, callback);
```

## Update a Single Company

Create or update a company profile in Moesif.
The metadata field can be any company demographic or other info you want to store.
Only the `companyId` field is required.
This method is a convenient helper that calls the Moesif API lib.
For details, visit the [Node.js API Reference](https://www.moesif.com/docs/api?javascript--nodejs#update-a-company).


```javascript
var moesifMiddleware = moesif(options);

// Only companyId is required.
// Campaign object is optional, but useful if you want to track ROI of acquisition channels
// See https://www.moesif.com/docs/api#update-a-company for campaign schema
// metadata can be any custom object
var company = {
  companyId: '67890',
  companyDomain: 'acmeinc.com', // If domain is set, Moesif will enrich your profiles with publicly available info
  metadata: {
    orgName: 'Acme, Inc',
    planName: 'Free Plan',
    dealStage: 'Lead',
    mrr: 24000,
    demographics: {
      alexaRanking: 500000,
      employeeCount: 47
    }
  }
};

moesifMiddleware.updateCompany(company, callback);
```

## Update Companies in Batch
Similar to updateCompany, but used to update a list of companies in one batch.
Only the `companyId` field is required.
This method is a convenient helper that calls the Moesif API lib.
For details, visit the [Node.js API Reference](https://www.moesif.com/docs/api?javascript--nodejs#update-companies-in-batch).

```javascript
var moesifMiddleware = moesif(options);

// Only companyId is required.
// Campaign object is optional, but useful if you want to track ROI of acquisition channels
// See https://www.moesif.com/docs/api#update-a-company for campaign schema
// metadata can be any custom object
var company = {
  companyId: '67890',
  companyDomain: 'acmeinc.com', // If domain is set, Moesif will enrich your profiles with publicly available info
  metadata: {
    orgName: 'Acme, Inc',
    planName: 'Free Plan',
    dealStage: 'Lead',
    mrr: 24000,
    demographics: {
      alexaRanking: 500000,
      employeeCount: 47
    }
  }
};

var companies = [company]

moesifMiddleware.updateCompaniesBatch(companies, callback);
```

## Koa Support

The Moesif option handles take a Node.js req and res as arguments. You can also access the Koa state object via `req.state`.
As an example, many Koa auth middleware save the authenticated user on `ctx.state.user`, so you can access via Moesif options like identifyUser:

```javascript
  identifyUser: function (req, res) {
    if (req.state && req.state.user) {
      return req.state.user.sub;
    }
    return undefined;
  },
```

## Examples

- [View example app with Express](https://github.com/Moesif/moesif-express-example).
- [View example app with Koa](https://github.com/Moesif/moesif-koa-example).
- [View example app with Apollo.js GraphQL.](https://github.com/Moesif/moesif-apollo-graphql-example)
- [View example app with Express GraphQL.](https://github.com/Moesif/moesif-express-graphql-example)
- [View example app with Next.js](https://github.com/Moesif/moesif-next-js-example)
- [View example app with Fastify](https://github.com/Moesif/fastify-moesif-nodejs-example)

## Other integrations

To view more documentation on integration options, please visit __[the Integration Options Documentation](https://www.moesif.com/docs/getting-started/integration-options/).__


[ico-built-for]: https://img.shields.io/badge/built%20for-node.js-blue.svg
[ico-downloads]: https://img.shields.io/npm/dt/moesif-nodejs.svg
[ico-license]: https://img.shields.io/badge/License-Apache%202.0-green.svg
[ico-source]: https://img.shields.io/github/last-commit/moesif/moesif-nodejs.svg?style=social

[link-built-for]: https://expressjs.com/
[link-downloads]: https://www.npmjs.com/package/moesif-nodejs
[link-license]: https://raw.githubusercontent.com/Moesif/moesif-nodejs/master/LICENSE
[link-source]: https://github.com/moesif/moesif-nodejs
