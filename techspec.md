# WashPro — Technical Specification

**Project Name:** WashPro  
**Document Type:** `techspec.md`  
**Version:** 1.0  
**Status:** Proposed  
**Application Type:** Responsive Car Wash Management Web Application  
**Primary Users:** Admin and Staff  
**Reference Documents:** `plan.md`, `appflow.md`  
**Reference Deployment Model:** Cloudflare-first serverless architecture  

---

## 1. Purpose

This document converts the WashPro project plan and application flow into an implementable technical specification.

It defines:

- The recommended technology stack.
- The application architecture.
- Frontend and backend responsibilities.
- Database and file-storage design.
- Authentication and authorization rules.
- API conventions and endpoint groups.
- Camera and GPS implementation.
- Wash-job, timer, billing, coupon, referral, payment, invoice, and expense logic.
- Security, privacy, performance, backup, deployment, and testing requirements.
- Technical acceptance criteria for production release.

This document should be used by:

- Frontend developers
- Backend developers
- Database developers
- UI/UX designers
- QA testers
- DevOps engineers
- Security reviewers
- Project managers
- Client reviewers

---

## 2. Technical Objectives

The system must:

1. Provide a fast mobile-first workflow for car-wash staff.
2. Protect Admin-only financial and management features.
3. Store customer, vehicle, wash, payment, expense, and invoice records reliably.
4. Capture a live vehicle photograph and GPS metadata through supported browsers.
5. Preserve wash timers across refreshes, browser closures, and device changes.
6. Calculate service prices, discounts, taxes, and totals on the server.
7. Prevent duplicate coupon usage, referral rewards, payments, jobs, and invoices.
8. Generate stable, immutable invoice snapshots.
9. Store photos, receipts, logos, and invoice files securely.
10. Provide accurate revenue, expense, and net-profit reports.
11. Support Android, iOS, Windows, and macOS browsers.
12. Allow future expansion to multiple branches and additional business modules.

---

## 3. Scope

The first production release includes:

- Admin and Staff authentication
- Role-based access control
- Staff account management
- Customer management
- Vehicle management
- Live camera capture
- GPS capture and business-location verification
- Service and vehicle-specific price management
- Wash-job creation
- Wash timer and status management
- Coupon validation
- Referral-code and reward management
- Payment management
- Professional PDF invoices
- WhatsApp invoice-message sharing
- Customer and vehicle history
- Expense management
- Admin dashboard
- Reports and exports
- Business settings
- Audit logging

The following are not required for the first release unless separately approved:

- Customer self-service booking
- Online payment gateway
- Automated WhatsApp Business API messages
- Loyalty points
- Inventory management
- Multi-branch support
- Employee attendance
- Payroll
- Automatic number-plate recognition
- Native Android or iOS application

---

## 4. Architecture Decision Summary

The recommended implementation is a modular serverless web application.

### Reference Architecture

```text
User Browser
   │
   ├── React + TypeScript Web Application
   │       ├── Responsive UI
   │       ├── Camera API
   │       ├── Geolocation API
   │       ├── Form validation
   │       └── Local draft state
   │
   ▼
Cloudflare Worker API
   ├── Authentication
   ├── Authorization
   ├── Domain validation
   ├── Billing engine
   ├── Timer processing
   ├── Coupon/referral transactions
   ├── Payment processing
   ├── Invoice generation
   ├── Reporting
   └── Audit logging
   │
   ├── Cloudflare D1
   │       └── Relational application data
   │
   ├── Cloudflare R2
   │       └── Photos, receipts, logos, invoices
   │
   ├── Cloudflare KV
   │       └── Rate limits, short-lived state, configuration cache
   │
   └── Optional Cloudflare Queues
           └── Heavy exports, cleanup, and retryable document tasks
```

---

## 5. Recommended Technology Stack

## 5.1 Frontend

| Area | Recommended Technology |
|---|---|
| Framework | React with TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| Server-state management | TanStack Query |
| Form handling | React Hook Form |
| Validation | Zod or equivalent shared schema validation |
| Local workflow state | Zustand or React Context |
| Date handling | A timezone-aware date utility |
| Charts | A lightweight accessible chart library |
| Tables | Responsive table/grid component |
| Icons | Consistent SVG icon library |
| Testing | Vitest and React Testing Library |
| End-to-end testing | Playwright |
| PWA support | Optional service worker and installable manifest |

### Frontend Rationale

A client-rendered React application is suitable because:

- The application is private and operational rather than search-engine focused.
- Staff use requires responsive interactions and camera/GPS integration.
- A separate API allows strict backend authorization.
- The frontend can be hosted as static assets.
- The deployment model remains portable.

---

## 5.2 Backend

| Area | Recommended Technology |
|---|---|
| Runtime | Cloudflare Workers |
| API framework | Hono or equivalent Worker-compatible router |
| Language | TypeScript |
| Validation | Shared Zod schemas or equivalent |
| Authentication | Secure cookie-based sessions |
| Password hashing | Worker-compatible memory-hard or approved adaptive hash |
| Authorization | Role and permission middleware |
| Database access | D1 SQL adapter/repository layer |
| File storage | Cloudflare R2 |
| Rate limiting | KV-backed or Durable Object-backed limiter |
| PDF generation | Worker-compatible PDF generator |
| Testing | Vitest with Worker-compatible test environment |

---

## 5.3 Database and Storage

| Requirement | Recommended Service |
|---|---|
| Relational business data | Cloudflare D1 |
| Vehicle photographs | Cloudflare R2 |
| Expense receipts | Cloudflare R2 |
| Business logos | Cloudflare R2 |
| Invoice PDFs | Cloudflare R2 |
| Short-lived access tokens | D1 or KV |
| Cached settings | KV |
| Idempotency records | D1 |
| Audit records | D1 |

---

## 5.4 Hosting

| Component | Hosting |
|---|---|
| Frontend | Cloudflare Pages |
| API | Cloudflare Workers |
| Database | Cloudflare D1 |
| Object storage | Cloudflare R2 |
| DNS and TLS | Cloudflare |
| Monitoring | Worker logs plus external error monitoring if approved |

---

## 6. Portability Requirement

The codebase should avoid unnecessary dependence on one vendor.

Use abstraction layers for:

- Database repositories
- Object storage
- Session storage
- File URL generation
- Email or messaging integrations
- PDF generation
- Background jobs

A future migration to PostgreSQL, another object-storage provider, or a container-based API should not require a complete rewrite of domain logic.

---

## 7. Repository Structure

Recommended monorepo structure:

```text
washpro/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── assets/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── hooks/
│   │   │   ├── layouts/
│   │   │   ├── lib/
│   │   │   ├── pages/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── state/
│   │   │   ├── styles/
│   │   │   ├── types/
│   │   │   └── main.tsx
│   │   └── vite.config.ts
│   │
│   └── api/
│       ├── src/
│       │   ├── config/
│       │   ├── db/
│       │   │   ├── migrations/
│       │   │   ├── repositories/
│       │   │   └── queries/
│       │   ├── middleware/
│       │   ├── modules/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── storage/
│       │   ├── jobs/
│       │   ├── utils/
│       │   └── index.ts
│       └── wrangler.toml
│
├── packages/
│   ├── contracts/
│   │   ├── api/
│   │   ├── enums/
│   │   ├── schemas/
│   │   └── types/
│   ├── domain/
│   │   ├── billing/
│   │   ├── coupons/
│   │   ├── referrals/
│   │   ├── timers/
│   │   └── invoices/
│   ├── config/
│   └── test-utils/
│
├── docs/
│   ├── plan.md
│   ├── appflow.md
│   ├── techspec.md
│   ├── schema.md
│   ├── api.md
│   ├── security.md
│   └── deployment.md
│
├── scripts/
├── package.json
├── tsconfig.base.json
└── README.md
```

---

## 8. Coding Standards

The project should use:

- TypeScript strict mode.
- Explicit return types for service and repository functions.
- Shared domain enums.
- Shared request and response schemas.
- No use of `any` except documented integration boundaries.
- No direct SQL inside route handlers.
- No direct object-storage operations inside UI components.
- No billing calculations in the frontend as the source of truth.
- Centralized error mapping.
- Structured logging.
- Consistent UTC storage for timestamps.
- Configured local timezone for display and reporting.

---

## 9. Environment Strategy

Required environments:

