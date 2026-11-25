import { request } from './client.js';
import { normalizeProduct } from './normalizers.js';

const CATALOG_CACHE_KEY = 'rj-public-catalog-v3';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function safeCachedProducts(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((product) =>
    product &&
    typeof product.id === 'string' &&
    typeof product.name === 'string' &&
    typeof product.category === 'string' &&
    Number.isFinite(Number(product.price)) &&
    typeof product.image === 'string' &&
    (() => {
      try {
        const image = new URL(product.image, window.location.origin);
        return image.protocol === 'https:' || image.origin === window.location.origin;
      } catch {
        return false;
      }
    })()
  ).map(normalizeProduct);
}

export function getCachedProducts() {
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
    if (!cached || Date.now() - cached.savedAt > CACHE_MAX_AGE) return [];
    return safeCachedProducts(cached.products);
  } catch {
    return [];
  }
}

function cacheProducts(products) {
  try {
    const safeProducts = products.map(({ id, _id, name, description, category, price, image, size, sizes, size_stock, condition, tag, stock, active }) => ({
      id: id ?? _id, name, description, category, price, image, size, sizes, size_stock, condition, tag, stock, active
    }));
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      products: safeProducts
    }));
  } catch (error) {
    console.warn('RJ Thrift Hub could not save the catalog for offline viewing.', error?.name || 'StorageError');
  }
}

function queryString(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export async function listProducts(filters = {}, { signal } = {}) {
  const query = queryString(filters);
  const data = await request(`/products${query ? `?${query}` : ''}`, { signal });
  const products = (data || []).map(normalizeProduct);
  if (!filters.search && (!filters.category || filters.category === 'All') &&
      Number(filters.page || 1) === 1) {
    cacheProducts(products);
  }
  return products;
}

export async function getProduct(id, { signal } = {}) {
  return normalizeProduct(await request(`/products/${encodeURIComponent(id)}`, { signal }));
}
