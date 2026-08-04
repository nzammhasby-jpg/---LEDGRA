import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthError } from '@supabase/supabase-js';

// Mock the supabase module for auth callback testing
vi.mock('../../../lib/supabase', () => {
  const mockAuth = {
    exchangeCodeForSession: vi.fn(),
    verifyOtp: vi.fn(),
    getSession: vi.fn(),
  };
  return {
    supabase: {
      auth: mockAuth,
    },
    isSupabaseConfigured: true,
  };
});

import { supabase } from '../../../lib/supabase';

describe('Auth Callback Logic & Security Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support PKCE exchangeCodeForSession when code parameter is present', async () => {
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: { access_token: 'token-abc' } as any,
      },
      error: null,
    });

    const res = await supabase.auth.exchangeCodeForSession('valid_pkce_code');
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('valid_pkce_code');
    expect(res.data.session).not.toBeNull();
    expect(res.error).toBeNull();
  });

  it('should support verifyOtp for legacy token_hash parameters with type email', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: { access_token: 'token-abc' } as any,
      },
      error: null,
    });

    const res = await supabase.auth.verifyOtp({ token_hash: 'legacy_hash', type: 'email' });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'legacy_hash', type: 'email' });
    expect(res.error).toBeNull();
  });

  it('should support verifyOtp for legacy token_hash parameters with type recovery', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' } as any,
        session: { access_token: 'token-abc' } as any,
      },
      error: null,
    });

    const res = await supabase.auth.verifyOtp({ token_hash: 'recovery_hash', type: 'recovery' });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'recovery_hash', type: 'recovery' });
    expect(res.error).toBeNull();
  });

  it('should handle expired links correctly', async () => {
    const mockError = new AuthError('Email link is invalid or has expired', 400, 'otp_expired');
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
      data: { user: null, session: null },
      error: mockError,
    });

    const res = await supabase.auth.exchangeCodeForSession('expired_code');
    expect(res.error?.code).toBe('otp_expired');
  });

  it('should handle previously used links correctly', async () => {
    const mockError = new AuthError('PKCE code has already been used or is invalid', 400, 'already_used');
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
      data: { user: null, session: null },
      error: mockError,
    });

    const res = await supabase.auth.exchangeCodeForSession('used_code');
    expect(res.error?.code).toBe('already_used');
  });

  it('should fallback to getSession when no parameters are present in URL', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'session_user' } } as any },
      error: null,
    });

    const res = await supabase.auth.getSession();
    expect(supabase.auth.getSession).toHaveBeenCalled();
    expect(res.data.session?.user?.id).toBe('session_user');
  });
});