1. Local development
2. Test
3. Staging
4. Production

Each environment must use separate:

- Database
- R2 bucket
- session secrets
- application domain
- configuration values
- API keys
- audit records

Production data must never be copied into local development without approved anonymization.

---

## 10. Environment Variables and Bindings

Example configuration:

```text
APP_ENV
APP_NAME
APP_URL
API_URL
SESSION_SECRET
SESSION_TTL_SECONDS
PASSWORD_HASH_COST
DEFAULT_TIMEZONE
DEFAULT_CURRENCY
D1_DATABASE
R2_UPLOADS_BUCKET
R2_INVOICES_BUCKET
KV_CACHE
KV_RATE_LIMIT
MAX_IMAGE_SIZE_BYTES
MAX_RECEIPT_SIZE_BYTES
ALLOWED_IMAGE_MIME_TYPES
INVOICE_TOKEN_TTL_SECONDS
LOGIN_RATE_LIMIT
LOGIN_RATE_WINDOW_SECONDS
```

Secrets must be stored through platform secret management and never committed to source control.

---

## 11. Core Domain Modules

The backend should be divided into the following modules:

- Authentication
- Users and permissions
- Customers
- Vehicles
- Vehicle photos
- Location captures
- Services
- Service pricing
- Wash jobs
- Wash-job items
- Timer events
- Coupons
- Coupon redemptions
- Referral codes
- Referral redemptions
- Referral rewards
- Payments
- Refunds
- Expenses
- Invoices
- Reports
- Settings
- Audit logs
- File storage
- Notifications and WhatsApp message generation

Each module should contain:

```text
route/controller
request schema
service
repository
domain rules
response mapper
tests
```

---

## 12. Frontend Architecture

## 12.1 Application Shell

The frontend should provide:

- Authentication guard
- Role guard
- Admin layout
- Staff layout
- Responsive sidebar
- Mobile bottom navigation
- Global error boundary
- Global notification system
- Network-status indicator
- Session-expiry handling

---

## 12.2 Route Guards

### Public Route

- `/login`

### Authenticated Staff Routes

- Staff home
- New wash
- Active jobs
- Customers
- Vehicles
- Wash history
- Invoice view
- Profile

### Admin Routes

- Dashboard
- Staff management
- Services and pricing
- Coupons
- Referrals
- Expenses
- Payments
- Invoices
- Reports
- Settings
- Audit logs

Frontend route guards improve usability but do not replace backend permission checks.

---

## 12.3 Feature Folder Pattern

Example:

```text
features/
├── customers/
│   ├── api/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── schemas/
│   └── types/
├── vehicles/
├── wash-jobs/
├── timers/
├── payments/
└── reports/
```

---

## 12.4 Server State

Use the server-state library for:

- Customers
- Vehicles
- Jobs
- Services
- Prices
- Payments
- Invoices
- Reports
- Settings

Required behaviour:

- Cache list queries briefly.
- Invalidate relevant queries after mutations.
- Avoid using stale data for payment or billing confirmation.
- Refetch active timer data at controlled intervals.
- Pause unnecessary polling when the browser tab is hidden.
- Resume synchronization when the tab becomes active.

---

## 12.5 Local Workflow State

The New Wash wizard may keep temporary state for:

- Selected customer
- Selected vehicle
- Photo preview
- Temporary upload identifier
- GPS data
- Selected services
- Entered coupon or referral code
- Notes
- Assigned Staff
- Initial status

Sensitive or final business values must be revalidated by the server before job creation.

---

## 13. API Design Principles

The API should be REST-style JSON over HTTPS.

Base path:

```text
/api/v1
```

### General Rules

- JSON request and response bodies
- UTF-8
- ISO-8601 date and time strings
- UTC timestamps from server
- Stable resource identifiers
- Consistent pagination
- Consistent filters
- Consistent error format
- Idempotency support for financial and creation endpoints
- Authentication through secure HttpOnly cookie
- CSRF protection for state-changing requests

---

## 14. API Response Format

### Successful Single Resource

```json
{
  "success": true,
  "data": {
    "id": "resource_id"
  }
}
```

### Successful List

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "fields": {
      "phone": "A customer with this phone number already exists."
    },
    "requestId": "req_..."
  }
}
```

---

## 15. Error Codes

Recommended error codes:

```text
AUTH_INVALID_CREDENTIALS
AUTH_ACCOUNT_DISABLED
AUTH_SESSION_EXPIRED
AUTH_PERMISSION_DENIED
AUTH_RATE_LIMITED

VALIDATION_ERROR
RESOURCE_NOT_FOUND
RESOURCE_CONFLICT
DUPLICATE_CUSTOMER
DUPLICATE_VEHICLE

CAMERA_CAPTURE_REQUIRED
LOCATION_CAPTURE_REQUIRED
LOCATION_ACCURACY_LOW
LOCATION_OUTSIDE_ALLOWED_RADIUS

SERVICE_NOT_AVAILABLE
PRICE_NOT_CONFIGURED
INVALID_JOB_STATUS
INVALID_TIMER_TRANSITION
TIMER_ALREADY_RUNNING

COUPON_INVALID
COUPON_EXPIRED
COUPON_DISABLED
COUPON_LIMIT_REACHED
COUPON_NOT_ELIGIBLE

REFERRAL_INVALID
REFERRAL_SELF_USE
REFERRAL_ALREADY_USED
REFERRAL_REWARD_UNAVAILABLE

PAYMENT_AMOUNT_INVALID
PAYMENT_DUPLICATE
REFUND_NOT_ALLOWED

INVOICE_GENERATION_FAILED
INVOICE_ALREADY_EXISTS

UPLOAD_INVALID_TYPE
UPLOAD_TOO_LARGE
UPLOAD_FAILED

RATE_LIMITED
INTERNAL_ERROR
```

---

## 16. Pagination

List endpoints should support:

```text
page
pageSize
sort
order
search
dateFrom
dateTo
status
```

Defaults:

- `page = 1`
- `pageSize = 25`
- maximum `pageSize = 100`

Cursor pagination may be used for large audit logs or activity feeds.

---

## 17. Authentication Design

## 17.1 Login Methods

The user may log in using:

- Username
- Email
- Phone number

The backend should normalize and search these identifiers safely.

---

## 17.2 Password Storage

Passwords must:

- Never be stored as plain text.
- Be hashed using an approved adaptive password-hashing algorithm.
- Use a unique salt.
- Support future cost upgrades.
- Never be logged.
- Never be returned in API responses.

---

## 17.3 Session Strategy

Recommended session model:

- Random opaque session token.
- Token stored only in secure HttpOnly cookie.
- Hashed token stored in database.
- Session contains user ID, expiry, and device metadata.
- Session can be revoked.
- Sessions expire after configured inactivity or maximum lifetime.

Cookie requirements:

```text
HttpOnly
Secure
SameSite=Lax or stricter
Path=/
Short configured lifetime
```

---

## 17.4 Session Table

Suggested fields:

```text
id
user_id
token_hash
created_at
last_seen_at
expires_at
revoked_at
ip_hash
user_agent
```

---

## 17.5 Login Rate Limiting

Rate-limit by a combination of:

- IP
- account identifier
- device/browser fingerprint where appropriate

Repeated failed attempts should:

- Return a generic error.
- Avoid confirming whether the account exists.
- Create an audit/security event.
- Trigger temporary throttling.

---

## 17.6 Password Reset

Initial version options:

1. Admin resets Staff password.
2. Admin creates a temporary password.
3. Staff must change it at next login.

A self-service email reset may be added later.

---

## 18. Authorization Design

## 18.1 Roles

Minimum roles:

```text
ADMIN
STAFF
```

Future-compatible design may support:

```text
OWNER
MANAGER
SUPERVISOR
CASHIER
WASH_STAFF
REPORT_VIEWER
```

---

## 18.2 Permission Model

Use permissions rather than hardcoding every rule directly to role names.

Example permissions:

```text
customers.read
customers.create
customers.update
customers.deactivate

vehicles.read
vehicles.create
vehicles.update

wash_jobs.read
wash_jobs.create
wash_jobs.assign
wash_jobs.start
wash_jobs.pause
wash_jobs.resume
wash_jobs.complete
wash_jobs.cancel
wash_jobs.adjust

services.manage
pricing.manage

coupons.manage
referrals.manage

payments.create
payments.refund
payments.adjust

