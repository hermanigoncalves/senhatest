import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 
  process.env.VITE_SUPABASE_URL || 
  'https://thlyesicurtypzccqxrk.supabase.co';

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRobHllc2ljdXJ0eXB6Y2NxeHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTk3ODUsImV4cCI6MjEwMjI5NTc4NX0.HShVeYP8LERRjPa1IydxO69BLrVST3WpDToaYCbOh4I';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRobHllc2ljdXJ0eXB6Y2NxeHJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjcxOTc4NSwiZXhwIjoyMTAyMjk1Nzg1fQ.BY2gHMe8C6x8Du_ySzUw9ci8fOEm40qS9aY4kRBIgbI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
