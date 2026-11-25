import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const [{ createUserSupabase }, { env }] = await Promise.all([
  import('../src/lib/requestSupabase.js'),
  import('../src/config/env.js')
]);

test('user-scoped Supabase calls carry only the verified customer access token', async () => {
  const originalFetch = globalThis.fetch;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/rest\/v1\/rpc\/get_cart$/);
    requestOptions = options;
    return new Response(JSON.stringify({ items: [], subtotal: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const { data, error } = await createUserSupabase('customer-access-token').rpc('get_cart');
    assert.equal(error, null);
    assert.deepEqual(data, { items: [], subtotal: 0 });
    const headers = new Headers(requestOptions.headers);
    assert.equal(headers.get('authorization'), 'Bearer customer-access-token');
    assert.equal(headers.get('apikey'), 'test-publishable-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('REST client refuses to start without the Supabase publishable key', () => {
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  env.SUPABASE_PUBLISHABLE_KEY = '';
  try {
    assert.throws(() => createUserSupabase('customer-access-token'), (error) =>
      error.code === 'SUPABASE_API_NOT_CONFIGURED'
    );
  } finally {
    env.SUPABASE_PUBLISHABLE_KEY = publishableKey;
  }
});
