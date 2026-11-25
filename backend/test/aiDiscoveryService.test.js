import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.GEMINI_API_KEY = '';
process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
process.env.AI_EXPLANATIONS = 'false';

const [{ aiSchema }, {
  discoverProducts,
  shapeProductFromDatabase,
  validateExplanations,
  validateInterpretation
}] = await Promise.all([
  import('../src/utils/schemas.js'),
  import('../src/services/aiDiscoveryService.js')
]);

const catalogRow = {
  category: 'Outerwear',
  sizes: ['S', 'L'],
  size: 'L',
  size_stock: { S: 2, L: 3 },
  stock: 99
};

const productRow = {
  id: 'database-product-id',
  name: 'Brown Jacket',
  description: 'A cozy brown jacket.',
  category: 'Outerwear',
  price: 799,
  image: 'https://images.example.test/brown-jacket.jpg',
  size: 'L',
  sizes: ['S', 'L'],
  size_stock: { S: 2, L: 3 },
  condition: 'Very good',
  tag: 'Vintage',
  stock: 99,
  created_at: '2026-11-25T10:00:00.000Z'
};

function fakeDatabase(products = [productRow]) {
  const rpcCalls = [];
  return {
    rpcCalls,
    from(table) {
      assert.equal(table, 'products');
      const query = {
        select() { return query; },
        async eq(column, value) {
          assert.equal(column, 'active');
          assert.equal(value, true);
          return { data: [catalogRow], error: null };
        }
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'search_products');
      rpcCalls.push(args);
      return { data: products, error: null };
    }
  };
}

function validModelOutput(overrides = {}) {
  return JSON.stringify({
    keywords: ['brown', 'jacket'],
    category: 'Outerwear',
    minPrice: null,
    maxPrice: 800,
    size: 'L',
    sort: 'newest',
    ...overrides
  });
}

test('AI request validation normalizes whitespace and removes control characters', () => {
  const result = aiSchema.parse({ query: '  cozy\tbrown\njacket\u0000 size L  ' });
  assert.equal(result.query, 'cozy brown jacket size L');
  assert.equal(aiSchema.safeParse({ query: '  x ' }).success, false);
  assert.equal(aiSchema.safeParse({ query: 'x'.repeat(201) }).success, false);
});

test('Gemini interpretation clamps values and drops unknown categories, sizes, and fields', () => {
  const interpretation = validateInterpretation(JSON.stringify({
    keywords: ['one', 'two', 'three', 'four', 'five', 'six', 'seven'],
    category: 'Not in catalog',
    minPrice: -50,
    maxPrice: 9_000_000_000,
    size: 'Not a real size',
    sort: 'newest',
    inventedPrice: 1
  }), ['Outerwear'], ['S', 'L']);

  assert.deepEqual(interpretation, {
    keywords: ['one', 'two', 'three', 'four', 'five', 'six'],
    category: null,
    minPrice: 0,
    maxPrice: 2_147_483_647,
    size: null,
    sort: 'newest'
  });
  assert.throws(() => validateInterpretation('{"keywords":"jacket"}', ['Outerwear'], ['L']));
  assert.throws(() => validateInterpretation('not JSON', ['Outerwear'], ['L']));
});

test('product shaping uses database price and size inventory and excludes sold-out rows', () => {
  const product = shapeProductFromDatabase(productRow);
  assert.equal(product.price, 799);
  assert.equal(product.stock, 5);
  assert.deepEqual(product.availableSizes, [
    { size: 'S', quantity: 2 },
    { size: 'L', quantity: 3 }
  ]);
  assert.equal(product.size_stock.L, 3);
  assert.equal(shapeProductFromDatabase({ ...productRow, size_stock: { S: 0, L: 0 }, stock: 10 }), null);
});

test('discovery searches the RPC and returns only database-shaped products', async () => {
  const database = fakeDatabase();
  const result = await discoverProducts('a brown jacket under 800, size L', {
    requestId: 'request-discovery',
    database,
    generate: async ({ responseSchema }) => {
      assert.deepEqual(responseSchema.properties.category.enum, ['Outerwear']);
      return validModelOutput({
        keywords: ['brown', 'jacket'],
        category: 'Outerwear',
        maxPrice: 800,
        size: 'L'
      });
    }
  });

  assert.deepEqual(database.rpcCalls.map(({ p_search }) => p_search), ['brown', 'jacket']);
  assert.equal(result.aiAssisted, true);
  assert.equal(result.interpretation.category, 'Outerwear');
  assert.equal(result.products[0].id, productRow.id);
  assert.equal(result.products[0].price, productRow.price);
  assert.equal(result.products[0].stock, 5);
  assert.equal(result.meta.count, 1);
  assert.equal(Object.hasOwn(result.products[0], 'inventedPrice'), false);
});

test('explanation validation drops unknown product IDs and truncates notes', () => {
  const products = [{ id: 'database-product-id' }];
  const notes = validateExplanations(JSON.stringify({
    explanations: [
      { productId: 'database-product-id', reason: 'A'.repeat(160) },
      { productId: 'not-from-database', reason: 'Untrusted reason' }
    ]
  }), products);
  assert.equal(notes.size, 1);
  assert.equal(notes.get('database-product-id').length, 140);
  assert.equal(notes.has('not-from-database'), false);
});

test('missing Gemini credentials map to a generic AI_UNAVAILABLE error', async () => {
  const logs = [];
  await assert.rejects(
    discoverProducts('cozy jacket', {
      database: fakeDatabase(),
      requestId: 'request-no-key',
      logger: (entry) => logs.push(entry)
    }),
    (error) => error.status === 503 &&
      error.code === 'AI_UNAVAILABLE' &&
      error.message === 'AI search is temporarily unavailable'
  );
  assert.equal(logs[0].requestId, 'request-no-key');
  assert.equal(logs[0].reason, 'missing_api_key');
  assert.equal(JSON.stringify(logs).includes('cozy jacket'), false);
});

test('Gemini errors map to AI_UNAVAILABLE without logging the query or provider message', async () => {
  const logs = [];
  await assert.rejects(
    discoverProducts('a private shopper request', {
      database: fakeDatabase(),
      requestId: 'request-provider-error',
      logger: (entry) => logs.push(entry),
      generate: async () => {
        throw Object.assign(new Error('raw response and API details'), { status: 429 });
      }
    }),
    (error) => error.status === 503 && error.code === 'AI_UNAVAILABLE'
  );
  const logged = JSON.stringify(logs);
  assert.equal(logged.includes('a private shopper request'), false);
  assert.equal(logged.includes('raw response and API details'), false);
  assert.equal(logs[0].requestId, 'request-provider-error');
});

test('optional explanations are added only for IDs in database results', async () => {
  let calls = 0;
  const result = await discoverProducts('brown jacket', {
    database: fakeDatabase(),
    explanationsEnabled: true,
    generate: async () => {
      calls += 1;
      if (calls === 1) return validModelOutput();
      return JSON.stringify({
        explanations: [
          { productId: productRow.id, reason: 'Matches the requested jacket style.' },
          { productId: 'unknown-product', reason: 'A fabricated item.' }
        ]
      });
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.products[0].aiNote, 'Matches the requested jacket style.');
  assert.equal(result.products.length, 1);
});
