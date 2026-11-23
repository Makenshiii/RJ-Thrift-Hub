import { supabase } from '../lib/supabase.js';
import { AppError, asyncHandler } from '../utils/errors.js';

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError && ![400, 401].includes(authError.status)) {
    throw new AppError(503, 'AUTH_UNAVAILABLE', 'Supabase authentication is temporarily unavailable.');
  }
  if (authError || !authData.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session is invalid or has expired.');
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,name,email,role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new AppError(401, 'UNAUTHENTICATED', 'Your account profile is unavailable.');
  req.user = { id: profile.id, name: profile.name, email: profile.email, role: profile.role };
  next();
});

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(new AppError(403, 'FORBIDDEN', 'Administrator access is required.'));
  return next();
}