invoices.generate
invoices.share
invoices.adjust

expenses.read
expenses.create
expenses.update
expenses.cancel

reports.revenue
reports.profit
reports.staff

users.manage
settings.manage
audit.read
```

---

## 18.3 Authorization Enforcement

Every state-changing service method must check:

- Authenticated user
- User status
- Required permission
- Resource ownership or assignment where relevant
- Current resource state
- Business policy

---

## 19. User Management

## 19.1 User Fields

```text
id
full_name
username
phone
email
password_hash
role
status
must_change_password
profile_photo_key
last_login_at
created_by
created_at
updated_at
disabled_at
```

### Unique Constraints

- normalized username
- normalized email when provided
- normalized phone when provided

---

## 19.2 User Statuses

```text
ACTIVE
DISABLED
LOCKED
```

A disabled or locked account cannot create a new session.

---

## 20. Customer Management

## 20.1 Customer Fields

```text
id
customer_code
full_name
normalized_name
phone
normalized_phone
email
address
notes
status
referral_code_id
total_visits_cache
total_spent_cache
registered_at
created_by
created_at
updated_at
deactivated_at
```

Cache fields may be maintained for dashboard speed but must be recalculable from source records.

---

## 20.2 Customer Duplicate Detection

Primary rule:

- Exact normalized phone match.

Secondary warning rules:

- Same normalized name and email.
- Same normalized name with similar phone.
- Same address and name, optional.

The API should return matching records rather than silently creating duplicates.

---

## 20.3 Customer Deactivation

Deactivation must:

- Preserve history.
- Block new wash creation unless reactivated.
- Not delete invoices, payments, photos, or GPS records.
- Create an audit event.

---

## 21. Vehicle Management

## 21.1 Vehicle Fields

```text
id
customer_id
registration_number
normalized_registration_number
vehicle_type_id
make
model
manufacturing_year
colour
fuel_type
front_image_key
rear_image_key
notes
status
created_by
created_at
updated_at
deactivated_at
```

---

## 21.2 Registration Normalization

Normalization should:

1. Trim leading and trailing spaces.
2. Convert to uppercase.
3. Collapse repeated spaces.
4. Remove unsupported punctuation.
5. Preserve readable registration grouping.

The normalized value must have a unique index.

---

## 22. Vehicle Types

Vehicle types should be stored as configurable records.

Suggested fields:

```text
id
name
code
display_order
active
created_at
updated_at
```

Examples:

- Bike
- Hatchback
- Sedan
- SUV
- MUV
- Van
- Pickup
- Commercial Vehicle
- Other

---

## 23. Service Management

## 23.1 Service Fields

```text
id
name
description
category
service_kind
base_price
estimated_duration_minutes
tax_applicable
active
display_order
created_by
created_at
updated_at
```

`service_kind`:

```text
PRIMARY
ADD_ON
```

---

## 23.2 Service Price Fields

```text
id
service_id
vehicle_type_id
price
tax_applicable_override
active
effective_from
created_by
created_at
updated_at
```

Unique constraint:

```text
service_id + vehicle_type_id + active/effective version rule
```

---

## 23.3 Price Snapshot Rule

When a job is created, store the selected price directly in the wash-job item.

Never calculate historical invoice values from the current service-price table.

---

## 24. Live Photo Capture

## 24.1 Browser API

Use:

```text
navigator.mediaDevices.getUserMedia()
```

The frontend should request an environment-facing camera where supported.

Suggested constraints:

```javascript
{
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  },
  audio: false
}
```

---

## 24.2 Capture Process

1. Display privacy explanation.
2. Request camera permission.
3. Open camera preview.
4. Capture frame to canvas or image blob.
5. Show preview.
6. Allow retake.
7. Compress image.
8. Request upload authorization.
9. Upload to secure R2 endpoint or Worker.
10. Store temporary upload record.
11. Link upload to wash job during creation.

---

## 24.3 Preventing Gallery Substitution

A browser cannot provide absolute forensic proof that an image is live.

The application should reduce misuse by:

- Capturing directly from active camera stream.
- Not showing gallery upload for the mandatory photo field.
- Recording capture timestamp.
- Recording user and session.
- Recording device metadata.
- Requiring GPS capture in the same workflow.
- Using short-lived temporary upload tokens.
- Optionally adding a server-issued challenge value displayed during capture in a future version.

The product must not claim stronger proof than the browser can technically provide.

---

## 24.4 Image Validation

Server-side checks:

- Allowed MIME type
- Maximum size
- Image signature/magic bytes
- Valid decodable image
- Width and height boundaries
- Strip unneeded metadata when possible
- Generate safe filename/key
- Reject executable or malformed content

Suggested accepted types:

```text
image/jpeg
image/png
image/webp
```

---

## 24.5 Image Compression

Target:

- Good vehicle detail
- Reasonable mobile upload time
- Configurable maximum dimensions
- Configurable quality
- Preserve original capture timestamp separately in database

Suggested target:

```text
Maximum long edge: 1920 px
Typical quality: 75–85%
Typical final size: below configured upload limit
```

---

## 25. GPS Capture

## 25.1 Browser API

Use:

```text
navigator.geolocation.getCurrentPosition()
```

Suggested options:

```javascript
{
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0
}
```

---

## 25.2 Captured Values

Store:

```text
latitude
longitude
accuracy_metres
altitude
altitude_accuracy
heading
speed
captured_at_client
received_at_server
permission_state
verification_status
distance_from_business_metres
```

Not all devices provide altitude, heading, or speed.

---

## 25.3 Location Verification

The server must calculate the distance between:

- captured coordinates
- configured business coordinates

Use a geodesic distance formula suitable for short distances.

Result statuses:

```text
AT_BUSINESS_LOCATION
OUTSIDE_BUSINESS_LOCATION
COULD_NOT_VERIFY
OVERRIDDEN
```

---

## 25.4 Verification Rules

Inputs:

- business latitude
- business longitude
- allowed radius in metres
- minimum acceptable accuracy in metres

Example logic:

```text
If coordinates missing:
    COULD_NOT_VERIFY

Else if accuracy exceeds configured threshold:
    mark low accuracy
    require retry or authorized override

Else calculate distance:
    distance <= allowed radius:
        AT_BUSINESS_LOCATION
    distance > allowed radius:
        OUTSIDE_BUSINESS_LOCATION
