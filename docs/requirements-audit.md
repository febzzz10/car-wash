# WashPro Initial Requirements Audit

This audit records the repository state before implementation. The repository contained only `plan.md`, `prd.md`, `appflow.md`, `techspec.md`, `database.md`, and `design.md`; there was no source code, configuration, migration, test, deployment file, or Git metadata. Consequently, every executable requirement began as **Missing**.

| Requirement area | Governing source | Initial status | Evidence and resolution |
| --- | --- | --- | --- |
| Authentication, secure sessions, logout, expiry, disabled/locked accounts, password change/reset, login attempts | `prd.md` AUTH-001 to AUTH-005 | Missing | No application files existed. |
| Backend permissions, Admin/Staff routes, Staff configuration and activity | `prd.md` STAFF-001 to STAFF-005 and permissions matrix | Missing | Permission model will be centralized and enforced in API application modules. |
| Customer records, normalization, duplicate prevention, search, profile, deactivation, histories | `prd.md` CUST-001 to CUST-006 | Missing | Strict normalized phone uniqueness selected because no duplicate override was approved. |
| Vehicles, multiple ownership, normalization, uniqueness, search, service history, deactivation | `prd.md` VEH-001 to VEH-006 | Missing | Ownership changes require Admin permission and an audit record; job snapshots preserve history. |
| Services, add-ons, vehicle pricing, tax, duration, ordering, deactivation, price history | `prd.md` SERV-001 to SERV-006 | Missing | Prices will use effective-dated rows and immutable job/invoice snapshots. |
| New Wash wizard and state preservation | `prd.md` JOB-001 to JOB-006; `appflow.md` sections 13-24 | Missing | Seven UI stages preserve the full documented 12-action sequence; photo and GPS share one stage. |
| Live camera, preview/retake, compression, private upload, no gallery substitute | `prd.md` PHOTO-001 to PHOTO-004 | Missing | Mandatory photo has no gallery path. Browser capture cannot be forensic proof beyond documented controls. |
| GPS, accuracy, distance, radius, retry, snapshots, audited override | `prd.md` GPS-001 to GPS-006 | Missing | Only an authorized Admin may override poor/outside GPS with a reason; camera remains mandatory. |
| Draft/Waiting/In Progress/Paused/Completed/Cancelled and timer rules | `prd.md` TIMER-001 to TIMER-006 and status section | Missing | `Draft` included because PRD/app flow/database outrank the tech-spec status omission. |
| Billing order, minor units, caps, manual discount, tax, rounding, server trust | `prd.md` BILL-001 to BILL-007 | Missing | Tax is calculated after coupon, referral, reward, and manual discounts according to PRD order. |
| Coupons, reservation/release, eligibility, counters, history | `prd.md` COUPON-001 to COUPON-006 | Missing | Validation and reservation occur with job creation atomically. |
| Referrals, rewards, ledger, reservation/release/redemption, eligibility | `prd.md` REF-001 to REF-008 | Missing | Rewards become available only after completed, fully paid referred jobs; reward use finalizes only after eligible payment. |
| Multiple payments, balances, full/partial/pending/refunded/cancelled, idempotency | `prd.md` PAY-001 to PAY-008 | Missing | Revenue is successful payments minus successful refunds. |
| Immutable invoices, PDF, revisions, histories, retry safety, protected links | `prd.md` INV-001 to INV-007 | Missing | A completed job may have an invoice showing its current payment status; corrections create revisions. |
| WhatsApp message, secure invoice link, copy and PDF fallbacks | `prd.md` WA-001 to WA-003 | Missing | Standard `wa.me` will never claim PDF attachment. |
| Expenses, categories, filters, receipts, cancellation, audit, exports | `prd.md` EXP-001 to EXP-006 | Missing | Active, non-cancelled expenses are the authoritative expense total. |
| Dashboard, reports, metrics, consistent accounting, CSV/PDF export | `prd.md` DASH-001 to DASH-004 and REP-001 to REP-004 | Missing | Dashboard and reports share one accounting query layer and timezone boundary utility. |
| Business, invoice, tax, location, financial, regional, retention settings | `prd.md` SET-001 to SET-006 | Missing | Typed settings are authoritative in D1; secrets use Worker secrets. |
| Append-only audit logging and redaction | `prd.md` AUDIT-001 to AUDIT-003 | Missing | Audit write interfaces redact password, token, secret, and binary fields. |
| D1 schema, constraints, indexes, snapshots, locking, idempotency, transactions | `database.md` | Missing | Nine versioned migrations implement the documented dependency order and integrity guards. |
| Private R2 files and metadata-only relational records | `database.md`, `techspec.md` | Missing | D1 never stores photo or PDF bodies. |
| Cloudflare Pages/Workers/D1/R2/KV architecture | `techspec.md` | Missing | No approved equivalent existed, so the reference architecture is selected. |
| Responsive UI, role navigation, tokens, status, accessibility and recovery states | `design.md` | Missing | Custom WashPro design tokens govern the product UI; 44px targets and keyboard/focus semantics are required. |
| Security, privacy, tenant/branch isolation, safe errors and logging | `prd.md` security section and `techspec.md` section 56 | Missing | Every repository query and file lookup is scoped; mutation middleware handles session, origin/CSRF, validation, and permission. |
| Unit, integration, E2E, security, device/browser and deployment verification | `prd.md`, `techspec.md`, user execution rules | Missing | No test framework or executable application existed. |

## Documentation Conflicts Resolved

| Conflict | Selected resolution | Priority rationale |
| --- | --- | --- |
| `techspec.md` wash-job list omitted `DRAFT`; PRD/app flow/database include it. | Include `DRAFT` with only `WAITING` and `CANCELLED` outgoing transitions. | PRD and app flow outrank tech spec. |
| App flow describes an authorized duplicate-customer reason, while database recommends strict phone uniqueness and PRD permits override only if approved. | Enforce strict normalized phone uniqueness with no override. | No approved design enables an override; this best satisfies accidental duplicate prevention. |
| Plan describes coupon or referral as a combined discount stage, while PRD gives coupon, referral, reward, and manual discounts a precise order. | Implement all four in the PRD order, then tax, then rounding. | PRD controls final business behaviour. |
| Tech spec leaves tax timing open. | Apply tax after all discounts. | PRD explicitly orders tax after discounts. |
| App flow makes partial-payment invoice issuance configurable; invoice requirements require payment status to be shown. | Allow invoices after job completion at any payment status and snapshot that status. | This preserves complete invoice/history behaviour and supports the documented partial-payment journey. |
| Photo requirements mention an authorized override where policy allows, while the delivery request calls live capture mandatory. | Do not allow gallery substitution or an ordinary camera bypass; allow audited Admin override only for GPS verification. | The direct user requirement is stricter and controls implementation. |
| Plan language could imply revenue from paid jobs; PRD/database define transaction accounting. | Revenue equals successful payments minus successful refunds; unpaid totals are not revenue. | PRD business rule BR-018 and database reporting rules are authoritative. |
