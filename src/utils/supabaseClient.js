/* global process */
import { createClient } from '@supabase/supabase-js';

// Vite injeta import.meta.env no navegador; os testes em Node usam process.env.
const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;
const env = viteEnv && viteEnv.VITE_SUPABASE_URL !== undefined ? viteEnv : { ...nodeEnv, ...viteEnv };

const url = env.VITE_SUPABASE_URL || '';
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';

export const SUPABASE_CONFIG_ERROR =
  'Configuração Supabase ausente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example).';

// Não existe mais fallback silencioso para o projeto de teste: sem configuração, falha de forma explícita.
if (!url || !publishableKey) {
  throw new Error(SUPABASE_CONFIG_ERROR);
}

export const supabase = createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
