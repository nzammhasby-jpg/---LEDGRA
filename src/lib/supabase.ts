import { createClient } from '@supabase/supabase-js';

// Read config safely from environment
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// Verify if credentials are provided in the Secrets panel
export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

// Initialize Supabase Client. Pass dummy values if missing to avoid initialization crashes during compile.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project-to-prevent-crash.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key'
);
