/**
 * Created by Xingheng on 10/16/16.
 * This file is a simple test app.
 */

var express = require('express');
var app = express();

var moesifExpress = require('./lib');

var TEST_API_SECRET_KEY = 'eyJhcHAiOiIzNDU6MSIsInZlciI6IjIuMCIsIm9yZyI6Ijg4OjIiLCJpYXQiOjE0NzcwMDgwMDB9.576_l8Bza-gOoKzBR4_qnKEQOi2UYHh_FAK9IoDdUgc';

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