```

---

## 25.5 Location Override

If enabled, Admin may override a failed location check.

Required:

- permission
- reason
- original location values
- original verification result
- override user
- override timestamp
- audit log

Staff override should be disabled by default.

---

## 26. Temporary Uploads

Photos should first be stored as temporary objects.

Suggested fields:

```text
id
storage_key
purpose
uploaded_by
session_id
mime_type
size_bytes
checksum
created_at
expires_at
linked_record_type
linked_record_id
linked_at
```

A cleanup process should remove expired unlinked uploads.

---

## 27. Wash Job Model

## 27.1 Wash Job Fields

```text
id
job_reference
customer_id
vehicle_id
assigned_staff_id
status
payment_status
currency
subtotal
discount_total
tax_total
rounding_amount
grand_total
amount_paid
balance_due
coupon_redemption_id
referral_redemption_id
reward_redemption_id
location_capture_id
primary_photo_id
start_time
end_time
paused_duration_seconds
active_duration_seconds
notes
cancellation_reason
created_by
created_at
updated_at
completed_at
cancelled_at
version
```

---

## 27.2 Wash Job Statuses

```text
WAITING
IN_PROGRESS
PAUSED
COMPLETED
CANCELLED
```

---

## 27.3 Allowed Transitions

| From | To | Trigger |
|---|---|---|
| WAITING | IN_PROGRESS | Start |
| WAITING | CANCELLED | Cancel |
| IN_PROGRESS | PAUSED | Pause |
| IN_PROGRESS | COMPLETED | End |
| IN_PROGRESS | CANCELLED | Authorized cancel |
| PAUSED | IN_PROGRESS | Resume |
| PAUSED | COMPLETED | Authorized end |
| PAUSED | CANCELLED | Authorized cancel |

All other transitions must be rejected.

---

## 27.4 Optimistic Concurrency

Use a version number or updated timestamp.

Each mutation sends the expected version.

Example:

```json
{
  "expectedVersion": 4
}
```

If the stored version is different, return a conflict and force the client to refresh.

This prevents two devices from controlling the same timer incorrectly.

---

## 28. Wash Job Items

Each selected service or add-on becomes a wash-job item.

Fields:

```text
id
wash_job_id
service_id
service_name_snapshot
service_category_snapshot
item_type
vehicle_type_id
unit_price
quantity
line_subtotal
discount_amount
tax_rate
tax_amount
line_total
display_order
created_at
```

The snapshot fields preserve historical values.

---

## 29. Job Creation Transaction

The job-creation transaction should:

1. Validate authenticated user.
2. Validate customer status.
3. Validate vehicle ownership and status.
4. Validate photo and location requirements.
5. Validate active services.
6. Load server-side prices.
7. Recalculate subtotal.
8. Validate coupon/referral/reward.
9. Calculate discounts.
10. Calculate tax.
11. Calculate final amount.
12. Create wash job.
13. Create wash-job items.
14. Link photo.
15. Link location.
16. Reserve coupon/referral/reward usage.
17. Generate unique job reference.
18. Create audit event.
19. Commit.

Any failure should roll back the full transaction.

---

## 30. Job Reference Generation

Recommended format:

```text
WJ-YYYY-NNNNNN
```

Example:

```text
WJ-2026-000001
```

Implementation options:

- Year-specific sequence table
- Atomic sequence row update
- Database-generated numeric sequence combined with year

The generation process must be transaction-safe.

---

## 31. Timer Architecture

## 31.1 Timer Source of Truth

The server is the source of truth.

The browser only displays a derived timer.

Never store the authoritative timer only in:

- browser memory
- local storage
- setInterval state
- client timestamps

---

## 31.2 Timer Events

Event types:

```text
START
PAUSE
RESUME
END
ADJUSTMENT
```

Fields:

```text
id
wash_job_id
event_type
server_timestamp
performed_by
reason
previous_event_id
metadata_json
created_at
```

---

## 31.3 Start Timer

Requirements:

- Job status must be `WAITING`.
- No active timer interval may exist.
- Required photo and GPS must be present.
- User must have permission.
- Store server timestamp.
- Set status to `IN_PROGRESS`.

---

## 31.4 Pause Timer

Requirements:

- Job status must be `IN_PROGRESS`.
- Store pause timestamp.
- Set status to `PAUSED`.
- Optional or required pause reason according to settings.

---

## 31.5 Resume Timer

Requirements:

- Job status must be `PAUSED`.
- Store resume timestamp.
- Set status to `IN_PROGRESS`.

---

## 31.6 End Timer

Requirements:

- Job status must be `IN_PROGRESS` or permitted `PAUSED`.
- Store end timestamp.
- Calculate active duration.
- Set status to `COMPLETED`.
- Lock normal editing.

---

## 31.7 Active Duration Calculation

Calculation:

```text
Sum each START/RESUME → PAUSE/END interval
```

Do not depend only on a stored counter.

A cached total may be stored for display, but it must be reproducible from events.

---

## 31.8 Timer Display Synchronization

The API should return:

```json
{
  "status": "IN_PROGRESS",
  "serverNow": "2026-07-23T08:00:00Z",
  "activeDurationSeconds": 950,
  "currentIntervalStartedAt": "2026-07-23T07:55:00Z",
  "version": 5
}
```

The frontend uses the difference between `serverNow` and the current interval start to display a smooth timer.

Periodic resynchronization should correct clock drift.

---

## 31.9 Timer Adjustment

Only authorized Admin users can adjust timer records.

Requirements:

- Existing events remain unchanged.
- Create adjustment record.
- Store old calculated duration.
- Store new approved duration.
- Require reason.
- Record Admin user.
- Write audit log.

---

## 32. Billing Engine

## 32.1 Billing Source of Truth

All final billing must be calculated on the backend.

The frontend may show estimates but must submit only selections, not trusted totals.

---

## 32.2 Calculation Order

```text
Primary service items
+ Add-on items
= Subtotal
− Coupon discount
− Referral friend discount
− Referral reward redemption
− Authorized manual discount
= Taxable amount according to configured rules
+ Tax
± Rounding
= Final payable amount
```

---

## 32.3 Billing Rules

- Final amount cannot be negative.
- Discount cannot exceed eligible amount.
- Percentage discount must respect maximum discount.
- Tax must use stored tax snapshot.
- Coupon/referral stacking must follow settings.
- Disabled service cannot be newly selected.
- Price must correspond to vehicle type.
- Manual discount requires permission and reason.
- Completed job totals are immutable except through adjustment.
- Financial arithmetic should use integer minor currency units where practical.

---

## 32.4 Money Representation

Recommended:

- Store money as integer minor units, such as paise.
- Avoid floating-point arithmetic.
- Convert to formatted currency only for display.

Example:

```text
₹499.50 → 49950 paise
```

If D1 constraints require numeric storage, enforce integer values.

---

## 32.5 Tax Calculation

Store:

- configured tax rate
- tax applicability
- taxable base
- calculated tax amount
- rounding rule

Historical records must retain the tax rate used at the time.

---

## 33. Coupon Engine

## 33.1 Coupon Fields

```text
id
code
normalized_code
description
discount_type
discount_value
minimum_bill
maximum_discount
starts_at
expires_at
total_usage_limit
per_customer_limit
new_customers_only
active
created_by
created_at
updated_at
```

Related eligibility tables:

```text
coupon_services
coupon_vehicle_types
```

---

## 33.2 Discount Types

```text
FIXED
PERCENTAGE
```

---

## 33.3 Coupon Validation

Validate:

- Exists
- Active
- Current date within validity
- Total use available
- Customer use available
- Minimum bill reached
- Eligible service
- Eligible vehicle type
- New-customer rule
- Stacking rule
- Not already reserved by duplicate request

---

## 33.4 Coupon Redemption Status

```text
RESERVED
APPLIED
RELEASED
CANCELLED
```

A coupon may be reserved at job creation and finalized according to business policy.

Cancelled jobs should release the reservation unless the policy states otherwise.

---

## 33.5 Transaction Safety

Coupon validation and reservation must occur in the same database transaction as job creation.

---

## 34. Referral System

## 34.1 Referral Code Fields

```text
id
customer_id
code
normalized_code
status
issued_at
expires_at
created_at
```

Status:

```text
ACTIVE
DISABLED
EXPIRED
```

---

## 34.2 Referral Redemption Fields

```text
id
referral_code_id
referrer_customer_id
referred_customer_id
wash_job_id
discount_type
discount_value
discount_amount
status
created_at
completed_at
cancelled_at
```

Statuses:

```text
PENDING
SUCCESSFUL
CANCELLED
EXPIRED
```

---

## 34.3 Referral Reward Fields

```text
id
referrer_customer_id
source_redemption_id
source_wash_job_id
reward_type
reward_value
reward_amount
remaining_amount
status
earned_at
expires_at
used_at
created_at
```

Statuses:

```text
PENDING
AVAILABLE
PARTIALLY_USED
USED
EXPIRED
CANCELLED
```

---

## 34.4 Referral Validation

Prevent:

- Self-referral
- Repeated first-time benefit
- Invalid or disabled code
- Expired code
- Duplicate reward for one wash job
- Reward before full eligible payment
- Negative reward balance
- Unauthorized manual adjustment

---

## 34.5 Reward Finalization

Referral reward should become available only after:

- Referred wash is completed.
- Required payment is fully paid.
- Referral redemption remains valid.
- No reward already exists.

This must be transaction-safe.

---

## 35. Payment Management

## 35.1 Payment Fields

```text
id
payment_reference
wash_job_id
amount
currency
method
status
transaction_reference
paid_at
received_by
notes
idempotency_key
created_at
updated_at
```

---

## 35.2 Payment Methods

```text
CASH
UPI
CARD
BANK_TRANSFER
OTHER
```

---

## 35.3 Payment Statuses

```text
PENDING
PARTIALLY_PAID
PAID
REFUNDED
CANCELLED
```

The wash job may cache the current combined payment status.

---

## 35.4 Payment Rules

- Amount must be positive.
- Payment must belong to an existing job.
- Total accepted payment cannot exceed payable balance except through explicit overpayment policy.
- Transaction reference is required for configured non-cash methods.
- Staff may record payment if permitted.
- Refund requires Admin permission.
- Payment records must not be hard-deleted.
- Every payment mutation must be auditable.
- Idempotency key must prevent duplicate submission.

---

## 35.5 Partial Payment

The system should calculate:

```text
amount_paid = sum(valid payments) − sum(valid refunds)
balance_due = grand_total − amount_paid
```

Status rules:

```text
amount_paid <= 0 → PENDING
0 < amount_paid < grand_total → PARTIALLY_PAID
amount_paid == grand_total → PAID
```

---

## 36. Refunds

Refund fields:

```text
id
payment_id
wash_job_id
amount
reason
approved_by
processed_at
created_at
```

Refund processing should:

1. Validate Admin permission.
2. Validate refundable balance.
3. Create refund record.
4. Update payment summary.
5. Update revenue.
6. Adjust referral reward if required.
7. Create audit log.

---

## 37. Invoice Architecture

## 37.1 Invoice Snapshot

An invoice must not depend on live customer or service records after creation.

Store:

```text
id
invoice_number
wash_job_id
customer_snapshot_json
vehicle_snapshot_json
business_snapshot_json
items_snapshot_json
totals_snapshot_json
payment_snapshot_json
referral_snapshot_json
issued_at
pdf_storage_key
public_token_hash
public_token_expires_at
revision_number
status
created_by
created_at
```

---

## 37.2 Invoice Status

```text
DRAFT
ISSUED
REVISED
CANCELLED
```

Normal completed invoices should be `ISSUED`.

---

## 37.3 Invoice Number

Recommended format:

```text
WP-YYYY-NNNNNN
```

The sequence must be unique and transaction-safe.

---

## 37.4 PDF Generation

Recommended process:

1. Build immutable invoice snapshot.
2. Render PDF from snapshot.
3. Generate file checksum.
4. Upload PDF to R2.
5. Save storage key and checksum.
6. Return invoice metadata.
7. If PDF generation fails, keep job and payment intact.
8. Retry using the same invoice record.

The retry process must not create another invoice number.

---

## 37.5 Invoice Revision

Financial corrections should:

- Preserve original invoice.
- Create a revised invoice with incremented revision.
- Link revised invoice to original.
- Explain correction.
- Write audit log.

---

## 38. Protected Invoice Links

A public invoice link should use a random, high-entropy token.

Rules:

- Store only token hash.
- Token may expire.
- Do not expose internal database IDs.
- Limit information to invoice content.
- Do not expose GPS, internal notes, audit information, or unrelated customer history.
- Allow Admin to revoke link.
- Apply rate limiting.

---

## 39. WhatsApp Sharing

Initial implementation:

- Generate pre-filled text.
- Open `wa.me` or platform-specific WhatsApp link.
- Include invoice view/download link.
- Allow manual PDF download and attachment.

The application should not claim that standard WhatsApp links automatically attach a PDF.

Suggested message data:

```text
Customer name
Vehicle number
Service
Invoice number
Final amount
Payment status
Referral code
Invoice link
Thank-you message
```

---

## 40. Expense Management

## 40.1 Expense Fields

```text
id
expense_reference
title
category_id
amount
currency
expense_date
payment_method
description
receipt_storage_key
status
recorded_by
created_at
updated_at
cancelled_at
cancelled_by
cancellation_reason
```

---

## 40.2 Expense Status

```text
ACTIVE
CANCELLED
```

Avoid hard deletion of financial records.

---

## 40.3 Expense Categories

Store configurable categories:

```text
id
name
active
display_order
created_at
updated_at
```

---

## 41. Dashboard Calculations

## 41.1 Revenue

Recommended definition:

```text
Valid received payments
− valid refunds
```

Alternative business rules must be explicitly configured.

Do not use invoice totals alone as realized revenue.

---

## 41.2 Expenses

```text
Sum ACTIVE expenses within selected accounting date range
```

---

## 41.3 Net Profit

```text
Net Profit = Revenue − Expenses
```

---

## 41.4 Operational Metrics

- Jobs created
- Jobs completed
- Jobs cancelled
- Vehicles waiting
- Jobs in progress
- Paused jobs
- Average active duration
- Pending balances
- Coupon discounts
- Referral discounts
- Referral rewards

---

## 42. Reporting Architecture

Reports should use optimized SQL queries and reusable reporting services.

Report dimensions:

- Date
- Service
- Vehicle type
- Staff
- Payment method
- Job status
- Coupon
- Referral
- Expense category

---

## 42.1 Report Date Semantics

Store timestamps in UTC.

Convert business-local date filters into UTC boundaries.

Example:

```text
Business timezone: Asia/Kolkata
Selected date: 2026-07-23

