import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://odycbepkncscdhbrgxpu.supabase.co';
const SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9keWNiZXBrbmNzY2RoYnJneHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NTY2OTUsImV4cCI6MjEwMjIzMjY5NX0.o3kYcKWVScIQlwd9Wcx0aoNMl4x8yjUX4S_cgcsXCqY';

// No frontend cliente, NUNCA expomos a chave privada service_role
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
