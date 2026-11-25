const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor({ message, code, status, details, requestId }) {
    super(message || 'The request could not be completed.');
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export async function request(path, {
  method = 'GET',
  token,
  body,
  headers = {},
  signal
} = {}) {
  const upperMethod = method.toUpperCase();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: upperMethod,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
      cache: upperMethod === 'GET' ? 'default' : 'no-store'
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError({
      message: 'The shop service is unreachable. Check your connection and try again.',
      code: 'NETWORK_UNAVAILABLE',
      status: 0
    });
  }

  let payload = null;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      throw new ApiError({
        message: 'The shop service returned an unreadable response.',
        code: 'INVALID_API_RESPONSE',
        status: response.status,
        requestId: response.headers.get('x-request-id') || undefined
      });
    }
  }
  if (!response.ok || payload?.success === false) {
    throw new ApiError({
      message: payload?.error?.message || 'The request could not be completed.',
      code: payload?.error?.code || 'API_ERROR',
      status: response.status,
      details: payload?.error?.details,
      requestId: payload?.requestId || response.headers.get('x-request-id') || undefined
    });
  }
  return payload?.data;
}

export function getProductId(product) {
  return product?._id ?? product?.id;
}
