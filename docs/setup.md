# Local setup and environment

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- A current Chromium, Firefox, or WebKit-compatible browser
- Camera and geolocation permissions for live New Wash verification

## Install and initialize

From the repository root:

```powershell
npm install
npm run setup:local
npm run migrate:local
```

`setup:local` creates `apps/api/.dev.vars` with independent cryptographically random local secrets. It refuses to overwrite an existing file unless `--force` is passed directly to the script. Rotating that file invalidates sessions and protected invoice links.

The local migration command persists D1 state under `apps/api/.wrangler`. To prove the migration chain on an isolated database, use a new path:

```powershell
npm exec --workspace @washpro/api -- wrangler d1 migrations apply DB --local --persist-to apps/api/.tmp/clean-d1
```

## Start the application

Terminal 1:

```powershell
npm run dev:api
```

Terminal 2:

```powershell
npm run dev
```

The web application runs at `http://127.0.0.1:5173` and proxies `/api` to the Worker at `http://localhost:8787`.

## Bootstrap the first Administrator

Bootstrap is deliberately one-time and protected by the random token in `.dev.vars`. With both development servers running, execute the following from the repository root. All business-specific values are requested interactively; no default credentials, phone numbers, or coordinates are embedded in the repository.

```powershell
$ErrorActionPreference = 'Stop'
$config = @{}
Get-Content apps/api/.dev.vars | ForEach-Object {
  $parts = $_ -split '=', 2
  if ($parts.Length -eq 2) { $config[$parts[0]] = $parts[1] }
}
$securePassword = Read-Host 'Initial Administrator password (12+ characters)' -AsSecureString
$plainPassword = ([System.Net.NetworkCredential]::new('', $securePassword)).Password
$body = @{
  adminFullName = Read-Host 'Administrator full name'
  adminPassword = $plainPassword
  adminUsername = Read-Host 'Administrator username'
  allowedRadiusMeters = [double](Read-Host 'Allowed GPS radius in metres')
  branchCode = Read-Host 'Branch code'
  branchName = Read-Host 'Branch name'
  businessName = Read-Host 'Business name'
  latitude = [double](Read-Host 'Business latitude')
  longitude = [double](Read-Host 'Business longitude')
  minimumGpsAccuracyMeters = [double](Read-Host 'Minimum acceptable GPS accuracy in metres')
  timezone = Read-Host 'IANA timezone'
} | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/v1/bootstrap' -Headers @{
    'Content-Type' = 'application/json'
    'x-washpro-bootstrap-token' = $config.BOOTSTRAP_TOKEN
  } -Body $body
} finally {
  $plainPassword = $null
  $body = $null
}
```

The password policy requires at least 12 characters with uppercase, lowercase, numeric, and special characters. A second bootstrap attempt returns a conflict and cannot create another initial user. Create Staff from the authenticated Staff Management screen.

## Environment variables and bindings

| Name | Kind | Required | Purpose |
| --- | --- | --- | --- |
| `APP_ENV` | plain variable | yes | Environment label used for safe runtime behaviour. |
| `ALLOWED_ORIGINS` | plain variable | yes | Comma-separated exact web origins accepted for credentialed requests. |
| `SESSION_TTL_SECONDS` | plain variable | yes | Fallback secure-session duration; business security settings may shorten it. |
| `INVOICE_LINK_TTL_SECONDS` | plain variable | yes | Maximum protected invoice-link lifetime. |
| `BOOTSTRAP_TOKEN` | Worker secret | yes | One-time initial-organization authorization; minimum 32 characters. |
| `SESSION_PEPPER` | Worker secret | yes | Peppers password/session derivation; rotation revokes effective access. |
| `CSRF_SECRET` | Worker secret | yes | Derives per-session CSRF tokens. |
| `INVOICE_TOKEN_PEPPER` | Worker secret | yes | Signs protected invoice access tokens. |
| `DB` | D1 binding | yes | Authoritative relational store. |
| `UPLOADS` | private R2 binding | yes | Vehicle photos, receipts, and business logos. |
| `INVOICES` | private R2 binding | yes | Generated immutable invoice PDFs. |
| `CACHE` | KV binding | yes | Non-authoritative temporary/cache state only. |

Do not place secrets in `wrangler.jsonc`. Local secrets belong only in ignored `apps/api/.dev.vars`; deployed values must be Worker secrets.

## Local data reset

Local state is under `apps/api/.wrangler`. Removing it destroys the local D1/R2/KV development data, so make a D1 export first if the data matters. Never use a local-state reset procedure against a remote binding.
