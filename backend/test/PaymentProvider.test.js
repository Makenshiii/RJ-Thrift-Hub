import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.MAYA_ENVIRONMENT = 'sandbox';
process.env.MAYA_PUBLIC_KEY = 'pk_test_example';
process.env.MAYA_SECRET_KEY = 'sk_test_example';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.MAYA_WEBHOOK_PUBLIC_KEY_1 = publicKey.export({ type: 'spki', format: 'pem' });

const [{ PaymentProvider }, { MayaCheckoutProvider }, { UnavailablePaymentProvider }, { createPaymentProvider }, { env }] = await Promise.all([
  import('../src/services/PaymentProvider.js'),
  import('../src/services/MayaCheckoutProvider.js'),
  import('../src/services/UnavailablePaymentProvider.js'),
  import('../src/services/paymentProviderFactory.js'),
  import('../src/config/env.js')
]);

test('abstract payment provider operations cannot be called directly', async () => {
  const provider = new PaymentProvider();
  await assert.rejects(provider.createCheckout(), /must be implemented/);
  await assert.rejects(provider.verifyWebhook(), /must be implemented/);
  await assert.rejects(provider.verifyCheckout(), /must be implemented/);
});

test('payment provider factory supplies Maya or an explicit unavailable provider', () => {
  assert.ok(new MayaCheckoutProvider() instanceof PaymentProvider);
  assert.ok(new UnavailablePaymentProvider() instanceof PaymentProvider);
  assert.ok(createPaymentProvider() instanceof MayaCheckoutProvider);
  const secretKey = env.MAYA_SECRET_KEY;
  env.MAYA_SECRET_KEY = '';
  assert.ok(createPaymentProvider() instanceof UnavailablePaymentProvider);
  env.MAYA_SECRET_KEY = secretKey;
});

test('Maya checkout request uses hosted checkout, PHP totals, and the public API key', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify({
      checkoutId: 'maya-checkout-id',
      redirectUrl: 'https://payments-web-sandbox.paymaya.com/v2/checkout?id=maya-checkout-id'
    }), { status: 200 });
  };
  try {
    const result = await new MayaCheckoutProvider().createCheckout({
      id: 'order-reference',
      currency: 'PHP',
      subtotal: 500,
      discount: 50,
      shippingFee: 100,
      total: 550,
      shippingAddress: {
        recipient: 'Alex Buyer',
        phone: '+639171234567',
        address: '12 Sample St',
        city: 'Manila',
        postalCode: '1000'
      },
      items: [{ product: 'product-id', name: 'Vintage Tee', size: 'M', quantity: 1, unitPrice: 500 }]
    });
    const body = JSON.parse(requestOptions.body);
    assert.equal(requestUrl, 'https://pg-sandbox.paymaya.com/checkout/v1/checkouts');
    assert.equal(requestOptions.headers.Authorization, `Basic ${Buffer.from('pk_test_example:').toString('base64')}`);
    assert.equal(body.totalAmount.value, 550);
    assert.equal(body.totalAmount.details.discount, '50.00');
    assert.equal(body.requestReferenceNumber, 'order-reference');
    assert.equal(body.items[0].totalAmount.value, 500);
    assert.equal(result.checkoutId, 'maya-checkout-id');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Maya checkout reconciliation normalizes peso amounts to centavos', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://pg-sandbox.paymaya.com/payments/v1/payments/maya-payment-id');
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('sk_test_example:').toString('base64')}`);
    return new Response(JSON.stringify({
      id: 'maya-payment-id',
      amount: '550.00',
      currency: 'PHP',
      status: 'PAYMENT_SUCCESS',
      isPaid: true
    }), { status: 200 });
  };
  try {
    assert.deepEqual(await new MayaCheckoutProvider().verifyCheckout('maya-payment-id'), {
      id: 'maya-payment-id',
      amount: 55000,
      currency: 'PHP',
      status: 'PAYMENT_SUCCESS',
      paid: true
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Maya checkout webhook totals normalize from totalAmount', () => {
  const payment = new MayaCheckoutProvider().normalizePayment({
    id: 'maya-payment-id',
    status: 'COMPLETED',
    paymentStatus: 'PAYMENT_SUCCESS',
    totalAmount: { value: '550.00', currency: 'PHP' },
    isPaid: true
  });
  assert.equal(payment.amount, 55000);
  assert.equal(payment.currency, 'PHP');
  assert.equal(payment.paid, true);
});

test('Maya webhook verifies RSA signature and rejects changed payloads or stale timestamps', () => {
  const provider = new MayaCheckoutProvider();
  const payload = {
    id: 'maya-payment-id',
    isPaid: true,
    status: 'PAYMENT_SUCCESS',
    amount: '550.00',
    currency: 'PHP',
    requestReferenceNumber: 'order-reference'
  };
  const nonce = 'test-nonce';
  const timestamp = String(Date.now());
  const canonical = Object.entries(payload).map(([key, value]) => `${key}=${value}`).sort().join('&');
  const signature = sign('RSA-SHA256', Buffer.from(`${canonical}&nonce=${nonce}`), privateKey).toString('hex');
  const signatureHeader = `nonce=${nonce},v1=${signature}`;
  assert.equal(provider.verifyWebhook(payload, signatureHeader, timestamp), true);
  assert.equal(provider.verifyWebhook({ ...payload, amount: '551.00' }, signatureHeader, timestamp), false);
  assert.equal(provider.verifyWebhook(payload, signatureHeader, '1'), false);
});
