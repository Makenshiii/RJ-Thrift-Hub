import { request } from './client.js';

export function createCheckout(token, details, signal) {
  return request('/checkout', {
    method: 'POST',
    token,
    body: details,
    headers: { 'Idempotency-Key': details.idempotencyKey },
    signal
  });
}
