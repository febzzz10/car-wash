# SECURITY.md — WashPro Security Rules

## Authentication

### Production (static_admin mode)

- Single admin account identified by `ADMIN_LOGIN_EMAIL` (`xpersscarwash@gmail.com`)
- Password verified against `ADMIN_LOGIN_PASSWORD` secret using constant-time comparison
- Set via `APP_ENV=production`, `AUTH_MODE=static_admin`

### Production (hybrid_admin_staff mode, default)

- Identifiers matching `ADMIN_LOGIN_EMAIL` are always authenticated against the static admin credentials — the identifier is reserved and a database user can never shadow it
- All other identifiers use the PBKDF2 database path: normalized username/email/phone lookup, constant-time password verification, status checks (DISABLED/LOCKED rejected), sessions carry the user's organization/role/permissions
- Legacy pre-100k-iteration PBKDF2 hashes (e.g. 600,000) fail safely with the same generic invalid-credentials error; they are never auto-rewritten and require an authorized password reset
- In hybrid mode the static administrator cannot change their password through the API: the change-password request is rejected with `403 STATIC_ADMIN_PASSWORD_MANAGED_EXTERNALLY` (message: "The static administrator password is managed through the deployment secret.") and no database hash, session or audit record is touched. Changing the password requires updating the protected Cloudflare secret

### Development / testing

- PBKDF2-SHA256 hashed passwords in D1
- Test environment sets `APP_ENV=test` in vitest config to use PBKDF2 path
- Multiple users with role-based access

## Session management

| Property    | Value                                                            |
| ----------- | ---------------------------------------------------------------- |
| Cookie name | `__Host-washpro_session`                                         |
| HttpOnly    | Yes                                                              |
| Secure      | Yes                                                              |
| SameSite    | Strict                                                           |
| Path        | `/`                                                              |
| Session TTL | 28,800 seconds (8 hours), configurable via `SESSION_TTL_SECONDS` |

- Session token is random, hashed with HMAC using `SESSION_PEPPER` before storage
- CSRF token derived from session token + `CSRF_SECRET`, sent as `x-csrf-token` header
- CSRF required for POST, PUT, PATCH, DELETE
- Disabling an account revokes all sessions for that user
- Password changes/resets revoke all sessions for that user

## Password policy

- Minimum 12 characters
- Enforced by `passwordPolicyError()` in `apps/api/src/security/passwords.ts`
- PBKDF2-SHA256 hashing with 100,000 iterations
- Constant-time comparison via `timingSafeEqual` (Web Crypto API)

## Rate limiting

- Login attempts: 8 per 15-minute window per identifier+IP
- Implemented via KV (`env.CACHE`)
- Key: `login:{sha256(identifier:ip)}`, TTL: 900 seconds

## CSRF protection

- Token generated from session token + CSRF_SECRET using HMAC
- Required on all state-changing requests (POST, PUT, PATCH, DELETE)
- Validated by `requireSession` middleware
- Same-origin requests exempt from origin check (no Origin header)

## Origin validation

- `ALLOWED_ORIGINS` env var controls which origins can make state-changing requests
- Current: `https://washpro-web.xpersscarwash.workers.dev` and the Pages URL
- `assertAllowedOrigin()` in `apps/api/src/http/request.ts`

## Audit logging

- All sensitive operations logged via `auditStatement()` to `audit_logs` table
- Sensitive keys redacted: password, token, secret, authorization, cookie, card, PIN
- Severity levels: INFO, WARNING, CRITICAL
- Fields: action, record_type, record_id, reason, previous/new value JSON, user_id, IP, user_agent, timestamp

### Must NOT be logged

- Passwords (plaintext or hashed)
- Session tokens
- CSRF tokens
- Secrets
- API credentials
- Full authorization headers

## Authorization

### Middleware chain (applied in order)

1. `requireSession` — validates session cookie, checks expiry, enforces CSRF
2. `requireAdmin` — restricts to ADMIN role
3. `requirePermission(permission)` — checks specific permission

### Admin-only actions

- Staff/user management
- System settings
- Audit log access
- Report generation
- Service and pricing management

### Staff permissions

Granular permissions listed in `PERMISSIONS` enum in `@washpro/contracts`. Examples:

- `wash_jobs.read`, `wash_jobs.create`, `wash_jobs.start`, `wash_jobs.complete`
- `customers.read`, `customers.create`
- `payments.create`, `payments.refund`
- `invoices.generate`, `invoices.send`

## Last-admin protection

The `assertNotLastAdmin()` function prevents disabling or demoting the last active ADMIN user. This is checked in:

- Account disable (`POST /api/v1/users/:id/disable`)
- Role change from ADMIN to STAFF (`PATCH /api/v1/users/:id`)

## API Worker isolation

- `workers_dev: false` — the API is never publicly accessible
- Only reachable via the web Worker's service binding
- Frontend must use same-origin relative URLs (`/api/v1/...`)
- Never expose `car-wash.xpersscarwash.workers.dev` in frontend code, CSP, or documentation

## Dev/CI secrets

- `.dev.vars` for local development (gitignored)
- Vitest config provides test values for `CSRF_SECRET`, `SESSION_PEPPER`, `BOOTSTRAP_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- Vitest overrides `APP_ENV` to `"test"` to disable static_admin mode
- Production secrets are NEVER used in tests

## Invoice email sending

- `POST /api/v1/invoices/:id/send-email` requires session auth, CSRF, and the `invoices.send` permission (STAFF denied by default)
- Emails are sent through the official Gmail REST API (`gmail.googleapis.com`) using OAuth2 refresh-token grant — no SMTP credentials, no browser automation
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` are server-side secrets; `GMAIL_SENDER_EMAIL` and `INVOICE_EMAIL_RATE_LIMIT` are plain vars
- The full sender identity is never exposed to clients: the API returns only `{ invoiceId, invoiceNumber, recipientEmail, sentAt }`
- The email carries the invoice PDF as an attachment only — it never contains invoice URLs or tokens
- Per-user rate limit (default 60/hour, KV-backed, hashed key) plus idempotency-key replay protection prevents duplicate sends
- Audit logs record `INVOICE_EMAIL_SENT` with recipient and message ID; Gmail credentials and access tokens are never logged or stored

## Reporting security issues

Security-sensitive changes must be reviewed against this document before deployment. Any weakening of these rules requires explicit approval and an entry in `DECISIONS.md`.
