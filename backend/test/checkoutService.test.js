import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.MAYA_ENVIRONMENT = 'sandbox';
process.env.MAYA_PUBLIC_KEY = 'pk_test_example';
process.env.MAYA_SECRET_KEY = 'sk_test_example';

const [{ createCheckout, resumeOrderPayment }, { supabase }, { paymentProvider }, { env }] = await Promise.all([
  import('../src/services/checkoutService.js'),
  import('../src/lib/supabase.js'),
  import('../src/services/paymentProviderFactory.js'),
  import('../src/config/env.js')
]);

test('checkout with missing Maya credentials fails before inventory reservation', async () => {
  const originalFrom = supabase.from;
  const originalRpc = supabase.rpc;
  const originalPublicKey = env.MAYA_PUBLIC_KEY;
  const originalSecretKey = env.MAYA_SECRET_KEY;
  let reservationCalls = 0;
  supabase.from = (table) => {
    assert.equal(table, 'orders');
    return {
      select() { return this; },
      eq() { return this; },
      limit() { return this; },
      maybeSingle: async () => ({ data: null, error: null })
    };
  };
  supabase.rpc = async () => {
    reservationCalls += 1;
    return { data: null, error: null };
  };
  env.MAYA_PUBLIC_KEY = '';
  env.MAYA_SECRET_KEY = '';
  try {
    await assert.rejects(createCheckout('customer-id', {
      idempotencyKey: 'checkout-test',
      couponCode: null,
      shippingAddress: {}
    }), (error) => error.code === 'MAYA_NOT_CONFIGURED');
    assert.equal(reservationCalls, 0);
  } finally {
    supabase.from = originalFrom;
    supabase.rpc = originalRpc;
    env.MAYA_PUBLIC_KEY = originalPublicKey;
    env.MAYA_SECRET_KEY = originalSecretKey;
  }
});

test('checkout reports the repair migration for the legacy one-item order constraint', async () => {
  const originalFrom = supabase.from;
  const originalRpc = supabase.rpc;
  supabase.from = (table) => {
    assert.equal(table, 'orders');
    return {
      select() { return this; },
      eq() { return this; },
      limit() { return this; },
      maybeSingle: async () => ({ data: null, error: null })
    };
  };
  supabase.rpc = async (name) => {
    assert.equal(name, 'create_order_and_reserve');
    return {
      data: null,
      error: {
        code: '23514',
        message: 'new row violates check constraint "order_items_quantity_check"'
      }
    };
  };
  try {
    await assert.rejects(createCheckout('customer-id', {
      idempotencyKey: 'checkout-quantity-test',
      couponCode: null,
      shippingAddress: {}
    }), (error) =>
      error.code === 'CHECKOUT_DATABASE_NOT_READY' &&
      error.message.includes('202611260009_repair_checkout_inventory.sql')
    );
  } finally {
    supabase.from = originalFrom;
    supabase.rpc = originalRpc;
  }
});

test('a pending order without a Maya session can safely resume checkout', async () => {
  const originalFrom = supabase.from;
  const originalCreateCheckout = paymentProvider.createCheckout;
  const orderId = 'de305d54-75b4-431b-adb2-eb6b9e546014';
  const order = {
    id: orderId,
    user_id: 'customer-id',
    status: 'pending_payment',
    subtotal: 500,
    discount: 0,
    shipping_fee: 100,
    total: 600,
    currency: 'PHP',
    shipping_address: {
      recipient: 'Alex Buyer',
      phone: '09171234567',
      address: '12 Sample St',
      city: 'Manila',
      postalCode: '1000'
    },
    reservation_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    items: [{
      product_id: 'product-id',
      name: 'Vintage Tee',
      image: 'https://example.com/tee.jpg',
      size: 'M',
      quantity: 1,
      unit_price: 500
    }]
  };
  const updateCalls = [];
  supabase.from = (table) => {
    assert.equal(table, 'orders');
    let updateValues = null;
    return {
      select() { return this; },
      update(values) { updateValues = values; updateCalls.push(values); return this; },
      eq() { return this; },
      is() { return this; },
      gt() { return this; },
      or() { return this; },
      maybeSingle: async () => ({
        data: updateValues ? { ...order, ...updateValues } : order,
        error: null
      })
    };
  };
  paymentProvider.createCheckout = async (checkoutOrder) => {
    assert.equal(checkoutOrder.id, orderId);
    assert.equal(checkoutOrder.total, 600);
    return {
      checkoutId: 'maya-session-id',
      checkoutUrl: 'https://payments-web-sandbox.paymaya.com/checkout'
    };
  };
  try {
    const result = await resumeOrderPayment('customer-id', orderId);
    assert.equal(result.paymentCheckoutId, 'maya-session-id');
    assert.equal(result.checkoutUrl, 'https://payments-web-sandbox.paymaya.com/checkout');
    assert.equal(updateCalls.length, 2);
    assert.ok(updateCalls[0].checkout_session_attempt_id);
    assert.equal(updateCalls[1].checkout_session_attempt_id, null);
  } finally {
    supabase.from = originalFrom;
    paymentProvider.createCheckout = originalCreateCheckout;
  }
});
