import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.MAYA_PUBLIC_KEY = 'pk_test_example';
process.env.MAYA_SECRET_KEY = 'sk_test_example';
process.env.GEMINI_API_KEY = '';

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

test('public product catalog uses the Express-backed Supabase client', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(baseUrl)) return originalFetch(url, options);
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify([{ id: 'product-id', name: 'Vintage Tee', active: true }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const response = await fetch(`${baseUrl}/products?category=Tops&limit=10`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data[0].name, 'Vintage Tee');
    assert.match(requestUrl, /\/rest\/v1\/rpc\/search_products$/);
    assert.equal(new Headers(requestOptions.headers).get('authorization'), 'Bearer test-publishable-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin endpoints reject authenticated non-admin users', async () => {
  const originalGetUser = supabase.auth.getUser;
  const originalFrom = supabase.from;
  supabase.auth.getUser = async () => ({
    data: { user: { id: 'customer-id' } },
    error: null
  });
  supabase.from = (table) => {
    assert.equal(table, 'profiles');
    return {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({
        data: { id: 'customer-id', name: 'Customer', email: 'customer@example.com', role: 'customer' },
        error: null
      })
    };
  };
  try {
    const response = await fetch(`${baseUrl}/admin/dashboard`, {
      headers: { Authorization: 'Bearer valid-customer-token' }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'FORBIDDEN');
  } finally {
    supabase.auth.getUser = originalGetUser;
    supabase.from = originalFrom;
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
    body: JSON.stringify({ query: 'A relaxed top in size M' })
  });
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.error.code, 'AI_UNAVAILABLE');
  assert.equal(result.error.message, 'AI search is temporarily unavailable');
});

test('AI discovery rejects a query outside its normalized length limit with HTTP 400', async () => {
  const response = await fetch(`${baseUrl}/ai/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'x'.repeat(201) })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'AI_QUERY_INVALID');
});

test('unknown application endpoints are not served by Express', async () => {
  const response = await fetch(`${baseUrl}/legacy/admin/dashboard`);
  assert.equal(response.status, 404);
});