Query interval:
2026-07-22T18:30:00Z
to
2026-07-23T18:30:00Z
```

This prevents incorrect daily totals.

---

## 42.2 Report Export

Supported:

- PDF
- CSV
- XLSX if approved

Large exports may use a queued process.

Export should store:

- requested by
- filters
- format
- generated timestamp
- result storage key
- status

---

## 43. Audit Logging

## 43.1 Audit Fields

```text
id
actor_user_id
action
record_type
record_id
previous_value_json
new_value_json
reason
request_id
ip_hash
user_agent
created_at
```

---

## 43.2 Audited Actions

At minimum:

- Login success and failure
- Logout
- Staff creation
- Staff disablement
- Password reset
- Service change
- Price change
- Coupon change
- Referral setting change
- Reward adjustment
- Job cancellation
- Timer adjustment
- Payment creation
- Refund
- Expense edit or cancellation
- Invoice revision
- Customer deactivation
- Settings change
- Unauthorized access attempt

---

## 43.3 Sensitive Data in Audit Logs

Do not store:

- Passwords
- Session tokens
- full payment secrets
- private access tokens
- unnecessary image binary data

Mask sensitive fields.

---

## 44. File Storage Design

Recommended R2 key structure:

```text
business/{businessId}/logos/{fileId}.webp
business/{businessId}/vehicles/{vehicleId}/{photoId}.webp
business/{businessId}/wash-jobs/{jobId}/{photoId}.webp
business/{businessId}/expenses/{expenseId}/{receiptId}.pdf
business/{businessId}/invoices/{year}/{invoiceId}.pdf
business/{businessId}/exports/{exportId}.csv
temporary/{userId}/{uploadId}
```

Do not use customer names or phone numbers in storage keys.

---

## 45. Storage Access

R2 buckets should be private.

Files should be accessed through:

- authenticated API proxy
- short-lived signed URL
- protected invoice token route

Authorization must be checked before creating a signed URL.

---

## 46. File Retention

Suggested categories:

| File Type | Retention |
|---|---|
| Linked wash photos | Configurable |
| Expense receipts | Financial retention policy |
| Invoice PDFs | Long-term business retention |
| Temporary uploads | Hours or one day |
| Export files | Short configurable period |
| Superseded logo files | Cleanup after safe delay |

---

## 47. Settings Architecture

Settings may be stored as:

- typed settings table
- business settings record
- module-specific settings tables

Avoid one unvalidated arbitrary JSON object for all critical settings.

Suggested settings modules:

```text
business
invoice
tax
payment
location
coupon
referral
security
formatting
retention
```

---

## 48. Settings Cache

Settings can be cached in KV.

Rules:

- Database remains source of truth.
- Cache keys include environment and business ID.
- Updating settings invalidates cache.
- Financial operations may bypass stale cache for critical settings.
- Cache failures must not prevent access to database values.

---

## 49. Database Design Principles

- Foreign keys enabled where supported.
- Unique indexes on normalized identifiers.
- Index all common search and reporting columns.
- Use soft deletion for important business entities.
- Use transaction-safe financial operations.
- Store immutable snapshots.
- Avoid cascading deletion of financial or audit records.
- Add `created_at` and `updated_at` consistently.
- Add `created_by` where accountability is required.

---

## 50. Core Database Tables

Recommended core tables:

```text
users
roles
permissions
role_permissions
user_permissions
sessions

customers
vehicles
vehicle_types

vehicle_photos
location_captures
temporary_uploads

services
service_prices

wash_jobs
wash_job_items
timer_events
timer_adjustments

coupons
coupon_services
coupon_vehicle_types
coupon_redemptions

referral_codes
referral_redemptions
referral_rewards
reward_redemptions

payments
refunds

expense_categories
expenses

invoices
invoice_revisions

settings
audit_logs
idempotency_keys
sequences
report_exports
```

---

## 51. Important Indexes

```text
users(normalized_username)
users(normalized_email)
users(normalized_phone)
users(status)

