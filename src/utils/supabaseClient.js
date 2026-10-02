import { createClient } from '@supabase/supabase-js';

const env = (typeof import.meta !== 'undefined' && import.meta?.env) || (typeof process !== 'undefined' && process?.env) || {};
const isProduction = Boolean(env.PROD) || env.NODE_ENV === 'production';

const DEV_URL = 'https://echypqclxnztvjicnkbf.supabase.co';
const DEV_KEY = 'sb_publishable_yWto6rzjqD3rcjNfx44jRQ_fnP5q4Te';

const url = env.VITE_SUPABASE_URL || (!isProduction ? DEV_URL : '');
const publishableKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  (!isProduction ? DEV_KEY : '');

if (!url || !publishableKey) {
  throw new Error('Configuração Supabase ausente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.');
}

export const supabase = createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
