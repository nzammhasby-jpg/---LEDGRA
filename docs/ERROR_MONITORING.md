# LEDGRA Error Monitoring & Recovery Guide

This document describes the privacy-safe client-side error monitoring and recovery architecture implemented in **LEDGRA** using Sentry.

---

## 1. Overview of the Monitoring System

LEDGRA employs a strict privacy-first architecture. Our central monitoring hub (`src/lib/errorMonitoring.ts`) wraps `@sentry/react` to capture critical unexpected runtime failures, while guaranteeing that **no financial records, personal identifiable information (PII), or secure system tokens are ever sent to Sentry.**

```
                     +----------------------------+
                     |    Runtime Error Occurs    |
                     +--------------+-------------+
                                    |
                                    v
                     +--------------+-------------+
                     |    captureAppError()       | <--- Evaluates Deduplication & Ignore Lists
                     +--------------+-------------+
                                    |
                                    v
                     +--------------+-------------+
                     |   sanitizeErrorContext()   | <--- Filters context via strict ALLOW_LIST
                     +--------------+-------------+
                                    |
                                    v
                     +--------------+-------------+
                     |     Sentry beforeSend()    | <--- Redacts URLs, request bodies, PII, & cookies
                     +--------------+-------------+
                                    |
                                    v
                     +--------------+-------------+
                     |    Transmitted to Sentry   | (Only if VITE_SENTRY_DSN is configured)
                     +----------------------------+
```

---

## 2. Privacy Policy & Banned Data List

To comply with the high trust levels required by our member institutions, **privacy takes absolute precedence over data volume.** 

### Strictly Banned Data
The following data fields are **NEVER** allowed to leave the client's browser under any circumstances:
1. **PII (Personally Identifiable Information):** Names, emails, phone numbers, and physical addresses.
2. **Accounting / Financial Data:** Amounts, prices, invoice details, balances, VAT numbers, or commercial registration numbers.
3. **Security Credentials:** Passwords, authentication tokens, API keys, private keys, or Supabase anon/service keys.
4. **ZATCA Metadata:** CSID, CSR, and signing certificates.

### The Allowlist Strategy
We implement a strict **Allowlist** pattern rather than depending solely on a Deny list or regular expressions. Only the following properties are permitted to exist in Sentry context:
- `errorReference` (A randomly generated tracking identifier)
- `error_name`, `error_message` (General JavaScript type/message)
- `route`, `routeName`, `routePattern` (Current active navigation route)
- `module` (e.g., `'sales'`, `'purchases'`, `'accounting'`)
- `action` (e.g., `'save'`, `'load'`, `'print'`)
- `online` (Connection state)
- `status`, `level`, `type`, `category` (General error classification)
- `userRole`, `country` (Coarse demographic meta)
- `hashed_user_id`, `hashed_org_id` (Non-reversible, anonymized hash representations)

---

## 3. Configuration & Environment Setup

To enable Sentry monitoring, define the following variables in your environment:

```env
# Sentry Public Client-side DSN (Leave empty to disable monitoring)
VITE_SENTRY_DSN="https://your-public-sentry-dsn@sentry.io/project"

# Application build/release version (e.g., v1.2.0)
VITE_APP_VERSION="1.0.0"

# Application environment (development, staging, or production)
VITE_APP_ENV="production"
```

If `VITE_SENTRY_DSN` is empty or missing, Sentry is automatically skipped, and errors fall back to local sandboxed warnings. No runtime crash or network failure will occur.

---

## 4. Developer API & Code Examples

All exceptions inside LEDGRA must be handled and logged via the central wrapper rather than calling raw Sentry methods.

### A. Importing the Module
```ts
import { captureAppError, setMonitoringUser, clearMonitoringUser } from './lib/errorMonitoring';
```

### B. Capturing Handled Exceptions
Always pass a localized action/module description alongside the error object.
```ts
try {
  await saveInvoiceData(invoice);
} catch (error) {
  // Capture the error while ensuring no sensitive 'invoice' data is passed in the context
  const errorRef = captureAppError(error, {
    module: 'sales',
    action: 'save',
    route: '/sales/invoices',
  });
  
  // Show a user-friendly message referencing the error tracker ID
  showNotification(`فشلت العملية. رقم مرجع الخطأ: ${errorRef}`);
}
```

### C. Mapping Authenticated Sessions
Map user information securely using coarse roles and non-reversible hashed identifiers.
```ts
// Automatically handled by AuthContext on login
setMonitoringUser({
  id: session.user.id,             // Will be automatically hashed before submission
  role: 'accountant',
  country: 'SA',
  organizationId: 'org-123-uuid', // Will be automatically hashed before submission
});
```

### D. Disconnecting Sessions
Clear monitoring context immediately when a user signs out.
```ts
// Automatically handled by AuthContext on logout
clearMonitoringUser();
```

---

## 5. Graceful React Error Boundary

All unhandled React runtime rendering errors are caught by `AppErrorBoundary` (`src/components/AppErrorBoundary.tsx`). 

### User Experience Principles
1. **Security first:** No stack traces or raw database statements are ever rendered on-screen.
2. **Reassurance:** Clear RTL Arabic copy guarantees to the user that **their saved data is completely safe and unaffected**.
3. **Traceability:** Displays a bold, copyable alphanumeric error reference (e.g., `ERR-F39H1K8A`).
4. **Resiliency:** Provides interactive control buttons to instantly "Retry" (reload the current route) or "Return to Dashboard".
