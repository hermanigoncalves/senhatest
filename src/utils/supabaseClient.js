import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 
  'https://thlyesicurtypzccqxrk.supabase.co';

const SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRobHllc2ljdXJ0eXB6Y2NxeHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTk3ODUsImV4cCI6MjEwMjI5NTc4NX0.HShVeYP8LERRjPa1IydxO69BLrVST3WpDToaYCbOh4I';

// No frontend cliente, NUNCA expomos a chave privada service_role
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
