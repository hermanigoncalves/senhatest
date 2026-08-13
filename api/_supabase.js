import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://odycbepkncscdhbrgxpu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9keWNiZXBrbmNzY2RoYnJneHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NTY2OTUsImV4cCI6MjEwMjIzMjY5NX0.o3kYcKWVScIQlwd9Wcx0aoNMl4x8yjUX4S_cgcsXCqY';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9keWNiZXBrbmNzY2RoYnJneHB1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjY1NjY5NSwiZXhwIjoyMTAyMjMyNjk1fQ.XatXU4igi8K-fvSegB7Uiy12yvc95LuHsmw49j1PPxo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
