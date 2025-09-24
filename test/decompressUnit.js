const assert = require('assert');
const zlib = require('zlib');
const dataUtils = require('../lib/dataUtils');

describe('decompressIfNeeded', function () {
  it('should decompress brotli-compressed buffer from Cloudflare with text content-type', function() {
    var original = JSON.stringify({ foo: 'bar', baz: 42 });
    var compressed = zlib.brotliCompressSync(Buffer.from(original));
    var headers = { server: 'cloudflare', 'content-type': 'application/json' };
    var result = dataUtils.decompressIfNeeded(compressed, headers);
    assert.strictEqual(result, original);
  });

  it('should decompress gzip-compressed buffer with text content-type', function() {
    var original = JSON.stringify({ hello: 'world' });
    var compressed = zlib.gzipSync(Buffer.from(original));
    var headers = { 'content-encoding': 'gzip', 'content-type': 'application/json' };
    var result = dataUtils.decompressIfNeeded(compressed, headers);
    assert.strictEqual(result, original);
  });

  it('should skip decompression for non-text content-type (image/png)', function() {
    var original = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
    var compressed = zlib.gzipSync(original);
    var headers = { 'content-encoding': 'gzip', 'content-type': 'image/png' };
    var result = dataUtils.decompressIfNeeded(compressed, headers);
    // Should return the original compressed buffer, not decompressed
    assert.deepStrictEqual(result, compressed);
  });

  it('should return original string if not compressed and text content-type', function() {
    var original = 'plain text';
    var headers = { 'content-type': 'text/plain' };
    var result = dataUtils.decompressIfNeeded(original, headers);
    assert.strictEqual(result, original);
  });
});

describe('getEventModelFromRequestAndResponse', function () {
  it('should decompress and parse brotli-compressed response body from Cloudflare', function () {
    // Simulate a JSON response
    var jsonResponse = JSON.stringify({ success: true, data: [1, 2, 3] });
    var compressed = zlib.brotliCompressSync(Buffer.from(jsonResponse));
    var responseHeaders = {
      Server: 'cloudflare',
      'Content-Type': 'application/json',
    };
    var response = {
      statusCode: 200,
      headers: responseHeaders,
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
    assert.deepStrictEqual(result.response.body, { success: true, data: [1, 2, 3] });
    assert.strictEqual(result.response.transferEncoding, undefined);
  });


  it('should handle a Cloudflare API response with base64 _raw body', function () {
    var requestHeaders = {
      'X-Request-Source': 'standard',
      'Content-Type': 'application/json',
      'Content-Length': 2,
      'Accept-Encoding': 'gzip, compress, deflate, br',
      Accept: 'application/json, text/plain, */*',
    };
    var responseHeaders = {
      Connection: 'keep-alive',
      'Content-Type': 'application/json; charset=utf-8',
      'Cf-Cache-Status': 'DYNAMIC',
      'Transfer-Encoding': 'chunked',
      Server: 'cloudflare',
    };
    var response = {
      statusCode: 200,
      headers: responseHeaders,
    };
    var base64Raw ='CwSAAAAAADA=';
    var decodedRaw = Buffer.from(base64Raw, 'base64');
    var result = dataUtils.getEventModelFromRequestAndResponse(
      {
        method: 'GET',
        headers: requestHeaders,
        path: '/api/v1/test',
      },
      {},
      Date.now(),
      null,
      response,
      Date.now(),
      decodedRaw
    );
    // If decompressible, should be JSON, else base64
    if (typeof result.response.body === 'object') {
      // Should be a valid object (if decompressible)
      assert.ok(result.response.body);
      console.log('Decompressed body:', result.response.body);
    } else {
      // Should fallback to base64 string
      console.log('Base64 body:', result.response.body);
      assert.strictEqual(result.response.body, base64Raw);
      assert.strictEqual(result.response.transferEncoding, 'base64');
    }
  });

  it('should fallback to base64 if not decompressible', function () {
    var binary = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    var responseHeaders = { Server: 'cloudflare' };
    var response = {
      statusCode: 200,
      headers: responseHeaders,
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
