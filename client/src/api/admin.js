import { request } from './client.js';
import { normalizeCoupon, normalizeOrder, normalizeProduct } from './normalizers.js';

export async function getAdminDashboard(token, signal) {
  return request('/admin/dashboard', { token, signal });
}

export async function listAdminProducts(token, signal) {
  return (await request('/admin/products', { token, signal })).map(normalizeProduct);
}

export async function createAdminProduct(token, product, signal) {
  return normalizeProduct(await request('/admin/products', {
    method: 'POST', token, body: product, signal
  }));
}

export async function updateAdminProduct(token, id, patch, signal) {
  return normalizeProduct(await request(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH', token, body: patch, signal
  }));
}

export async function updateAdminInventory(token, id, inventory, signal) {
  return normalizeProduct(await request(`/admin/products/${encodeURIComponent(id)}/inventory`, {
    method: 'PATCH', token, body: inventory, signal
  }));
}

export async function listAdminOrders(token, signal) {
  return (await request('/admin/orders', { token, signal })).map(normalizeOrder);
}

export async function updateAdminOrderStatus(token, id, status, signal) {
  return normalizeOrder(await request(`/admin/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', token, body: { status }, signal
  }));
}

export async function listAdminCoupons(token, signal) {
  return (await request('/admin/coupons', { token, signal })).map(normalizeCoupon);
}

export async function createAdminCoupon(token, coupon, signal) {
  return normalizeCoupon(await request('/admin/coupons', {
    method: 'POST', token, body: coupon, signal
  }));
}

export async function updateAdminCoupon(token, id, patch, signal) {
  return normalizeCoupon(await request(`/admin/coupons/${encodeURIComponent(id)}`, {
    method: 'PATCH', token, body: patch, signal
  }));
}
