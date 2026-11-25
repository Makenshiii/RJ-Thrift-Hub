import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errorHandler.js';

test('internal error logs redact Maya API keys and authorization values', () => {
  const originalConsoleError = console.error;
  const entries = [];
  console.error = (entry) => entries.push(entry);
  const res = {
    statusCode: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  try {
    errorHandler(
      new Error('key pk-AbCdEfGh12345678 sk_test_AbCdEfGh12345678 Authorization: Basic c2VjcmV0'),
      { id: 'request-1' },
      res,
      () => {}
    );
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.stringify(entries).includes('AbCdEfGh12345678'), false);
    assert.equal(JSON.stringify(entries).includes('c2VjcmV0'), false);
    assert.equal(entries[0].message.includes('[REDACTED_MAYA_KEY]'), true);
  } finally {
    console.error = originalConsoleError;
  }
});
