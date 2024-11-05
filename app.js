/**
 * Created by Xingheng on 10/16/16.
 * This file is a simple test app.
 */

var express = require('express');
var app = express();

var moesif = require('./lib');

const APPLICATION_ID = 'YOUR_MOESIF_APPLICATION_ID';

var moesifMiddleWare = moesif({ applicationId: APPLICATION_ID });

app.use(moesifMiddleWare);
app.use(express.json());

app.get('/', function (req, res) {
  res.json({ a: 'abc' });
});

app.get('/abc', function (req, res) {
  res.json({ abc: 'abcefg' });
});

const server = app.listen(0, () => {
  console.log(`Example app listening on port ${server.address().port}`);
});
