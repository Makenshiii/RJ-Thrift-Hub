import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.MAYA_PUBLIC_KEY = 'pk_test_example';
process.env.MAYA_SECRET_KEY = 'sk_test_example';

const [{ app }, { supabase }] = await Promise.all([
  import('../src/app.js'),
  import('../src/lib/supabase.js')
]);
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('health endpoint responds using the standard success envelope', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: { status: 'ok' } });
});

test('Swagger UI serves the checked-in OpenAPI contract', async () => {
  const response = await fetch(`${baseUrl.replace('/api/v1', '')}/api-docs/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /swagger-ui/);
});

test('checkout rejects a request without a Supabase access token', async () => {
  const response = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
});

test('checkout rejects a forged bearer token through Supabase Auth verification', async () => {
  const originalGetUser = supabase.auth.getUser;
  supabase.auth.getUser = async () => ({
    data: { user: null },
    error: { status: 401, message: 'Invalid token' }
  });
  try {
    const response = await fetch(`${baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer forged-token' },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
  } finally {
    supabase.auth.getUser = originalGetUser;
  }
});

test('malformed JSON receives HTTP 400 instead of an internal error', async () => {
  const response = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{'
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'MALFORMED_JSON');
});

test('Maya webhook rejects a missing signature before processing events', async () => {
  const response = await fetch(`${baseUrl}/webhooks/maya`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'maya-payment-id', status: 'PAYMENT_SUCCESS' })
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'INVALID_WEBHOOK_SIGNATURE');
});

test('AI discovery returns a controlled 503 when Gemini is not configured', async () => {
  const response = await fetch(`${baseUrl}/ai/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A relaxed top in size M' })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'AI_UNAVAILABLE');
});

test('legacy application endpoints are no longer served by Express', async () => {
  const response = await fetch(`${baseUrl}/admin/dashboard`);
  assert.equal(response.status, 404);
});
