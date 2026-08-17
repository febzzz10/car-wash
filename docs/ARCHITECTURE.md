# ARCHITECTURE.md — WashPro System Architecture

## Overview

WashPro is a car-wash management application deployed on Cloudflare's edge platform. It uses a service-binding architecture where a public frontend Worker proxies API requests to a private backend Worker.

## Deployment architecture

```
Browser
  │
  ▼
washpro-web (Cloudflare Worker, public)
  │  workers_dev: true
  │  assets: binding ASSETS (SPA fallback via not_found_handling)
  │  services: binding API → car-wash
  │
  ├── /api/*  ──► env.API.fetch()  ──► car-wash (private, workers_dev: false)
  ├── /invoice/* ──► env.API.fetch() ──► car-wash
  └── /*       ──► env.ASSETS.fetch()  ──► static assets + SPA fallback
```

## Cloudflare resources

| Resource | Type | Binding | Purpose |
|----------|------|---------|---------|
| washpro-web | Worker | — | Public frontend + API proxy |
| car-wash | Worker | — | Private Hono API |
| washpro-dev | D1 | `env.DB` | SQLite database (users, jobs, invoices, etc.) |
| washpro-uploads-dev | R2 | `env.UPLOADS` | Photo/file uploads |
| washpro-invoices-dev | R2 | `env.INVOICES` | Generated invoice PDFs |
| Cache KV | KV | `env.CACHE` | Rate limiting, temporary data |

## Frontend (apps/web)

- **Framework**: React 19, React Router 7, Vite 6
- **Worker build**: `@cloudflare/vite-plugin` generates `dist/washpro_web/`
- **Deploy**: `pnpm run deploy:web` (wrangler deploy with generated config)
- **Assets**: Served via `env.ASSETS` binding with `not_found_handling: single-page-application`
- **API proxy**: `env.API.fetch(new Request(request.url, request))` for `/api/*` and `/invoice/*`

### Key patterns
- `useApiData(path)` hook — fetches and caches API data
- `api<T>(path, init)` — typed API client with CSRF, JSON parsing, error mapping
- `useToast()` — notification system
- `Dialog` component — modals and confirmations (never `window.prompt()`/`window.confirm()`)
- `AuthProvider` + `useAuth()` — React context for authentication state

## API (apps/api)

- **Framework**: Hono 4 on Cloudflare Workers
- **Auth modes**: `static_admin` (production), PBKDF2 (development/test)
- **Route structure**:
  - Public: `POST /api/v1/auth/login`, `GET /api/v1/bootstrap` (the web Worker still proxies `/invoice/*` to the API, which now returns the generic JSON 404 — no public invoice route exists)
  - Protected: all other `/api/v1/*` require `requireSession` middleware
  - Admin-only: `requireAdmin` + `requirePermission`

### Middleware stack
1. `*` global — request ID, security headers (CSP, CORP, HSTS)
2. `requireSession` — validates `__Host-washpro_session` cookie, enforces CSRF
3. `requireAdmin` — checks role
4. `requirePermission(perm)` — checks specific permission

### Error handling
- `ApiError` class with HTTP status, error code, message
- Global `app.onError` handler formats as JSON: `{ success: false, error: { code, message, requestId } }`
- `app.notFound` handler returns JSON 404, not HTML

## Shared packages

### @washpro/contracts
- Zod schemas: `loginRequestSchema`, pagination, file metadata, customer/vehicle input
- TypeScript enums: user roles, statuses, permissions, error codes
- Response type interfaces: `ApiSuccess<T>`, `ApiFailure`

### @washpro/domain
- Normalisation: `normalizeEmail`, `normalizePhone`, `normalizeRegistration`
- Business logic: billing, permissions, referrals, coupons, reports, timers

## Data flow

1. Browser loads SPA from `washpro-web` (static assets or SPA fallback)
2. React app boots, calls `GET /api/v1/auth/session` with stored cookie
3. If authenticated, renders dashboard; otherwise renders login page
4. Login form sends `POST /api/v1/auth/login` with `{ identifier, password }`
5. `washpro-web` proxies request to `car-wash` via service binding
6. `car-wash` verifies credentials, creates session in D1, sets cookie
7. All subsequent state-changing requests include `x-csrf-token` header

## Security boundaries

- API Worker is never publicly accessible (`workers_dev: false`)
- All frontend API URLs are same-origin relative (`/api/v1/...`)
- CSRF token required for POST/PUT/PATCH/DELETE
- Session cookie: `__Host-` prefix, HttpOnly, Secure, SameSite=Strict
- Passwords hashed with PBKDF2-SHA256, session tokens hashed with HMAC
- Audit logs record all sensitive operations with automatic redaction
