import { describe, it, expect } from 'vitest';
import { supabase, isSupabaseConfigured } from './supabase';

describe('Supabase Configuration Safeguards', () => {
  it('should report as unconfigured when environment variables are missing', () => {
    // Under our test setup (setup.ts), VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are stubbed empty
    expect(isSupabaseConfigured).toBe(false);
  });

  it('should throw a clear configuration error when attempting to use the unconfigured proxy client', () => {
    expect(() => {
      // Accessing any property of the proxy client (like .from) should trigger the Proxy error
      supabase.from('any_table');
    }).toThrowError(/Supabase integration is not configured|Supabase initialization failed/);
  });
});
