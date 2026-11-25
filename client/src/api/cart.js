import { request } from './client.js';
import { normalizeCart } from './normalizers.js';

export async function getCart(token, signal) {
  return normalizeCart(await request('/cart', { token, signal }));
}

export async function addCartItem(token, item, signal) {
  return normalizeCart(await request('/cart/items', {
    method: 'POST',
    token,
    body: item,
    signal
  }));
}

export async function updateCartItem(token, productId, item, signal) {
  return normalizeCart(await request(`/cart/items/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    token,
    body: item,
    signal
  }));
}

export async function removeCartItem(token, productId, size, signal) {
  const query = size ? `?size=${encodeURIComponent(size)}` : '';
  return normalizeCart(await request(`/cart/items/${encodeURIComponent(productId)}${query}`, {
    method: 'DELETE',
    token,
    signal
  }));
}

export function quoteCart(token, couponCode, signal) {
  return request('/checkout/quote', {
    method: 'POST',
    token,
    body: { couponCode: couponCode || undefined },
    signal
  });
}