sessions(token_hash)
sessions(user_id, expires_at)

customers(normalized_phone)
customers(normalized_name)
customers(status)

vehicles(normalized_registration_number)
vehicles(customer_id)
vehicles(vehicle_type_id)

wash_jobs(job_reference)
wash_jobs(status, created_at)
wash_jobs(assigned_staff_id, status)
wash_jobs(customer_id, created_at)
wash_jobs(vehicle_id, created_at)
wash_jobs(payment_status, completed_at)

timer_events(wash_job_id, server_timestamp)

services(active, display_order)
service_prices(service_id, vehicle_type_id)

coupons(normalized_code)
coupon_redemptions(coupon_id, customer_id)
coupon_redemptions(wash_job_id)

referral_codes(normalized_code)
referral_redemptions(referred_customer_id)
referral_rewards(referrer_customer_id, status)

payments(wash_job_id, status)
payments(transaction_reference)
payments(idempotency_key)

expenses(expense_date, status)
expenses(category_id, expense_date)

invoices(invoice_number)
invoices(wash_job_id)
invoices(public_token_hash)

audit_logs(created_at)
audit_logs(actor_user_id, created_at)
audit_logs(record_type, record_id)

idempotency_keys(key, user_id, operation)
```

---

## 52. Idempotency

Idempotency is required for:

- Job creation
- Timer commands
- Payment creation
- Refund creation
- Invoice generation
- Coupon reservation
- Referral finalization
- Expense creation
- Export request

Request header:

```text
Idempotency-Key: random-client-generated-value
```

Store:

```text
key
user_id
operation
request_hash
response_status
response_body
created_at
expires_at
```

If the same key and request are repeated, return the original response.

---

## 53. API Endpoint Groups

## 53.1 Authentication

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/session
POST   /api/v1/auth/change-password
```

---

## 53.2 Users

```text
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
POST   /api/v1/users/:id/disable
POST   /api/v1/users/:id/enable
POST   /api/v1/users/:id/reset-password
GET    /api/v1/users/:id/activity
```

---

## 53.3 Customers

```text
GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/:id
PATCH  /api/v1/customers/:id
POST   /api/v1/customers/:id/deactivate
POST   /api/v1/customers/:id/reactivate
GET    /api/v1/customers/:id/history
GET    /api/v1/customers/:id/referrals
```

---

## 53.4 Vehicles

```text
GET    /api/v1/vehicles
POST   /api/v1/vehicles
GET    /api/v1/vehicles/:id
PATCH  /api/v1/vehicles/:id
POST   /api/v1/vehicles/:id/deactivate
POST   /api/v1/vehicles/:id/reactivate
GET    /api/v1/vehicles/:id/history
```

---

## 53.5 Uploads and Capture

```text
POST   /api/v1/uploads/photo
POST   /api/v1/uploads/receipt
DELETE /api/v1/uploads/:id

POST   /api/v1/location-captures
GET    /api/v1/location-captures/:id
```

For direct-to-R2 uploads, use separate authorization and completion endpoints.

---

## 53.6 Services and Pricing

```text
GET    /api/v1/services
POST   /api/v1/services
GET    /api/v1/services/:id
PATCH  /api/v1/services/:id
POST   /api/v1/services/:id/enable
POST   /api/v1/services/:id/disable

GET    /api/v1/service-prices
POST   /api/v1/service-prices
PATCH  /api/v1/service-prices/:id
```

---

## 53.7 Wash Jobs

```text
GET    /api/v1/wash-jobs
POST   /api/v1/wash-jobs
GET    /api/v1/wash-jobs/:id
PATCH  /api/v1/wash-jobs/:id
POST   /api/v1/wash-jobs/:id/assign
POST   /api/v1/wash-jobs/:id/start
POST   /api/v1/wash-jobs/:id/pause
POST   /api/v1/wash-jobs/:id/resume
POST   /api/v1/wash-jobs/:id/complete
POST   /api/v1/wash-jobs/:id/cancel
GET    /api/v1/wash-jobs/:id/timer
GET    /api/v1/wash-jobs/:id/history
```

---

## 53.8 Coupons

```text
GET    /api/v1/coupons
POST   /api/v1/coupons
GET    /api/v1/coupons/:id
PATCH  /api/v1/coupons/:id
POST   /api/v1/coupons/:id/enable
POST   /api/v1/coupons/:id/disable
DELETE /api/v1/coupons/:id
POST   /api/v1/coupons/validate
GET    /api/v1/coupons/:id/usage
```

---

## 53.9 Referrals

```text
GET    /api/v1/referrals/settings
PATCH  /api/v1/referrals/settings
POST   /api/v1/referrals/validate
GET    /api/v1/referrals/redemptions
GET    /api/v1/referrals/rewards
POST   /api/v1/referrals/rewards/:id/adjust
POST   /api/v1/referrals/rewards/:id/redeem
```

---

## 53.10 Payments and Refunds

```text
GET    /api/v1/payments
POST   /api/v1/payments
GET    /api/v1/payments/:id
POST   /api/v1/payments/:id/refund
GET    /api/v1/wash-jobs/:id/payments
```

---

## 53.11 Expenses

```text
GET    /api/v1/expenses
POST   /api/v1/expenses
GET    /api/v1/expenses/:id
PATCH  /api/v1/expenses/:id
POST   /api/v1/expenses/:id/cancel

GET    /api/v1/expense-categories
POST   /api/v1/expense-categories
PATCH  /api/v1/expense-categories/:id
```

---

## 53.12 Invoices

```text
GET    /api/v1/invoices
POST   /api/v1/wash-jobs/:id/invoice
GET    /api/v1/invoices/:id
GET    /api/v1/invoices/:id/pdf
POST   /api/v1/invoices/:id/revise
POST   /api/v1/invoices/:id/share-message

GET    /invoice/:publicToken
```

---

## 53.13 Dashboard and Reports

```text
GET    /api/v1/dashboard/summary
GET    /api/v1/dashboard/activity

GET    /api/v1/reports/revenue
GET    /api/v1/reports/expenses
GET    /api/v1/reports/profit
GET    /api/v1/reports/services
GET    /api/v1/reports/vehicles
GET    /api/v1/reports/customers
GET    /api/v1/reports/coupons
GET    /api/v1/reports/referrals
GET    /api/v1/reports/staff
POST   /api/v1/reports/export
```

---

## 53.14 Settings and Audit

```text
GET    /api/v1/settings
PATCH  /api/v1/settings/business
PATCH  /api/v1/settings/invoice
PATCH  /api/v1/settings/tax
PATCH  /api/v1/settings/location
PATCH  /api/v1/settings/referral
PATCH  /api/v1/settings/security

GET    /api/v1/audit-logs
GET    /api/v1/audit-logs/:id
```

---

## 54. Request Validation

Validation must occur:

1. In the frontend for immediate feedback.
2. In the API for security and correctness.
3. In the database through constraints where appropriate.

The backend is authoritative.

---

## 55. Concurrency and Race Conditions

Protect against:

- Two Staff users starting one job.
- Duplicate payment clicks.
- Coupon limit being exceeded concurrently.
- Referral reward created twice.
- Invoice generated twice.
- Two Admins editing the same service price.
- Job completed while another device pauses it.

Use:

- transactions
- optimistic version checks
- unique constraints
- idempotency keys
- atomic conditional updates

---

## 56. Security Requirements

## 56.1 Transport Security

- HTTPS only in production.
- Redirect HTTP to HTTPS.
- Use secure cookies.
- Use HSTS after deployment validation.
- Restrict CORS to approved frontend origins.

---

## 56.2 Application Security

- Server-side permission checks
- Input validation
- SQL parameter binding
- Output encoding
- CSRF protection
- Rate limiting
- Session revocation
- Safe error messages
- Content Security Policy
- File signature validation
- No secrets in frontend bundle
- No direct public bucket access
- Audit logging

---

## 56.3 CSRF Protection

For cookie-authenticated mutation requests:

- SameSite cookies
- Origin/Referer verification
- CSRF token where required
- Reject cross-origin state changes

---

## 56.4 Content Security Policy

Restrict:

- scripts
- styles
- images
- frames
- connections
- object embedding

Only approved domains should be allowed.

Camera and GPS do not require third-party script access.

---

## 56.5 Data Exposure

