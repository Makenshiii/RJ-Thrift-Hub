import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.MAYA_ENVIRONMENT = 'sandbox';
process.env.MAYA_PUBLIC_KEY = 'pk_test_example';
process.env.MAYA_SECRET_KEY = 'sk_test_example';

const [{ mayaWebhook }, { supabase }, { paymentProvider }] = await Promise.all([
  import('../src/controllers/webhookController.js'),
  import('../src/lib/supabase.js'),
  import('../src/services/paymentProviderFactory.js')
]);

const orderId = 'de305d54-75b4-431b-adb2-eb6b9e546014';

async function deliverWebhook({ payload, duplicate = false }) {
  const eventId = `${payload.id}:${payload.paymentStatus ?? payload.status}:${payload.updatedAt ?? payload.createdAt ?? 'v1'}`;
  const order = {
    id: orderId,
    status: 'pending_payment',
    total: 550,
    currency: 'PHP',
    payment_checkout_id: 'maya-checkout-id'
  };
  const calls = [];
  paymentProvider.verifyWebhook = () => true;
  supabase.from = (table) => {
    calls.push(`from:${table}`);
    if (table === 'payment_events') {
      return {
        insert() { return this; },
        select() { return this; },
        maybeSingle: async () => duplicate
          ? { data: null, error: { code: '23505' } }
          : { data: { event_id: eventId, processed_at: null }, error: null },
        eq() { return this; },
        single: async () => ({
          data: { event_id: eventId, processed_at: '2026-01-01T00:00:00.000Z' },
          error: null
        }),
        update() { return this; }
      };
    }
    if (table === 'orders') {
      const filters = {};
      return {
        select() { return this; },
        eq(field, value) { filters[field] = value; return this; },
        maybeSingle: async () => {
          if (filters.payment_checkout_id) return { data: null, error: null };
          if (filters.id === orderId) return { data: { ...order, items: [] }, error: null };
          return { data: null, error: null };
        }
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };
  const rpc = supabase.rpc;
  supabase.rpc = async (name, args) => {
    calls.push(`rpc:${name}`);
    if (name === 'finalize_order_payment') {
      assert.equal(args.p_paid, true);
      assert.equal(args.p_amount_cents, 55000);
      order.status = 'paid';
      return { data: { paid: true, mismatch: false }, error: null };
    }
    if (name === 'release_order_reservation') {
      order.status = args.p_status;
      return { data: null, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  };
  const req = {
    body: Buffer.from(JSON.stringify(payload)),
    get: () => 'test-signature'
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  try {
    await mayaWebhook(req, res);
    return { res, order, calls };
  } finally {
    supabase.rpc = rpc;
  }
}

test('duplicate processed Maya webhook events do not reprocess the order', async () => {
  const result = await deliverWebhook({
    duplicate: true,
    payload: {
      id: 'maya-payment-id',
      paymentStatus: 'PAYMENT_SUCCESS',
      amount: '550.00',
      currency: 'PHP',
      isPaid: true,
      requestReferenceNumber: orderId
    }
  });
  assert.equal(result.res.statusCode, 200);
  assert.deepEqual(result.res.body.data, { received: true, duplicate: true });
  assert.equal(result.calls.some((call) => call.startsWith('from:orders')), false);
  assert.equal(result.calls.some((call) => call.startsWith('rpc:')), false);
});

test('verified successful webhook finalizes the referenced order', async () => {
  const result = await deliverWebhook({
    payload: {
      id: 'maya-payment-id',
      paymentStatus: 'PAYMENT_SUCCESS',
      amount: '550.00',
      currency: 'PHP',
      isPaid: true,
      requestReferenceNumber: orderId
    }
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.order.status, 'paid');
  assert.ok(result.calls.includes('rpc:finalize_order_payment'));
});

test('failed Maya payment releases its reservation without marking the order paid', async () => {
  const result = await deliverWebhook({
    payload: {
      id: 'maya-payment-id',
      paymentStatus: 'PAYMENT_FAILED',
      amount: '550.00',
      currency: 'PHP',
      isPaid: false,
      requestReferenceNumber: orderId
    }
  });
  assert.equal(result.order.status, 'expired');
  assert.ok(result.calls.includes('rpc:release_order_reservation'));
  assert.equal(result.calls.includes('rpc:finalize_order_payment'), false);
});
