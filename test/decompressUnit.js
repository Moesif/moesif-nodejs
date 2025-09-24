const assert = require('assert');
const zlib = require('zlib');
const dataUtils = require('../lib/dataUtils');

describe('decompressIfNeeded', function() {
  it('should decompress brotli-compressed buffer from Cloudflare', function() {
    var original = JSON.stringify({ foo: 'bar', baz: 42 });
    var compressed = zlib.brotliCompressSync(Buffer.from(original));
    var headers = { server: 'cloudflare' };
    var result = dataUtils.decompressIfNeeded(compressed, headers);
    assert.strictEqual(result, original);
  });

  it('should decompress gzip-compressed buffer', function() {
    var original = JSON.stringify({ hello: 'world' });
    var compressed = zlib.gzipSync(Buffer.from(original));
    var headers = { 'content-encoding': 'gzip' };
    var result = dataUtils.decompressIfNeeded(compressed, headers);
    assert.strictEqual(result, original);
  });

  it('should return original string if not compressed', function() {
    var original = 'plain text';
    var headers = {};
    var result = dataUtils.decompressIfNeeded(original, headers);
    assert.strictEqual(result, original);
  });
});

describe('getEventModelFromRequestAndResponse', function() {
  it('should decompress and parse brotli-compressed response body from Cloudflare', function() {
    // Simulate a JSON response
    var jsonResponse = JSON.stringify({ success: true, data: [1,2,3] });
    var compressed = zlib.brotliCompressSync(Buffer.from(jsonResponse));
    var responseHeaders = {
      'Server': 'cloudflare',
      'Content-Type': 'application/json'
    };
    var response = {
      statusCode: 200,
      headers: responseHeaders
    };
    var result = dataUtils.getEventModelFromRequestAndResponse(
      'https://api.example.com/test',
      {},
      Date.now(),
      null,
      response,
      Date.now(),
      compressed
    );
    assert.deepStrictEqual(result.response.body, { success: true, data: [1,2,3] });
    assert.strictEqual(result.response.transferEncoding, undefined);
  });

  it('should fallback to base64 if not decompressible', function() {
    var binary = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    var responseHeaders = { 'Server': 'cloudflare' };
    var response = {
      statusCode: 200,
      headers: responseHeaders
    };
    var result = dataUtils.getEventModelFromRequestAndResponse(
      'https://api.example.com/test',
      {},
      Date.now(),
      null,
      response,
      Date.now(),
      binary
    );
    assert.strictEqual(result.response.transferEncoding, 'base64');
    assert.strictEqual(result.response.body, binary.toString('base64'));
  });
});
