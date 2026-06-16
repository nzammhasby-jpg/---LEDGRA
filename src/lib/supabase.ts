import { createClient } from '@supabase/supabase-js';

// Read config safely from environment
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// Verify if credentials are provided in the Secrets panel
export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

// Elegant non-crashing proxy client that returns empty/error results without dummy keys
const createNullProxy = (): any => {
  const dummyFn = () => {};
  return new Proxy(dummyFn, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: any) => resolve({ data: null, error: new Error('Supabase is not configured') });
      }
      if (prop === 'unsubscribe') {
        return () => {};
      }
      return createNullProxy();
    },
    apply(target, thisArg, argumentsList) {
      return createNullProxy();
    }
  });
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createNullProxy();