API responses should return only required fields.

Staff responses must not expose:

- net profit
- global financial summaries
- password or session data
- sensitive audit records
- internal storage keys
- private access tokens

---

## 57. Privacy

The system captures:

- Personal details
- Vehicle information
- Vehicle images
- GPS coordinates
- Payment records
- Staff activity

Required safeguards:

- Display consent/purpose notice.
- Restrict access by role.
- Use private storage.
- Define retention periods.
- Avoid public GPS exposure.
- Avoid exposing phone/email in public invoice URLs unless required.
- Provide controlled deactivation and retention workflow.
- Log access to highly sensitive records if required.

---

## 58. Performance Targets

Suggested targets under normal business load:

| Operation | Target |
|---|---|
| Login | under 2 seconds |
| Customer search | under 1 second |
| Vehicle search | under 1 second |
| Active jobs load | under 2 seconds |
| Job creation excluding upload | under 2 seconds |
| Timer command | under 1 second |
| Dashboard summary | under 3 seconds |
| Standard report | under 5 seconds |
| Invoice generation | under 10 seconds |
| Mobile initial page load | optimized for typical mobile networks |

Targets exclude poor network conditions and unusually large exports.

---

## 59. Frontend Performance

- Route-based code splitting.
- Lazy-load charts and Admin-only modules.
- Compress images before upload.
- Use optimized icons.
- Avoid oversized UI libraries.
- Paginate large tables.
- Debounce search input.
- Cache stable configuration.
- Avoid high-frequency timer API polling.
- Use browser visibility API to reduce background work.

---

## 60. Database Performance

- Add documented indexes.
- Avoid unbounded queries.
- Select only required columns.
- Use aggregate queries for reports.
- Cache selected dashboard values where justified.
- Use daily summary tables only if real query performance requires them.
- Test with realistic data volume.

---

## 61. Expected Data Volume

Initial planning assumption:

```text
Users: below 100
Customers: tens of thousands
Vehicles: tens of thousands
Wash jobs: hundreds of thousands over long-term use
Timer events: several per wash job
Payments: one or more per wash job
Photos: one or more per wash job
Invoices: one or more versions per completed job
Audit logs: high-growth append-only table
```

The database design should not assume only a few hundred records.

---

## 62. Reliability

Required:

- Timer survives refresh.
- Payment retry does not duplicate.
- Invoice retry does not duplicate.
- Coupon reservation is transactional.
- Referral reward is transactional.
- Failed upload does not silently create an incomplete job.
- Completed job cannot return to normal editable state.
- Temporary failures return retryable errors.
- Database migrations are reversible where practical.
- Backups are tested.

---

## 63. Offline and Poor Network Behaviour

The first release is online-first.

Recommended behaviour:

- Detect offline state.
- Prevent final business mutations while offline.
- Preserve safe unsaved form drafts locally.
- Clearly show “Offline” status.
- Retry read requests when connection returns.
- Verify mutation status before resubmitting.
- Do not run authoritative timers only on the client.

Full offline operation is a future feature and requires a separate synchronization design.

---

## 64. Observability

## 64.1 Structured Logs

Log:

```text
timestamp
level
request_id
user_id
route
method
status
duration_ms
error_code
resource_type
resource_id
```

Do not log passwords, tokens, full images, or sensitive request bodies.

---

## 64.2 Error Monitoring

Capture:

- API exceptions
- frontend unhandled errors
- invoice-generation failures
- file-upload failures
- database errors
- repeated unauthorized access
- queue failures
- slow report queries

---

## 64.3 Health Checks

Recommended endpoints:

```text
GET /health
GET /health/database
GET /health/storage
```

Detailed health information should be protected in production.

---

## 65. Backup Strategy

## 65.1 Database

Required:

- Scheduled database backups
- Pre-migration backup
- Documented restore process
- Periodic restore test
- Retention policy

---

## 65.2 Object Storage

Required:

- Versioning or backup strategy where available
- Lifecycle rules
- Protection against accidental public access
- Export of critical invoice objects if required
- Restore documentation

---

## 65.3 Backup Validation

A backup is not considered valid until restoration is tested in a non-production environment.

---

## 66. Database Migrations

Migration rules:

- Numbered migrations
- Stored in source control
- Applied automatically in controlled deployment step
- Tested on staging
- Pre-production backup
- Forward-only where rollback is unsafe
- Separate data-fix scripts from schema changes
- Record applied migration version

---

## 67. Deployment Process

Recommended sequence:

1. Run static checks.
2. Run unit tests.
3. Run integration tests.
4. Build frontend.
5. Build Worker.
6. Apply staging migrations.
7. Deploy staging.
8. Run smoke tests.
9. Approve production release.
10. Back up production database.
11. Apply production migration.
12. Deploy API.
13. Deploy frontend.
14. Run production smoke tests.
15. Monitor logs.

---

## 68. CI/CD

Pipeline checks:

```text
install
format check
lint
type check
unit tests
integration tests
build
security dependency review
migration validation
end-to-end smoke tests
deploy
```

Production deployment should require an approval step.

---

## 69. Testing Strategy

## 69.1 Unit Tests

Test domain logic:

- Money calculations
- Tax
- Fixed coupon
- Percentage coupon
- Maximum discount
- Minimum bill
- Coupon limits
- Referral validation
- Self-referral
- Reward creation
- Reward redemption
- Payment status
- Refund calculations
- Timer intervals
- Status transitions
- GPS distance
- Invoice numbering
- Registration normalization

---

## 69.2 Repository Tests

Test:

- Unique constraints
- Foreign keys
- transactions
- pagination
- filters
- report queries
- audit inserts
- migration compatibility

---

## 69.3 API Integration Tests

Test:

- login
- disabled account
- permissions
- customer CRUD
- duplicate customer
- vehicle CRUD
- duplicate registration
- job creation
- invalid service
- missing photo
- missing GPS
- start/pause/resume/end
- concurrent timer mutation
- coupon reservation
- referral reward
- payment idempotency
- refund authorization
- invoice retry
- report access
- settings access

---

## 69.4 Frontend Tests

Test:

- Form validation
- Route guards
- Mobile navigation
- New Wash wizard
- Camera error UI
- GPS error UI
- Price summary
- Active timer display
- Payment form
- Invoice preview
- Empty states
- Loading states
- Session expiry

---

## 69.5 End-to-End Tests

Core journeys:

1. Admin creates Staff.
2. Staff logs in.
3. Staff adds customer and vehicle.
4. Staff captures photo and location.
5. Staff creates job.
6. Staff controls timer.
7. Staff completes job.
8. Staff records payment.
9. Staff generates invoice.
10. Staff opens WhatsApp message.
11. Admin records expense.
12. Admin verifies revenue and profit.
13. Admin exports report.

---

## 69.6 Device Testing

Test on:

- Android Chrome
- iPhone Safari
- Android tablet
- iPad Safari
- Windows Chrome
- Windows Edge
- macOS Safari
- macOS Chrome where available

---

## 69.7 Permission Testing

Test:

- Camera allowed
- Camera denied
- Camera unavailable
- Location allowed
- Location denied
- Location services disabled
- Low GPS accuracy
- Outside business radius
- Secure-context requirement
- Browser API unsupported

---

## 69.8 Security Testing

Test:

- Authentication bypass
- Role bypass
- Direct Admin endpoint access
- CSRF
- injection
- invalid file upload
- token guessing
- public invoice access
- session fixation
- session expiry
- brute-force login
- duplicate financial request
- insecure object access
- sensitive error leakage

---

## 70. Accessibility

Target practical WCAG-aligned accessibility.

Requirements:

- Keyboard navigation
- Visible focus indicators
- Form labels
- Error association
- Sufficient contrast
- Touch targets
- Screen-reader-friendly buttons
- Status not communicated by colour alone
- Table alternatives or responsive cards
- Accessible charts with text summaries

---

## 71. Browser Compatibility

Support current stable versions of:

- Chrome
- Edge
- Firefox
- Safari

Camera and GPS support should be capability-detected.

When unsupported:

- Explain the missing capability.
- Disable the affected action.
- Provide authorized alternate workflow only if business policy allows.

---

## 72. Internationalization and Formatting

Initial release may use one primary language.

Architecture should support future localization.

Use configurable:

- Currency
- Timezone
- Date format
- Time format
- Number format
- Invoice wording
- WhatsApp message wording

