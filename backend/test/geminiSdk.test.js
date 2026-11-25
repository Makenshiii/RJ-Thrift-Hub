import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
process.env.AI_EXPLANATIONS = 'false';

const { discoverProducts } = await import('../src/services/aiDiscoveryService.js');

test('Gemini SDK sends structured filter requests with an abort signal and no catalog facts', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (input, options) => {
    requestUrl = new URL(input);
    requestOptions = options;
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          role: 'model',
          parts: [{
            text: JSON.stringify({
              keywords: ['brown', 'jacket'],
              category: 'Outerwear',
              minPrice: null,
              maxPrice: 800,
              size: 'L',
              sort: 'newest'
            })
          }]
        },
        finishReason: 'STOP'
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const product = {
    id: 'database-product',
    name: 'DB-only Jacket',
    description: 'DB-only product description.',
    category: 'Outerwear',
    price: 799,
    image: 'https://images.example.test/jacket.jpg',
    size: 'L',
    sizes: ['L'],
    size_stock: { L: 2 },
    condition: 'Good',
    tag: '',
    stock: 2,
    created_at: '2026-11-25T10:00:00.000Z'
  };
  const database = {
    from() {
      const query = {
        select() { return query; },
        async eq() { return { data: [{ category: 'Outerwear', sizes: ['L'], size: 'L', size_stock: { L: 2 }, stock: 2 }], error: null }; }
      };
      return query;
    },
    async rpc() { return { data: [product], error: null }; }
  };

  try {
    const result = await discoverProducts('a brown jacket under 800, size L', {
      database,
      requestId: 'gemini-sdk-request',
      logger: () => {}
    });

    assert.equal(requestUrl.hostname, 'generativelanguage.googleapis.com');
    assert.equal(requestUrl.pathname, '/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(requestOptions.signal instanceof AbortSignal, true);
    const body = JSON.parse(requestOptions.body);
    assert.equal(body.systemInstruction.parts[0].text.includes('untrusted data'), true);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(body.generationConfig.responseSchema.properties.category.enum[0], 'Outerwear');
    assert.equal(JSON.stringify(body).includes('DB-only product description'), false);
    assert.equal(result.products[0].price, 799);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
