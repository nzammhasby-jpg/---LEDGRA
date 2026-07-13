import * as Sentry from '@sentry/react';

// Allowlist for non-sensitive key names in contexts/bread crumbs
const ALLOW_LIST = new Set([
  'errorReference',
  'error_name',
  'error_message',
  'route',
  'routeName',
  'routePattern',
  'module',
  'action',
  'environment',
  'version',
  'online',
  'status',
  'type',
  'category',
  'level',
  'userRole',
  'user_role',
  'role',
  'country',
  'hashed_user_id',
  'hashed_org_id'
]);

let sentryInitialized = false;
const recentErrors = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 2000;

// Ignored errors pattern
const IGNORED_ERROR_PATTERNS = [
  /print/i,
  /share/i,
  /abort/i,
  /clipboard/i,
  /permission denied/i,
  /network/i,
  /validation/i,
  /unauthorized/i,
  /not logged in/i,
  /session expired/i,
  /auth/i
];

/**
 * Checks if Sentry is initialized
 */
export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

/**
 * Set sentry initialized status (mostly for testing purposes)
 */
export function setSentryInitialized(status: boolean) {
  sentryInitialized = status;
}

/**
 * Non-reversible synchronous string hashing function
 * Non-sensitive, lightweight, and works everywhere
 */
export function simpleHash(str: string): string {
  let hash = 0;
  if (!str || str.length === 0) return '00000000';
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Recursively cleanses error objects or contexts based on the ALLOW_LIST and Deny pattern.
 */
export function sanitizeErrorContext(context: any): any {
  if (context === null || context === undefined) {
    return context;
  }
  if (Array.isArray(context)) {
    return context.map(item => sanitizeErrorContext(item));
  }
  if (typeof context === 'object') {
    const cleaned: any = {};
    const sensitiveWords = /password|token|secret|key|authorization|cookie|amount|total|price|quantity|balance|customer|vendor|invoice|vat_number|commercial_registration|csr|csid|certificate|private_key/i;
    
    for (const key in context) {
      if (Object.prototype.hasOwnProperty.call(context, key)) {
        const isObject = typeof context[key] === 'object' && context[key] !== null;
        const isAllowedKey = (ALLOW_LIST.has(key) || isObject) && !sensitiveWords.test(key);
        
        if (isAllowedKey) {
          const val = sanitizeErrorContext(context[key]);
          // Prune empty objects if the key itself wasn't explicitly allowed
          if (isObject && !Array.isArray(val) && Object.keys(val).length === 0) {
            if (ALLOW_LIST.has(key)) {
              cleaned[key] = val;
            }
          } else {
            cleaned[key] = val;
          }
        }
      }
    }
    return cleaned;
  }
  return context;
}

/**
 * Creates a beautiful, random alphanumeric English error reference.
 */
export function createErrorReference(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = 'ERR-';
  for (let i = 0; i < 8; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

/**
 * Check if the error is a duplicate within the deduplication window
 */
function isDuplicateError(error: any): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const now = Date.now();
  const lastTime = recentErrors.get(message);
  if (lastTime && now - lastTime < DEDUPLICATION_WINDOW_MS) {
    return true;
  }
  recentErrors.set(message, now);
  
  // Clean up old entries
  if (recentErrors.size > 100) {
    for (const [key, val] of recentErrors.entries()) {
      if (now - val > DEDUPLICATION_WINDOW_MS) {
        recentErrors.delete(key);
      }
    }
  }
  return false;
}

/**
 * Check if the error should be ignored
 */
function shouldIgnoreError(error: any): boolean {
  if (!error) return true;
  const message = error instanceof Error ? error.message : String(error);
  return IGNORED_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Initializes error monitoring and privacy sanitization
 */
export function initializeErrorMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN || '';
  const env = import.meta.env.VITE_APP_ENV || 'development';
  const version = import.meta.env.VITE_APP_VERSION || '1.0.0';

  // Do not initialize Sentry in test environments or if DSN is missing
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return;
  }
  if (!dsn || dsn.trim() === '') {
    return;
  }

  try {
    Sentry.init({
      dsn: dsn,
      environment: env,
      release: version,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend(event) {
        // Redact request information
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            const sensitiveHeaderRegex = /authorization|cookie|token|key|secret/i;
            for (const header in event.request.headers) {
              if (sensitiveHeaderRegex.test(header)) {
                delete event.request.headers[header];
              }
            }
          }
          if (event.request.url) {
            try {
              const urlObj = new URL(event.request.url);
              if (urlObj.search) {
                urlObj.search = '';
              }
              event.request.url = urlObj.toString();
            } catch (e) {
              const qIdx = event.request.url.indexOf('?');
              if (qIdx !== -1) {
                event.request.url = event.request.url.substring(0, qIdx);
              }
            }
          }
        }

        // Redact user info
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.ip_address;
        }

        // Redact extra context
        if (event.extra) {
          event.extra = sanitizeErrorContext(event.extra);
        }

        // Redact breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
            if (breadcrumb.data) {
              breadcrumb.data = sanitizeErrorContext(breadcrumb.data);
            }
            if (breadcrumb.message) {
              const sensitiveWords = /password|token|secret|key|authorization|cookie|amount|total|price|quantity|balance|customer|vendor|invoice|vat_number|commercial_registration|csr|csid|certificate|private_key/i;
              if (sensitiveWords.test(breadcrumb.message)) {
                breadcrumb.message = '[REDACTED]';
              }
            }
            return breadcrumb;
          });
        }

        return event;
      }
    });

    sentryInitialized = true;
  } catch (err) {
    console.error('Failed to initialize Sentry:', err);
  }
}

/**
 * Centrally captures an application exception with context and privacy sanitization.
 */
export function captureAppError(error: any, context?: any): string {
  const errorRef = createErrorReference();
  if (shouldIgnoreError(error)) {
    return errorRef;
  }
  if (isDuplicateError(error)) {
    return errorRef;
  }

  const sanitizedContext = sanitizeErrorContext(context || {});
  sanitizedContext.errorReference = errorRef;
  sanitizedContext.online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (sentryInitialized) {
    Sentry.withScope((scope) => {
      scope.setTags({
        errorReference: errorRef,
        module: sanitizedContext.module || 'general',
        action: sanitizedContext.action || 'unknown',
        route: sanitizedContext.route || 'unknown'
      });
      scope.setExtras(sanitizedContext);
      Sentry.captureException(error);
    });
  } else {
    // Local safe logging
    console.warn(`[Local Error Monitoring] Ref: ${errorRef}`, error, sanitizedContext);
  }

  return errorRef;
}

/**
 * Safely associates user details with the active monitoring context using anonymized IDs.
 */
export function setMonitoringUser(user: { id?: string; role?: string; country?: string; organizationId?: string }) {
  if (!user) return;
  
  const hashedUserId = user.id ? simpleHash(user.id) : undefined;
  const hashedOrgId = user.organizationId ? simpleHash(user.organizationId) : undefined;

  const sentryUser: any = {};
  if (hashedUserId) sentryUser.id = hashedUserId;
  if (user.role) sentryUser.role = user.role;
  if (user.country) sentryUser.country = user.country;
  if (hashedOrgId) sentryUser.organizationId = hashedOrgId;

  if (sentryInitialized) {
    Sentry.setUser(sentryUser);
  }
}

/**
 * Clears the active monitoring user context.
 */
export function clearMonitoringUser() {
  if (sentryInitialized) {
    Sentry.setUser(null);
  }
}
