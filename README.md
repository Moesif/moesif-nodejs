# Moesif Express Middleware

Express middleware to automatically capture _incoming_ REST API requests/responses and send to Moesif for error analysis.

[Source Code on GitHub](https://github.com/moesif/moesif-express)

[Package on NPMJS](https://www.npmjs.com/package/moesif-express)

## How to install

```shell
npm install --save moesif-express
```

## How to use

The following shows how import the controllers and use:

### 1. Import the module:


```javascript
// Import Modules
var express = require('express');
var app = express();

var moesifExpress = require('moesif-express');

// Set the options, the only required field is applicationId.
var options = {

  applicationId: 'Your Moesif application_id',

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

// Load the Moesif middleware
app.use(moesifExpress(options));

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
  applicationId: 'Your Application Id'
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


#### __`identifyUser`__

Type: `(Request, Response) => String`
identifyUser is a function that takes express `req` and `res` as arguments
and returns a userId. This helps us attribute requests to unique users. Even though Moesif can
automatically retrieve the userId without this, this is highly recommended to ensure accurate attribution.


```
options.identifyUser = function (req, res) {
  // your code here, must return a string
  return req.user.id
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
request.ip_address | Optional | IP address of the responding server
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
to moesif or network issue, you can use this to see if there is any issues with integration.

### updateUser method

A method is attached to the moesif middleware object to update the users profile or metadata.


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

The metadata field can be any custom data you want to set on the user.
The userId field is required.

### startCaptureOutgoing method

Since `moesif-express` runs in the node environment, if you want to capture all
outgoing API calls from your node App, this method to start capture outgoing methods.

```javascript
var moesifMiddleware = moesifExpress(options);
moesifMiddleware.startCaptureOutgoing();
```

This method can be used to capture outgoing API calls even if you are not using express or having
any incoming API calls.

Note, the same set of options is also applied to outgoing API calls, with this key difference below:

For options that take `req` and `res` as input parameters, the request and response objects passed in
are not the express or node req or res objects. They are mocked request and response objects with these fields set:

- *_mo_mocked*: a field that is set to `true` if is a mocked request or response object.
- *headers*: object, a mapping of header names to header values.
- *url*: string. available on the mocked request object.
- *method*: string. available on the mocked request object.
- *statusCode*: number. available on the mocked response object.
- *getHeader*: function. (string) => string.
- *body*: JSON object.


## Example

[An example can be found here](https://github.com/Moesif/moesif-express-example).

## Other integrations

To view more more documentation on integration options, please visit __[the Integration Options Documentation](https://www.moesif.com/docs/getting-started/integration-options/).__
