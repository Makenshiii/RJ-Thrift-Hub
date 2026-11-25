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

const [{ PaymentProvider }, { MayaCheckoutProvider, assertMayaCheckoutConfigured }, { UnavailablePaymentProvider }, { createPaymentProvider }, { env }] = await Promise.all([
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
    assert.equal(requestOptions.headers.Accept, 'application/json');
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

test('Maya production checkout accepts the documented payments.paymaya.com host', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = env.MAYA_ENVIRONMENT;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = url;
    return new Response(JSON.stringify({
      checkoutId: 'maya-production-checkout-id',
      redirectUrl: 'https://payments.paymaya.com/v2/checkout?id=maya-production-checkout-id'
    }), { status: 200 });
  };
  env.MAYA_ENVIRONMENT = 'production';
  try {
    const result = await new MayaCheckoutProvider().createCheckout({
      id: 'order-reference',
      currency: 'PHP',
      subtotal: 500,
      discount: 0,
      shippingFee: 100,
      total: 600,
      shippingAddress: {
        recipient: 'Alex Buyer',
        phone: '+639171234567',
        address: '12 Sample St',
        city: 'Manila',
        postalCode: '1000'
      },
      items: [{ product: 'product-id', name: 'Vintage Tee', size: 'M', quantity: 1, unitPrice: 500 }]
    });
    assert.equal(requestUrl, 'https://pg.maya.ph/checkout/v1/checkouts');
    assert.equal(result.checkoutUrl, 'https://payments.paymaya.com/v2/checkout?id=maya-production-checkout-id');
  } finally {
    env.MAYA_ENVIRONMENT = originalEnvironment;
    globalThis.fetch = originalFetch;
  }
});