Avoid hardcoding locale-sensitive values.

---

## 73. Time Handling

Rules:

- Store all event timestamps in UTC.
- Store configured business timezone.
- Display local time in UI.
- Generate reports using business-local boundaries.
- Store both client capture time and server receive time for photo/GPS evidence.
- Use server timestamps for timer and payment records.

---

## 74. Data Validation Examples

### Customer

```text
name: required, trimmed
phone: required, normalized
email: optional, valid format
```

### Vehicle

```text
registration: required, uppercase-normalized, unique
vehicle type: required
year: valid range when present
```

### Service

```text
name: required
price: non-negative integer minor units
duration: positive integer when provided
```

### Wash Job

```text
customer: active
vehicle: active and owned by customer
photo: required when configured
location: required when configured
service: at least one primary service
```

### Payment

```text
amount: positive
amount <= remaining balance
method: valid enum
transaction reference: required when configured
```

---

## 75. Business Rule Configuration

Configurable rules should include:

- Mandatory photo
- Mandatory GPS
- Allowed location radius
- Minimum GPS accuracy
- Whether outside-location job is blocked
- Whether Staff can add expenses
- Coupon/referral stacking
- Whether partial payment invoice is allowed
- Whether unpaid completed jobs are allowed
- Rounding mode
- Default tax
- Referral reward timing
- Reward expiry
- Session timeout
- Default payment method

---

## 76. Initial Seed Data

Production setup should create:

- Initial Admin account
- Default permissions
- Common vehicle types
- Default expense categories
- Base business settings
- Default invoice prefix
- Default payment methods
- Optional sample services only if approved

Temporary passwords must be changed during handover.

---

## 77. Data Import

Data import is optional for the first release.

If required, support controlled CSV/XLSX import for:

- Customers
- Vehicles
- Services
- Prices

Import requirements:

- Preview
- validation
- duplicate detection
- row-level errors
- transaction or safe partial mode
- import summary
- audit log
- maximum file size
- no formula execution

---

## 78. Data Export

Admin may export:

- Customers
- Vehicles
- Wash jobs
- Payments
- Expenses
- Invoices
- Reports

Export must respect role and filter permissions.

Sensitive fields should be excluded unless explicitly required.

---

## 79. Soft Delete and Record Preservation

Use soft deletion or cancellation for:

- Users
- Customers
- Vehicles
- Services
- Coupons
- Expenses

Do not hard-delete:

- Payments
- Refunds
- Issued invoices
- Completed wash jobs
- Timer events
- Audit logs
- Referral rewards tied to financial history

---

## 80. Initial Admin Setup Flow

1. Deploy application.
2. Apply migrations.
3. Create initial Admin.
4. Admin logs in with temporary password.
5. Force password change.
6. Configure business profile.
7. Upload logo.
8. Configure tax and invoice.
9. Set business location.
10. Set GPS radius and accuracy.
11. Add vehicle types.
12. Add services and prices.
13. Configure coupons and referrals.
14. Create Staff accounts.
15. Run test wash.
16. Verify invoice and reports.

---

## 81. Production Readiness Checklist

### Application

- [ ] All required flows implemented
- [ ] All role checks enforced
- [ ] All state transitions tested
- [ ] Mobile layout verified
- [ ] Camera and GPS tested
- [ ] Timer refresh persistence verified
- [ ] Financial calculations verified
- [ ] Invoice generation verified
- [ ] WhatsApp message verified

### Security

- [ ] HTTPS enabled
- [ ] Secrets configured
- [ ] Password hashing verified
- [ ] Secure cookies enabled
- [ ] CSRF controls enabled
- [ ] Rate limiting enabled
- [ ] R2 private
- [ ] File validation enabled
- [ ] Admin endpoints tested
- [ ] Audit logs enabled

### Data

- [ ] Migrations applied
- [ ] Unique constraints verified
- [ ] Backup configured
- [ ] Restore tested
- [ ] Retention policy approved
- [ ] Initial Admin secured

### Operations

- [ ] Domain configured
- [ ] Monitoring enabled
- [ ] Error logging verified
- [ ] Support procedure documented
- [ ] Admin training completed
- [ ] Staff training completed

---

## 82. Technical Acceptance Criteria

The technical implementation is acceptable when:

1. Authenticated sessions are secure and revocable.
2. Disabled users cannot log in.
3. Staff cannot access Admin-only APIs.
4. Customer duplicate detection works.
5. Vehicle registration uniqueness works.
6. Live photo upload is private and linked correctly.
7. GPS accuracy and radius validation work.
8. Job creation is transactional.
9. Price snapshots remain unchanged after service-price updates.
10. Invalid job status transitions are rejected.
11. Timer state survives refresh and multiple devices.
12. Coupon limits are transaction-safe.
13. Self-referrals and duplicate referrals are blocked.
14. Referral reward is created only once after eligible full payment.
15. Duplicate payment submission returns the original result.
16. Refunds require authorization and create audit records.
17. Invoice numbers are unique.
18. Invoice retries do not create duplicates.
19. Issued invoice snapshots are immutable.
20. R2 objects are private.
21. Protected invoice links do not expose internal data.
22. Revenue and profit reports match source transactions.
23. Backups and restoration are documented and tested.
24. Required browser and device tests pass.
25. Production logs do not expose secrets or passwords.

---

## 83. Recommended Development Order

### Stage 1 — Foundation

- Monorepo
- Shared contracts
- Worker API
- D1 migrations
- Authentication
- Sessions
- Roles and permissions
- Base layouts
- Initial Admin

### Stage 2 — Core Records

- Customers
- Vehicles
- Vehicle types
- Services
- Service prices
- Search and pagination

### Stage 3 — Capture and Wash Operations

- R2 upload flow
- Camera capture
- GPS capture
- Location verification
- New Wash wizard
- Wash jobs
- Timer events
- Status transitions

### Stage 4 — Billing and Retention

- Billing engine
- Coupons
- Referrals
- Payments
- Refunds
- Invoice snapshots
- PDF generation
- WhatsApp message

### Stage 5 — Business Management

- Expenses
- Dashboard
- Reports
- Exports
- Settings
- Audit logs

### Stage 6 — Quality and Release

- Security hardening
- Performance testing
- Device testing
- Backup/restore
- CI/CD
- Staging
- Production deployment
- Training and handover

---

## 84. Open Technical Decisions

These decisions should be approved before implementation:

1. Exact frontend component library, if any.
2. Exact Worker-compatible password-hashing library.
3. Exact PDF-generation library.
4. Whether invoice links expire.
5. Whether job creation is blocked outside the location radius.
6. Whether poor GPS accuracy allows Admin override.
7. Whether partial-payment invoices may be issued.
8. Whether Staff can record expenses.
9. Whether tax applies before or after discounts.
10. Rounding method.
11. Data-retention duration for photos and GPS.
12. Export format requirements.
13. Initial language and future localization.
14. Whether PWA installation is required.
15. Whether multi-branch fields should be included from the beginning.

---

## 85. Future Architecture Extensions

The architecture should allow:

- `business_id` or `branch_id` isolation
- customer online booking
- slot management
- customer portal
- online payment gateway
- WhatsApp Business API
- inventory
- subscriptions
- loyalty points
- staff attendance
- payroll
- automated reminders
- feedback and Google review integration
- before-and-after photos
- automatic number-plate recognition
- native mobile application

---

## 86. Final Technical Summary

WashPro should be implemented as a secure, mobile-first React and TypeScript web application backed by a serverless TypeScript API.

The reference production architecture uses:

- Cloudflare Pages for the frontend
- Cloudflare Workers for the API
- Cloudflare D1 for relational data
- Cloudflare R2 for private files
- Cloudflare KV for rate limits and selected cached state
- Optional Queues for heavy retryable tasks

The backend must remain authoritative for:

- authentication
- permissions
- service pricing
- billing
- coupon eligibility
- referral eligibility
- timer timestamps
- payment totals
- invoice numbering
- financial reporting

The system must use transactions, unique constraints, optimistic concurrency, immutable snapshots, and idempotency keys to prevent duplicate or inconsistent records.

The frontend must provide a simple Staff workflow while the Admin area provides complete business, financial, and audit visibility.

This specification should guide the implementation of `schema.md`, `api.md`, `security.md`, `deployment.md`, source-code modules, automated tests, and production release procedures.
