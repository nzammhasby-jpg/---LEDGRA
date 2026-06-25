import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read config safely from environment
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client: SupabaseClient | null = null;
let initError: string | null = null;

if (supabaseUrl && supabaseAnonKey && (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://'))) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err: any) {
    console.error('Failed to initialize Supabase client:', err);
    initError = err.message || String(err);
  }
}

// Verify if credentials are provided and successfully initialized
export const isSupabaseConfigured = !!client;

export const supabase: SupabaseClient = client || new Proxy({} as any, {
  get(target, prop) {
    throw new Error(
      initError 
        ? `Supabase initialization failed: ${initError}`
        : 'Supabase integration is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.'
    );
  }
});