test('Maya Sandbox checkout accepts the returned payments-web-sandbox.maya.ph host', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    checkoutId: 'maya-sandbox-checkout-id',
    redirectUrl: 'https://payments-web-sandbox.maya.ph/v2/checkout?id=maya-sandbox-checkout-id'
  }), { status: 200 });
  try {
    const result = await new MayaCheckoutProvider().createCheckout({
      id: 'order-reference',
      currency: 'PHP',
      subtotal: 500,
      discount: 0,
      shippingFee: 100,
      total: 600,
      shippingAddress: {
        recipient: 'Alex Buyer',
        phone: '+639171234567',
        address: '12 Sample St',
        city: 'Manila',
        postalCode: '1000'
      },
      items: [{ product: 'product-id', name: 'Vintage Tee', size: 'M', quantity: 1, unitPrice: 500 }]
    });
    assert.equal(
      result.checkoutUrl,
      'https://payments-web-sandbox.maya.ph/v2/checkout?id=maya-sandbox-checkout-id'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Maya checkout normalizes a trailing DNS dot in its official host', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    checkoutId: 'maya-checkout-id',
    redirectUrl: 'https://payments-web-sandbox.paymaya.com./v2/checkout?id=maya-checkout-id'
  }), { status: 200 });
  try {
    const result = await new MayaCheckoutProvider().createCheckout({
      id: 'order-reference',
      currency: 'PHP',
      subtotal: 500,
      discount: 0,
      shippingFee: 100,
      total: 600,
      shippingAddress: {
        recipient: 'Alex Buyer',
        phone: '+639171234567',
        address: '12 Sample St',
        city: 'Manila',
        postalCode: '1000'
      },
      items: [{ product: 'product-id', name: 'Vintage Tee', size: 'M', quantity: 1, unitPrice: 500 }]
    });
    assert.equal(result.checkoutUrl, 'https://payments-web-sandbox.paymaya.com/v2/checkout?id=maya-checkout-id');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Maya checkout reports when the returned URL belongs to a different environment', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalEnvironment = env.MAYA_ENVIRONMENT;
  const logged = [];
  globalThis.fetch = async () => new Response(JSON.stringify({
    checkoutId: 'maya-checkout-id',
    redirectUrl: 'https://payments-web-sandbox.paymaya.com/v2/checkout?id=maya-checkout-id'
  }), { status: 200 });
  console.error = (entry) => logged.push(entry);
  env.MAYA_ENVIRONMENT = 'production';
  try {
    await assert.rejects(new MayaCheckoutProvider().createCheckout({
      id: 'order-reference',
      currency: 'PHP',
      subtotal: 500,
      discount: 0,
      shippingFee: 100,
      total: 600,
      shippingAddress: {
        recipient: 'Alex Buyer',
        phone: '+639171234567',
        address: '12 Sample St',
        city: 'Manila',
        postalCode: '1000'
      },
      items: [{ product: 'product-id', name: 'Vintage Tee', size: 'M', quantity: 1, unitPrice: 500 }]
    }), (error) =>
      error.code === 'MAYA_ENVIRONMENT_MISMATCH' &&
      error.message.includes('configured for production')
    );
    assert.equal(logged[0].redirectEnvironment, 'sandbox');
  } finally {
    env.MAYA_ENVIRONMENT = originalEnvironment;
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test('Maya checkout rejects a redirect outside its environment allowlist', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalEnvironment = env.MAYA_ENVIRONMENT;
  const logged = [];
  globalThis.fetch = async () => new Response(JSON.stringify({
    checkoutId: 'maya-checkout-id',
    redirectUrl: 'https://payments.paymaya.com.attacker.example/checkout'
  }), { status: 200 });
  console.error = (entry) => logged.push(entry);
  env.MAYA_ENVIRONMENT = 'production';
  try {
    await assert.rejects(new MayaCheckoutProvider().createCheckout({
      id: 'order-reference',
      currency: 'PHP',
      subtotal: 500,
      discount: 0,
      shippingFee: 100,
      total: 600,
      shippingAddress: {
        recipient: 'Alex Buyer',
        phone: '+639171234567',
        address: '12 Sample St',
        city: 'Manila',
        postalCode: '1000'
      },
      items: [{ product: 'product-id', name: 'Vintage Tee', size: 'M', quantity: 1, unitPrice: 500 }]
    }), (error) =>
      error.code === 'PAYMENT_PROVIDER_ERROR' &&
      error.message.includes('payments.paymaya.com.attacker.example')
    );
    assert.equal(logged[0].redirectHost, 'payments.paymaya.com.attacker.example');
    assert.equal(JSON.stringify(logged).includes('maya-checkout-id'), false);
  } finally {
    env.MAYA_ENVIRONMENT = originalEnvironment;
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test('missing Maya credentials fail before creating a checkout request', async () => {
  const publicKey = env.MAYA_PUBLIC_KEY;
  const secretKey = env.MAYA_SECRET_KEY;
  env.MAYA_PUBLIC_KEY = '';
  env.MAYA_SECRET_KEY = '';
  try {
    assert.throws(assertMayaCheckoutConfigured, (error) =>
      error.code === 'MAYA_NOT_CONFIGURED' &&
      error.message.includes('MAYA_PUBLIC_KEY and MAYA_SECRET_KEY')
    );
    await assert.rejects(new MayaCheckoutProvider().createCheckout({}), (error) =>
      error.code === 'MAYA_NOT_CONFIGURED'
    );
  } finally {
    env.MAYA_PUBLIC_KEY = publicKey;
    env.MAYA_SECRET_KEY = secretKey;
  }
});

test('Maya invalid credentials return a safe actionable error', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const logged = [];
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'AUTHENTICATION_ERROR',
    message: 'do not expose this provider response'
  }), { status: 401, headers: { 'x-request-id': 'maya-request-1' } });
  console.error = (entry) => logged.push(entry);
  try {
    await assert.rejects(new MayaCheckoutProvider().createCheckout({
      id: 'order-reference',
      subtotal: 500,
      discount: 0,
      shippingFee: 100,
      total: 600,
      currency: 'PHP',
      shippingAddress: {
        recipient: 'Alex Buyer',
        phone: '+639171234567',
        address: '12 Sample St',
        city: 'Manila',
        postalCode: '1000'
      },
      items: [{ product: 'product-id', name: 'Vintage Tee', size: 'M', quantity: 1, unitPrice: 500 }]
    }), (error) =>
      error.code === 'MAYA_CREDENTIALS_REJECTED' &&
      error.message.includes('Sandbox public and secret keys') &&
      !error.message.includes('sk_test_example')
    );
    assert.equal(logged[0].status, 401);
    assert.equal(logged[0].providerCode, 'AUTHENTICATION_ERROR');
    assert.equal(JSON.stringify(logged).includes('do not expose this provider response'), false);
    assert.equal(JSON.stringify(logged).includes('pk_test_example'), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test('Maya Sandbox checkout rejects lookalike hosts', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const logged = [];
  globalThis.fetch = async () => new Response(JSON.stringify({
    checkoutId: 'maya-checkout-id',
    redirectUrl: 'https://payments-web-sandbox.maya.ph.attacker.example/v2/checkout'
  }), { status: 200 });
  console.error = (entry) => logged.push(entry);
  try {
    await assert.rejects(new MayaCheckoutProvider().createCheckout({
      id: 'order-reference',
      currency: 'PHP',
      subtotal: 500,
      discount: 0,
      shippingFee: 100,
      total: 600,
      shippingAddress: {
        recipient: 'Alex Buyer',
        phone: '+639171234567',
        address: '12 Sample St',
        city: 'Manila',
        postalCode: '1000'
      },
      items: [{ product: 'product-id', name: 'Vintage Tee', size: 'M', quantity: 1, unitPrice: 500 }]
    }), (error) =>
      error.code === 'PAYMENT_PROVIDER_ERROR' &&
      error.message.includes('payments-web-sandbox.maya.ph.attacker.example')
    );
    assert.equal(logged[0].redirectHost, 'payments-web-sandbox.maya.ph.attacker.example');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test('Maya checkout reconciliation normalizes peso amounts to centavos', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://pg-sandbox.paymaya.com/payments/v1/payment-rrns/order-reference');
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('sk_test_example:').toString('base64')}`);
    assert.equal(options.headers.Accept, 'application/json');
    return new Response(JSON.stringify([{
      id: 'maya-payment-id',
      amount: '550.00',
      currency: 'PHP',
      status: 'PAYMENT_SUCCESS',
      isPaid: true,
      requestReferenceNumber: 'order-reference'
    }]), { status: 200 });
  };
  try {
    assert.deepEqual(await new MayaCheckoutProvider().verifyCheckout('order-reference'), {
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
