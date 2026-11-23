import { supabase } from '../lib/supabase.js';

export async function connectDatabase() {
  const { error } = await supabase.from('profiles').select('id').limit(1);
  if (error) throw new Error(`Supabase database connection failed: ${error.message}`);
  return supabase;
}
