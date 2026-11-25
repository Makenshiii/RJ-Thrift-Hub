import { verify as verifySignature } from 'node:crypto';
import { env } from '../config/env.js';
import { PaymentProvider } from './PaymentProvider.js';
import { AppError } from '../utils/errors.js';

const apiHosts = {
  sandbox: 'https://pg-sandbox.paymaya.com',
  production: 'https://pg.maya.ph'
};

const checkoutHosts = {
  sandbox: new Set([
    'payments-web-sandbox.paymaya.com',
    'payments-web-sandbox.maya.ph'
  ]),
  production: new Set(['payments.maya.ph', 'payments.paymaya.com'])
};

const webhookPublicKeys = {
  sandbox: [
    `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjNkSX6p+goDPaPAYuTzT
zKTCBeLhh8FkPMbZxDKTUxF93dOwiC7jsdx7KyopupeLosiVlbs+gpAJ7XBQP/Ex
giyzXC9TljpyvkUQfyRPMAMKq+BzxdUliTl6hgrLBsH28CP5FuPHCsfxDXe7mDtv
9H4mP3SKO0HfkZ45tudxD9CWbwWKF0lU9LRbLlJ0y7KEaK7Rv9fI1Dp/KPT+9pls
tU+CPNKaxJjGRKGuxW2AOCabSD0cTZNXki+K51mNoma7Mj1HMhnsR68FGJvCqk1q
Wsr3q8+EUMVPBMX+5nKATfZYGvxg4ytzT8pnEVeWl6phYKviB9aVVwurh1gDJB4r
lQIDAQAB
-----END PUBLIC KEY-----`,
    `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp14gezqq4dGWu7EZ7BHx
8wD3y1hqxwQR7UYPXtXJP+WngN4wqwatjsnQaRGnmdPRG8VEzUzw9PlR7t7P24uW
+J08xBrtTVouD2MKglcIcy13rt1XL79zr/LIAFMFI6f4O8/OQi1xsGsZ6xarD+wl
OQKG4W66I3yp2jNAbge25eSPuo0BNqPWvebMcIYJu4f3Fxu1eDgeM6zCEqLc6+jX
cNTP/zFHCvQaiIlLOqfgXDRPBcHPPZ2qcB99UVPAHXBKsKdtBB2w2qT2l99MlTAB
iRy+IKtVQcQyRP7T8blegO25x35G2CZ3VCKPkmUen3eXQ4+r5fVlzEIBSfNvBwT9
jQIDAQAB
-----END PUBLIC KEY-----`
  ],
  production: [
    `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjCGhkjg1PQe0WVHCYdTT
2luqzXhKfeStALWlEcMpHqYusd6dAU4vZ9bGQns/OYe/H2cIxEPvRJnRcipMKvVZ
pzAFEKHQLiXdeuNcxkAaxEZEwMAmFdVGmNLZbpi579r2s6Q++zYy0OHb9awY/2z0
OYRwV5XN7SCrqIlf1tEHfxKV2cJDCFW030nnRMoWisQ9KXG3Ihvjj4tOQimPCtzp
SDtlf6QFmg/WZBIOEdLro9oROztK6PwrI/yG5ZFaUCQYfY8fw0y1/PI3heEf8z5k
xA466LdSqCeVdGwfjKy9ZHown8XiiPI82HnBrMP3UPX4efEfopbP4SpDFOEwRNA9
FQIDAQAB
-----END PUBLIC KEY-----`,
    `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxZJxNmpNYjxFCBa2P6Ad
wzDDuDKOKAgiTBrQvJGuX/l2u32N4d4FYw99md16rf1iIcxD70/KG9nWrltrxbIs
bm9+bCHVLKMfdjaJQCBGXN/WW6W1XaGQQPft9UlmAwA/uMKTsN/2XqFjoKSJoe9e
Xz/p3pGn66oBTCwvzDqma46GxF92atiOt6CEcRl8P+dDKJlYY7fcxiuNMeDMOOla
KMxUz9nMgJ6uESK/kS8C8+hGuiCWgKeIRm/ONL5Gk/lypWzrphaKcWqpBGZxpNAL
AVmPY9ke4+RxyojkEre4d5sT2C21oAQVHyGewd0ttQ/bK59X17+yg5FOfRpI1BKj
7wIDAQAB
-----END PUBLIC KEY-----`
  ]
};

export function assertMayaCheckoutConfigured() {
  const missing = [];
  if (!env.MAYA_PUBLIC_KEY) missing.push('MAYA_PUBLIC_KEY');
  if (!env.MAYA_SECRET_KEY) missing.push('MAYA_SECRET_KEY');
  if (missing.length) {
    throw new AppError(
      503,
      'MAYA_NOT_CONFIGURED',
      `Set ${missing.join(' and ')} in backend/.env using Maya ${env.MAYA_ENVIRONMENT} API keys.`
    );
  }
}

