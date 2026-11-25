import { request } from './client.js';

export function registerAccount(details, signal) {
  return request('/auth/register', { method: 'POST', body: details, signal });
}

export function loginAccount(credentials, signal) {
  return request('/auth/login', { method: 'POST', body: credentials, signal });
}

export function refreshAccount(refreshToken, signal) {
  return request('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    signal
  });
}

export function logoutAccount(token, refreshToken, signal) {
  return request('/auth/logout', {
    method: 'POST',
    token,
    body: { refreshToken },
    signal
  });
}

export function getCurrentAccount(token, signal) {
  return request('/auth/me', { token, signal });
}
