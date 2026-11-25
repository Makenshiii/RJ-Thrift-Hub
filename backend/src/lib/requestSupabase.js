import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

function createRequestClient(accessToken) {
  if (!env.SUPABASE_PUBLISHABLE_KEY) {
    throw new AppError(503, 'SUPABASE_API_NOT_CONFIGURED', 'Set SUPABASE_PUBLISHABLE_KEY in backend/.env to enable the REST API.');
  }
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  };
  if (accessToken) {
    options.global = {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${accessToken}`);
        return globalThis.fetch(input, { ...init, headers });
      }
    };
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
}

export function createPublicSupabase() {
  return createRequestClient();
}

export function createUserSupabase(accessToken) {
  if (!accessToken) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return createRequestClient(accessToken);
}
