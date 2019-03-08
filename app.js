/**
 * Created by Xingheng on 10/16/16.
 * This file is a simple test app.
 */

var express = require('express');
var app = express();

var moesifExpress = require('./lib');

var TEST_API_SECRET_KEY = 'eyJhcHAiOiI5NDo5MiIsInZlciI6IjIuMCIsIm9yZyI6IjExNjoxMDQiLCJpYXQiOjE1NTIwMDMyMDB9.mtudzMSLcpfq0iTle-qTJLMJqBYirHqwrKG-Rz9oOaM';

var moesifMiddleWare = moesifExpress({applicationId: TEST_API_SECRET_KEY});

app.use(moesifMiddleWare);

app.get('/', function (req, res) {
  res.json({a: 'abc'});
});

app.get('/abc', function (req, res) {
  res.json({abc: 'abcefg'});
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
