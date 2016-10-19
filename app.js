/**
 * Created by Xingheng on 10/16/16.
 */

var express = require('express');
var app = express();

var moesifExpress = require('./lib');

var moesifMiddleWare = moesifExpress({applicationId: 'eyJhcHAiOiIxOTg6MTIiLCJ2ZXIiOiIyLjAiLCJvcmciOiIzNTk6MCIsImlhdCI6MTQ3NjY2MjQwMH0.WS3yWxWmJVj-MT8Q3APg0Rabuw5mt7FnYXxNIzQ30Is'});

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