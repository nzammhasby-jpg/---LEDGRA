import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import {
  sanitizeErrorContext,
  createErrorReference,
  simpleHash,
  captureAppError,
  setMonitoringUser,
  clearMonitoringUser,
  setSentryInitialized
} from './errorMonitoring';

// Mock Sentry React module
vi.mock('@sentry/react', () => {
  const setTags = vi.fn();
  const setExtras = vi.fn();
  return {
    init: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
    withScope: vi.fn((cb) => {
      cb({ setTags, setExtras });
    }),
    // Expose helpers for verifying calls if needed
    _setTagsMock: setTags,
    _setExtrasMock: setExtras
  };
});

describe('Centralized Error Monitoring (Sentry Wrapper)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSentryInitialized(false);
  });

  describe('simpleHash', () => {
    it('should generate a consistent hex hash for string values', () => {
      const id = 'user-uuid-1234-5678';
      const hash1 = simpleHash(id);
      const hash2 = simpleHash(id);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9A-F]{8}$/);
    });

    it('should handle empty or null values gracefully', () => {
      expect(simpleHash('')).toBe('00000000');
      expect(simpleHash(null as any)).toBe('00000000');
    });
  });

  describe('createErrorReference', () => {
    it('should generate a unique non-empty alphanumeric English reference starting with ERR-', () => {
      const ref1 = createErrorReference();
      const ref2 = createErrorReference();

      expect(ref1).toMatch(/^ERR-[0-9A-Z]{8}$/);
      expect(ref1).not.toBe(ref2);
    });
  });

  describe('sanitizeErrorContext', () => {
    it('should keep properties in the ALLOW_LIST and discard sensitive ones', () => {
      const sensitiveContext = {
        route: '/dashboard',
        module: 'sales',
        password: 'supersecretpassword123',
        token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        customer: { name: 'John Doe', email: 'john@example.com' },
        amount: 5000,
        vat_number: '1234567890',
        online: true,
        nested: {
          status: 'error',
          secret_key: 'mysecret',
          action: 'save'
        }
      };

      const result = sanitizeErrorContext(sensitiveContext);

      // Kept fields
      expect(result.route).toBe('/dashboard');
      expect(result.module).toBe('sales');
      expect(result.online).toBe(true);

      // Cleared fields (either because they are sensitive or not on the allowlist)
      expect(result.password).toBeUndefined();
      expect(result.token).toBeUndefined();
      expect(result.customer).toBeUndefined();
      expect(result.amount).toBeUndefined();
      expect(result.vat_number).toBeUndefined();
      expect(result.nested.status).toBe('error');
      expect(result.nested.action).toBe('save');
      expect(result.nested.secret_key).toBeUndefined();
    });

    it('should safely handle arrays, null, undefined, and primitives', () => {
      expect(sanitizeErrorContext(null)).toBeNull();
      expect(sanitizeErrorContext(undefined)).toBeUndefined();
      expect(sanitizeErrorContext(123)).toBe(123);
      expect(sanitizeErrorContext('test-string')).toBe('test-string');

      const arrayCtx = [
        { route: '/sales', password: '123' },
        { action: 'load', secret: 'abc' }
      ];
      const cleanedArray = sanitizeErrorContext(arrayCtx);
      expect(cleanedArray[0].route).toBe('/sales');
      expect(cleanedArray[0].password).toBeUndefined();
      expect(cleanedArray[1].action).toBe('load');
      expect(cleanedArray[1].secret).toBeUndefined();
    });
  });

  describe('captureAppError', () => {
    it('should return a non-empty string reference code', () => {
      const ref = captureAppError(new Error('Test runtime error'));
      expect(ref).toMatch(/^ERR-[0-9A-Z]{8}$/);
    });

    it('should trigger Sentry if initialized and skip if not', () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Sentry not initialized
      captureAppError(new Error('Sentry inactive'));
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(spyWarn).toHaveBeenCalled();

      // Sentry initialized
      setSentryInitialized(true);
      captureAppError(new Error('Sentry active'));
      expect(Sentry.captureException).toHaveBeenCalled();

      spyWarn.mockRestore();
    });

    it('should deduplicate repeating identical errors within the window', () => {
      setSentryInitialized(true);
      const errorObj = new Error('Duplicate error test');
      
      captureAppError(errorObj);
      captureAppError(errorObj);
      captureAppError(errorObj);

      // Sentry capture should only be triggered once
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('should ignore silent or expected print, abort, and permission errors', () => {
      setSentryInitialized(true);
      captureAppError(new Error('User aborted print operation'));
      captureAppError(new Error('clipboard access is blocked'));
      captureAppError(new Error('Network temporary failure'));

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('setMonitoringUser & clearMonitoringUser', () => {
    it('should pass anonymised hashed values to Sentry and clear on demand', () => {
      setSentryInitialized(true);
      
      setMonitoringUser({
        id: 'user-uuid-xyz',
        role: 'accountant',
        country: 'SA',
        organizationId: 'org-1234'
      });

      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: simpleHash('user-uuid-xyz'),
        role: 'accountant',
        country: 'SA',
        organizationId: simpleHash('org-1234')
      });

      clearMonitoringUser();
      expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
    });
  });
});