function flattenPayload(value, prefix = '', pairs = []) {
  if (value === null || value === undefined || value === '') return pairs;
  if (Array.isArray(value)) {
    if (!value.length) return pairs;
    value.forEach((entry, index) => flattenPayload(entry, `${prefix}.${index}`, pairs));
    return pairs;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return pairs;
    for (const [key, entry] of entries) {
      flattenPayload(entry, prefix ? `${prefix}.${key}` : key, pairs);
    }
    return pairs;
  }
  pairs.push(`${prefix}=${String(value)}`);
  return pairs;
}

function parseSignature(header) {
  const values = {};
  for (const part of (header || '').split(',')) {
    const separator = part.indexOf('=');
    if (separator > 0) values[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return values;
}

export class MayaCheckoutProvider extends PaymentProvider {
  get apiBaseUrl() {
    return apiHosts[env.MAYA_ENVIRONMENT];
  }

  async createCheckout(order) {
    assertMayaCheckoutConfigured();

    const [firstName, ...lastNameParts] = order.shippingAddress.recipient.trim().split(/\s+/);
    const lastName = lastNameParts.join(' ') || firstName;
    const amount = (value) => Number(Number(value).toFixed(2));
    const requestBody = {
      totalAmount: {
        currency: order.currency || 'PHP',
        value: amount(order.total),
        details: {
          subtotal: amount(order.subtotal).toFixed(2),
          discount: amount(order.discount).toFixed(2),
          shippingFee: amount(order.shippingFee).toFixed(2)
        }
      },
      buyer: {
        firstName,
        lastName,
        contact: { phone: order.shippingAddress.phone },
        shippingAddress: {
          firstName,
          lastName,
          phone: order.shippingAddress.phone,
          shippingType: 'ST',
          line1: order.shippingAddress.address,
          city: order.shippingAddress.city,
          zipCode: order.shippingAddress.postalCode,
          countryCode: 'PH'
        }
      },
      items: order.items.map((item) => ({
        name: item.name,
        code: String(item.product),
        description: `Size ${item.size}`,
        quantity: String(item.quantity),
        amount: { value: amount(item.unitPrice) },
        totalAmount: { value: amount(item.unitPrice * item.quantity) }
      })),
      redirectUrl: {
        success: `${env.CLIENT_ORIGIN}/?payment=return&order=${order.id}`,
        failure: `${env.CLIENT_ORIGIN}/?payment=failure&order=${order.id}`,
        cancel: `${env.CLIENT_ORIGIN}/?payment=cancel&order=${order.id}`
      },
      requestReferenceNumber: order.id
    };

    let response;
    try {
      const authorization = Buffer.from(`${env.MAYA_PUBLIC_KEY}:`).toString('base64');
      response = await fetch(`${this.apiBaseUrl}/checkout/v1/checkouts`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      console.error({ integration: 'maya', operation: 'create-checkout', errorName: error.name });
      throw new AppError(503, 'PAYMENT_UNAVAILABLE', 'Maya Checkout could not be reached. Please retry checkout.');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Maya Checkout returned an invalid response.');
    }
    if (!response.ok || !payload?.checkoutId || !payload?.redirectUrl) {
      const requestId = response.headers.get('x-request-id') || response.headers.get('x-maya-request-id');
      const providerCode = typeof payload?.code === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(payload.code)
        ? payload.code
        : undefined;
      console.error({
        integration: 'maya',
        operation: 'create-checkout',
        status: response.status,
        providerCode,
        providerRequestId: requestId || undefined
      });
      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          503,
          'MAYA_CREDENTIALS_REJECTED',
          `Maya rejected the configured ${env.MAYA_ENVIRONMENT} API keys. Use matching Sandbox public and secret keys.`
        );
      }
      throw new AppError(
        502,
        'MAYA_CHECKOUT_REJECTED',
        'Maya rejected the checkout request. Check the backend logs and payment details.'
      );
    }
    let redirectUrl;
    try {
      redirectUrl = new URL(payload.redirectUrl);
    } catch {
      console.error({
        integration: 'maya',
        operation: 'create-checkout',
        environment: env.MAYA_ENVIRONMENT,
        status: response.status,
        providerRequestId: response.headers.get('x-request-id') || response.headers.get('x-maya-request-id') || undefined,
        redirectHost: undefined
      });
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Maya Checkout returned an invalid payment URL.');
    }
    const redirectHost = redirectUrl.hostname.toLowerCase().replace(/\.$/, '');
    const redirectEnvironment = Object.entries(checkoutHosts)
      .find(([, hosts]) => hosts.has(redirectHost))?.[0];
    if (redirectUrl.protocol !== 'https:' || redirectUrl.username || redirectUrl.password || redirectUrl.port) {
      console.error({
        integration: 'maya',
        operation: 'create-checkout',
        environment: env.MAYA_ENVIRONMENT,
        status: response.status,
        providerRequestId: response.headers.get('x-request-id') || response.headers.get('x-maya-request-id') || undefined,
        redirectHost
      });
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Maya Checkout returned an invalid payment URL.');
    }
    if (!redirectEnvironment) {
      console.error({
        integration: 'maya',
        operation: 'create-checkout',
        environment: env.MAYA_ENVIRONMENT,
        status: response.status,
        providerRequestId: response.headers.get('x-request-id') || response.headers.get('x-maya-request-id') || undefined,
        redirectHost
      });
      throw new AppError(
        502,
        'PAYMENT_PROVIDER_ERROR',
        `Maya returned an unsupported checkout host (${redirectHost}) for ${env.MAYA_ENVIRONMENT}. Confirm the environment matches the API keys.`
      );
    }
    if (redirectEnvironment !== env.MAYA_ENVIRONMENT) {
      console.error({
        integration: 'maya',
        operation: 'create-checkout',
        environment: env.MAYA_ENVIRONMENT,
        redirectEnvironment,
        status: response.status,
        providerRequestId: response.headers.get('x-request-id') || response.headers.get('x-maya-request-id') || undefined,
        redirectHost
      });
      throw new AppError(
        502,
        'MAYA_ENVIRONMENT_MISMATCH',
        `Maya returned a ${redirectEnvironment} checkout link, but the backend is configured for ${env.MAYA_ENVIRONMENT}. Use matching MAYA_ENVIRONMENT and API keys.`
      );
    }
    if (redirectUrl.hostname !== redirectHost) redirectUrl.hostname = redirectHost;
    return { checkoutId: payload.checkoutId, checkoutUrl: redirectUrl.toString() };
  }

  async verifyCheckout(requestReferenceNumber) {
    if (!env.MAYA_SECRET_KEY) {
      throw new AppError(503, 'MAYA_NOT_CONFIGURED', 'Set MAYA_SECRET_KEY in backend/.env to verify payments.');
    }
    if (!requestReferenceNumber) {
      throw new AppError(400, 'PAYMENT_REFERENCE_MISSING', 'The order is missing its Maya payment reference.');
    }
    const authorization = Buffer.from(`${env.MAYA_SECRET_KEY}:`).toString('base64');
    let response;
    try {
      response = await fetch(`${this.apiBaseUrl}/payments/v1/payment-rrns/${encodeURIComponent(requestReferenceNumber)}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${authorization}`
        },
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      console.error({ integration: 'maya', operation: 'verify-payment', errorName: error.name });
      throw new AppError(503, 'PAYMENT_UNAVAILABLE', 'Maya Checkout could not be reached while verifying payment.');
    }
    if (!response.ok) {
      console.error({
        integration: 'maya',
        operation: 'verify-payment',
        status: response.status,
        providerRequestId: response.headers.get('x-request-id') || response.headers.get('x-maya-request-id') || undefined
      });
      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          503,
          'MAYA_CREDENTIALS_REJECTED',
          `Maya rejected the configured ${env.MAYA_ENVIRONMENT} secret key. Use the matching Sandbox secret key.`
        );
      }
      throw new AppError(503, 'PAYMENT_UNAVAILABLE', 'Maya Checkout could not verify this payment.');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Maya Checkout returned an invalid verification response.');
    }
    if (!Array.isArray(payload)) {
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Maya returned an invalid payment lookup response.');
    }
    const payment = payload.find((item) => item?.requestReferenceNumber === requestReferenceNumber);
    if (!payment) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Maya has no payment record for this order yet.');
    }
    return this.normalizePayment(payment);
  }

  normalizePayment(payload) {
    const rawAmountValue = payload?.amount ?? payload?.totalAmount?.value ??
      payload?.paymentDetails?.responses?.efs?.amount?.total?.value;
    const currency = payload?.currency ?? payload?.totalAmount?.currency ??
      payload?.paymentDetails?.responses?.efs?.amount?.total?.currency;
    const rawAmount = Number(rawAmountValue);
    const status = payload?.paymentStatus ?? payload?.status;
    if (!payload?.id || rawAmountValue === null || rawAmountValue === undefined || rawAmountValue === '' ||
        !Number.isFinite(rawAmount) || !currency || !status) {
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Maya Checkout returned incomplete payment details.');
    }
    return {
      id: payload.id,
      amount: Math.round(rawAmount * 100),
      currency: String(currency).toUpperCase(),
      status,
      paid: payload.isPaid === true || status === 'PAYMENT_SUCCESS'
    };
  }

  verifyWebhook(payload, signatureHeader, timestampHeader) {
    const timestamp = Number(timestampHeader);
    const { nonce, v1 } = parseSignature(signatureHeader);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000 || !nonce || !/^[\da-f]+$/i.test(v1 || '')) {
      return false;
    }

    const signedPayload = `${flattenPayload(payload).sort().join('&')}&nonce=${nonce}`;
    const keys = webhookPublicKeys[env.MAYA_ENVIRONMENT];
    return keys.some((defaultKey, index) => {
      const publicKey = env[`MAYA_WEBHOOK_PUBLIC_KEY_${index + 1}`] || defaultKey;
      try {
        return verifySignature('RSA-SHA256', Buffer.from(signedPayload), publicKey, Buffer.from(v1, 'hex'));
      } catch {
        return false;
      }
    });
  }
}
