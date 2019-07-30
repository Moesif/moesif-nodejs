# Moesif Node.js Middleware

[![NPM](https://nodei.co/npm/moesif-express.png?compact=true&stars=true)](https://nodei.co/npm/moesif-express/)

[![Built For][ico-built-for]][link-built-for]
[![Total Downloads][ico-downloads]][link-downloads]
[![Software License][ico-license]][link-license]
[![Source Code][ico-source]][link-source]

Node.js middleware to automatically capture _incoming_ or _outgoing_
API requests/responses and send to [Moesif](https://www.moesif.com) for API debugging and analytics.

[Source Code on GitHub](https://github.com/moesif/moesif-express)

## Notes
- The SDK is called `moesif-express` for historical reasons but compatible with any Node.js app regardless if Express Framework is used.
- The library can capture both _incoming_ and _outgoing_ API Calls depending on how you configure the SDK (See examples).
- To ensure req body is captured, if you use a body parser middleware like `body-parser`, apply Moesif middleware _after_ it.

## How to install

```shell
npm install --save moesif-express
```

## How to use

The following shows how import the controllers and use:

### 1. Import the module:


```javascript

// 1. Import Modules
var express = require('express');
var app = express();
var moesifExpress = require('moesif-express');

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
var moesifMiddleware = moesifExpress(options);


// 4a. Start capturing outgoing API Calls to 3rd parties like Stripe
// Skip this step if you don't want to capture outgoing API calls
moesifMiddleware.startCaptureOutgoing();

// 4b. Use the Moesif middleware to start capturing incoming API Calls
// If you have a body parser middleware, apply Moesif middleware after any body parsers.
// Skip this step if you don't want to capture incoming API calls
app.use(moesifMiddleware);

```

### 2. Enter Moesif Application Id.
You can find your Application Id from [_Moesif Dashboard_](https://www.moesif.com/) -> _Top Right Menu_ -> _App Setup_

## Not using Express?
If you're not using the express framework, you can still use this library.
The library does not depend on express, so you can still call the middleware from a basic HTTP server.

```javascript
var moesifExpress = require('moesif-express');
const http = require('http');

var options = {
  applicationId: 'Your Application Id',
  logBody: true,
};

var server = http.createServer(function (req, res) {
  moesifExpress(options)(req, res, function () {
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

#### __`logBody`__
Type: `Boolean`
logBody is default to true, set to false to remove logging request and response body to Moesif.

#### __`identifyUser`__

Type: `(Request, Response) => String`
identifyUser is a function that takes express `req` and `res` as arguments
and returns a `userId`. This enables Moesif to attribute API requests to individual unique users
so you can understand who calling your API. This can be used simultaneously with `identifyCompany`
to track both individual customers and the companies their a part of.

```javascript
options.identifyUser = function (req, res) {
  // your code here, must return a string
  return req.user.id
}
```

#### __`identifyCompany`__

Type: `(Request, Response) => String`
identifyCompany is a function that takes express `req` and `res` as arguments
and returns a `companyId`. If your business is B2B, this enables Moesif to attribute 
API requests to specific companies or organizations so you can understand which accounts are 
calling your API. This can be used simultaneously with `identifyUser` to track both 
individual customers and the companies their a part of. 

```javascript
options.identifyCompany = function (req, res) {
  // your code here, must return a string
  return req.headers['X-Organization-Id']
}
```

#### __`getSessionToken`__

Type: `(Request, Response) => String`
getSessionToken a function that takes express `req` and `res` arguments and returns a session token (i.e. such as an API key).


```javascript
options.getSessionToken = function (req, res) {
  // your code here, must return a string.
  return req.headers['Authorization'];
}
```

#### __`getTags`__

__Will be deprecated. Please use getMetadata instead to provide metadata for events.__

Type: `(Request, Response) => String`
getTags is a function that takes a express `req` and `res` arguments and returns a comma-separated string containing a list of tags.
See Moesif documentation for full list of tags.



```javascript
options.getTags = function (req, res) {
  // your code here. must return a comma-separated string.
  if (req.path.startsWith('/users') && req.method == 'GET'){
    return 'user'
  }
  return 'random_tag_1, random_tag2'
}
```

#### __`getApiVersion`__

Type: `(Request, Response) => String`
getApiVersion is a function that takes a express `req` and `res` arguments and returns a string to tag requests with a specific version of your API.


```javascript
options.getApiVersion = function (req, res) {
  // your code here. must return a string.
  return '1.0.5'
}
```

#### __`getMetadata`__

Type: `(Request, Response) => Object`
getMetadata is a function that takes a express `req` and `res` and returns an object that allows you
to add custom metadata that will be associated with the req. The metadata must be a simple javascript object that can be converted to JSON. For example, you may want to save a VM instance_id, a trace_id, or a tenant_id with the request.


```javascript
options.getMetadata = function (req, res) {
  // your code here:
  return {
    foo: 'custom data',
    bar: 'another custom data'
  };
}
```

#### __`skip`__

Type: `(Request, Response) => Boolean`
skip is a function that takes a express `req` and `res` arguments and returns true if the event should be skipped (i.e. not logged)
<br/>_The default is shown below and skips requests to the root path "/"._


```javascript
options.skip = function (req, res) {
  // your code here. must return a boolean.
  if (req.path === '/') {
    // Skip probes to home page.
    return true;
  }
  return false
}
```

#### __`maskContent`__

Type: `MoesifEventModel => MoesifEventModel`
maskContent is a function that takes the final Moesif event model (rather than the Express req/res objects) as an argument before being sent to Moesif.
With maskContent, you can make modifications to headers or body such as removing certain header or body fields.


```javascript
options.maskContent = function(event) {
  // remove any field that you don't want to be sent to Moesif.
  return event;
}
 ```

`EventModel` format:

```json
{
  "request": {
    "time": "2016-09-09T04:45:42.914",
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
    "time": "2016-09-09T04:45:42.914",
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
  "user_id": "mndug437f43",
  "session_token":"end_user_session_token",
  "tags": "tag1, tag2"
}

```

For more documentation regarding what fields and meaning,
see below or the [Moesif Node API Documentation](https://www.moesif.com/docs/api?javascript).

Fields | Required | Description
--------- | -------- | -----------
request.time | Required | Timestamp for the request in ISO 8601 format
request.uri | Required | Full uri such as https://api.com/?query=string including host, query string, etc
request.verb | Required | HTTP method used, i.e. `GET`, `POST`
request.api_version | Optional | API Version you want to tag this request with
request.ip_address | Optional | IP address of the end user
request.headers | Required | Headers of the  request
request.body | Optional | Body of the request in JSON format
||
response.time | Required | Timestamp for the response in ISO 8601 format
response.status | Required | HTTP status code such as 200 or 500
response.ip_address | Optional | IP address of the responding server
response.headers | Required | Headers of the response
response.body | Required | Body of the response in JSON format

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

### updateUser method

A method is attached to the Moesif middleware object to update the user's profile or metadata.


```javascript

var moesifMiddleware = moesifExpress(options);
var user = {
  userId: 'your user id',  // required.
  metadata: {
    email: 'user@email.com',
    name: 'George'
  }
}

moesifMiddleware.updateUser(user, callback);

```

### updateCompany method

A method is attached to the Moesif middleware object to update the company's profile or metadata.


```javascript

var moesifMiddleware = moesifExpress(options);
var company = {
  companyId: 'your company id',  // required.
  companyDomain: 'acmeinc.com',
  metadata: {
    numEmployees: 9001
  }
}

moesifMiddleware.updateCompany(user, callback);

```

The metadata field can be any custom data you want to set on the user.
The userId field is required.

## Capture Outgoing

If you want to capture all outgoing API calls from your Node.js app to third parties like
Stripe or to your own dependencies, call `startCaptureOutgoing()` to start capturing.

```javascript
var moesifMiddleware = moesifExpress(options);
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


## Examples

- [A complete example is available on GitHub](https://github.com/Moesif/moesif-express-example).

- [An example of integration with Apollo.js with support for GraphQL.](https://github.com/Moesif/moesif-apollo-graphql-example)

## Other integrations

To view more documentation on integration options, please visit __[the Integration Options Documentation](https://www.moesif.com/docs/getting-started/integration-options/).__


[ico-built-for]: https://img.shields.io/badge/built%20for-node.js-blue.svg
[ico-downloads]: https://img.shields.io/npm/dt/moesif-express.svg
[ico-license]: https://img.shields.io/badge/License-Apache%202.0-green.svg
[ico-source]: https://img.shields.io/github/last-commit/moesif/moesif-express.svg?style=social

[link-built-for]: https://expressjs.com/
[link-downloads]: https://www.npmjs.com/package/moesif-express
[link-license]: https://raw.githubusercontent.com/Moesif/moesif-express/master/LICENSE
[link-source]: https://github.com/moesif/moesif-express
