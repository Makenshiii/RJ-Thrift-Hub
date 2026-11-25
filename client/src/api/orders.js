import { request } from './client.js';
import { normalizeOrder } from './normalizers.js';

export async function listOrders(token, { page = 1, limit = 20, signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  const data = await request(`/orders?${query}`, { token, signal });
  return (data || []).map(normalizeOrder);
}

export async function getOrder(token, id, signal) {
  return normalizeOrder(await request(`/orders/${encodeURIComponent(id)}`, { token, signal }));
}

export async function cancelOrder(token, id, signal) {
  return normalizeOrder(await request(`/orders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    token,
    body: {},
    signal
  }));
}

export async function verifyOrderPayment(token, id, signal) {
  const result = await request(`/orders/${encodeURIComponent(id)}/verify-payment`, {
    method: 'POST',
    token,
    body: {},
    signal
  });
  return { ...result, order: normalizeOrder(result.order) };
}

export function retryOrderPayment(token, id, signal) {
  return request(`/orders/${encodeURIComponent(id)}/retry-payment`, {
    method: 'POST',
    token,
    body: {},
    signal
  });
}
