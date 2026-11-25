import { request } from './client.js';

export function discoverProducts(query, signal) {
  return request('/ai/discover', {
    method: 'POST',
    body: { query },
    signal
  });
}
