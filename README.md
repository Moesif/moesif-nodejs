Moesif Express Middleware SDK
=============================

Express middleware to automatically log API request/responses to Moesif for error analysis.

[Source Code on GitHub](https://github.com/moesif/moesif-express)

__Check out Moesif's
[NodeJS developer documentation](https://www.moesif.com/developer-documentation/?javascript) to learn more__

How To Install:
===============

```shell
npm install --save moesif-express
```

How To Use:
===========
The following shows how import the controllers and use:

1) Import the module:

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

List of Options:
================

1) `identifyUser`

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

2) `getSessionToken`

Type: `(Request, Response) => String`
getSessionToken a function that takes express `req` and `res` arguments and returns a session token (i.e. such as an API key).

```javascript
options.getSessionToken = function (req, res) {
  // your code here, must return a string.
  return req.headers['Authorization'];
}
```

3) `getTags`

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

4) `getApiVersion`

Type: `(Request, Response) => String`
getApiVersion is a function that takes a express `req` and `res` arguments and returns a string to tag requests with a specific version of your API.
```javascript
options.getApiVersion = function (req, res) {
  // your code here. must return a string.
  return '1.0.5'
}
```

4) `skip`

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

5) `maskContent`

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

For more documentation regarding what fields and meaning:

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


6) `callback`

Type: `error => null`
callback is for internal errors. For example, if there is has been an error sending events
to moesif or network issue, you can use this to see if there is any issues with integration.
