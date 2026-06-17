import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read config safely from environment
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Verify if credentials are provided in the Secrets panel
export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({} as any, {
      get() {
        throw new Error('Supabase integration is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.');
      }
    });
