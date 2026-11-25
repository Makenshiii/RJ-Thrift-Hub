import { supabase } from '../lib/supabase.js';
import { createPublicSupabase } from '../lib/requestSupabase.js';
import { AppError, success } from '../utils/errors.js';

function authUnavailable(error, operation) {
  const status = Number(error?.status);
  console.error({
    integration: 'supabase-auth',
    operation,
    status: Number.isInteger(status) ? status : undefined,
    providerCode: typeof error?.code === 'string' ? error.code : undefined
  });
  if (status === 400 || status === 401) {
    return new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }
  if (status === 409) {
    return new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email already exists.');
  }
  return new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable. Please try again.');
}

async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles')
    .select('id,name,email,role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError(401, 'PROFILE_UNAVAILABLE', 'Your account profile is unavailable.');
  return data;
}

async function sessionData(session) {
  if (!session?.access_token || !session.refresh_token || !session.user?.id) {
    throw new AppError(503, 'AUTH_SESSION_UNAVAILABLE', 'Authentication did not return a usable session.');
  }
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    user: await getProfile(session.user.id)
  };
}

export async function register(req, res) {
  const auth = createPublicSupabase();
  const { data, error } = await auth.auth.signUp({
    email: req.body.email,
    password: req.body.password,
    options: { data: { name: req.body.name } }
  });
  if (error) throw authUnavailable(error, 'register');
  if (!data.session) {
    return success(res, {
      requiresEmailConfirmation: true,
      message: 'Account created. Confirm your email, then sign in.'
    }, 201);
  }
  return success(res, await sessionData(data.session), 201);
}

export async function login(req, res) {
  const auth = createPublicSupabase();
  const { data, error } = await auth.auth.signInWithPassword({
    email: req.body.email,
    password: req.body.password
  });
  if (error) throw authUnavailable(error, 'login');
  return success(res, await sessionData(data.session));
}

export async function refresh(req, res) {
  const auth = createPublicSupabase();
  const { data, error } = await auth.auth.refreshSession({ refresh_token: req.body.refreshToken });
  if (error) throw authUnavailable(error, 'refresh');
  return success(res, await sessionData(data.session));
}

export async function logout(req, res) {
  const auth = createPublicSupabase();
  const { error: sessionError } = await auth.auth.setSession({
    access_token: req.accessToken,
    refresh_token: req.body.refreshToken
  });
  if (sessionError) throw authUnavailable(sessionError, 'logout');
  const { error } = await auth.auth.signOut({ scope: 'global' });
  if (error) throw authUnavailable(error, 'logout');
  return success(res, { signedOut: true });
}

export async function currentUser(req, res) {
  return success(res, req.user);
}
