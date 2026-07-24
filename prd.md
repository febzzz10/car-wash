# WashPro — Product Requirements Document

**Project Name:** WashPro  
**Document Type:** `prd.md`  
**Version:** 1.0  
**Status:** Proposed  
**Prepared For:** Car Wash Business Client  
**Application Type:** Responsive Web Application  
**Primary Users:** Admin and Staff  
**Primary Devices:** Mobile phones, tablets, laptops, and desktop computers  

---

# 1. Document Purpose

This Product Requirements Document defines what WashPro must deliver as a product.

It describes:

- Product vision
- Business problem
- Target users
- Product goals
- Functional requirements
- User journeys
- Business rules
- Role permissions
- Data requirements
- Non-functional requirements
- Security and privacy expectations
- Reporting requirements
- Success metrics
- Acceptance criteria
- Release scope
- Future enhancements
- Product risks and dependencies

This document should be used as the primary product reference for:

- Client approval
- UX and UI design
- Technical planning
- Database design
- API design
- Development
- Quality assurance
- Deployment
- Training
- Final handover

---

# 2. Product Overview

WashPro is a complete Car Wash Management Web Application designed to digitize daily car wash operations from customer registration to final invoice delivery.

The application enables Staff users to:

- Register customers
- Add and manage vehicles
- Capture live vehicle photos
- Capture GPS location and timestamp
- Create wash jobs
- Select services and add-ons
- Apply coupons and referral benefits
- Start, pause, resume, and end wash timers
- Record payments
- Generate professional invoices
- Download, print, and share invoices
- Maintain customer and vehicle service history

The application enables Admin users to:

- Manage Staff accounts
- Manage services and vehicle-specific pricing
- Manage coupons and referral programmes
- Monitor active wash jobs
- Record and manage expenses
- View revenue, expenses, and net profit
- Access business reports
- Configure invoice, tax, location, and business settings
- Review audit logs
- View customer and vehicle history
- Control sensitive financial and operational actions

The product must remain easy enough for Staff to use at the wash bay while giving the business owner complete operational and financial visibility.

---

# 3. Product Vision

The vision of WashPro is to become the central digital operating system for a car wash business.

The product should replace fragmented manual processes such as:

- Paper customer registers
- Handwritten vehicle details
- Manual service tracking
- Informal Staff communication
- Manual timer tracking
- Calculator-based billing
- Paper invoices
- Untracked discounts
- Unstructured expense records
- Incomplete customer history
- Unverified vehicle presence
- Unclear revenue and profit calculations

WashPro should help the business operate faster, reduce errors, improve accountability, and create a more professional customer experience.

---

# 4. Problem Statement

Car wash businesses commonly face the following problems:

1. Customer and vehicle records are stored manually or inconsistently.
2. The business cannot easily view a customer’s previous visits.
3. Staff may forget or incorrectly record wash start and completion times.
4. There is no reliable proof that the vehicle was physically present at the business location.
5. Service pricing may vary between Staff members.
6. Discounts may be applied incorrectly or without approval.
7. Coupon and referral programmes are difficult to track manually.
8. Payments and pending balances may be forgotten.
9. Invoices take time to prepare and may contain errors.
10. Expenses are often recorded separately from revenue.
11. The owner lacks a clear view of daily revenue, expenses, and profit.
12. Staff activity and sensitive changes are not auditable.
13. Customer retention opportunities are missed.
14. Historical data becomes difficult to search.
15. Manual paperwork creates unnecessary delays at the wash bay.

WashPro is intended to solve these problems through one secure, responsive application.

---

# 5. Product Goals

## 5.1 Primary Goals

1. Digitize customer, vehicle, wash, payment, invoice, and expense records.
2. Reduce manual paperwork.
3. Reduce billing and pricing errors.
4. Track the actual active duration of each wash.
5. Verify vehicle presence using a live photo, GPS location, and timestamp.
6. Provide a clear and fast operational flow for Staff.
7. Provide complete financial visibility for the Admin.
8. Generate professional invoices automatically.
9. Improve customer retention through coupons and referrals.
10. Maintain complete customer and vehicle histories.
11. Protect sensitive financial and customer information.
12. Support mobile, tablet, laptop, and desktop use.
13. Make critical actions auditable.
14. Support future business expansion.

---

## 5.2 Secondary Goals

- Improve Staff accountability.
- Reduce duplicate customer records.
- Reduce duplicate vehicle records.
- Improve payment follow-up.
- Make reports easy to export.
- Make invoices easy to re-share.
- Improve customer trust.
- Make business operations easier to monitor remotely.
- Provide a foundation for future booking, loyalty, inventory, and multi-branch features.

---

# 6. Non-Goals for Initial Release

The following features are not required for the first production release unless separately approved:

- Customer self-service booking
- Public customer login
- Online payment gateway
- Automatic WhatsApp Business API messaging
- Inventory and chemical stock management
- Employee attendance
- Payroll
- Loyalty points
- Membership plans
- Subscription packages
- Multi-branch operation
- Automatic number-plate recognition
- Before-and-after image comparison
- Native Android or iOS application
- Automated insurance renewal reminders
- Automated birthday offers
- Google review automation
- Customer feedback system
- AI-based damage detection
- Vehicle pickup and delivery tracking

These may be considered later.

---

# 7. Target Users

## 7.1 Admin

The Admin is the business owner or authorized manager.

### Primary Needs

- Monitor the business
- Manage Staff
- Control pricing
- Control discounts
- Track payments
- Track expenses
- View revenue and profit
- Review active jobs
- Access reports
- Configure business settings
- Correct exceptional errors
- Review audit history

### Admin Characteristics

- Uses mobile and desktop
- Needs high-level summaries
- Requires access to financial data
- Needs control over sensitive actions
- May not be technically experienced
- Needs clear and reliable reporting

---

## 7.2 Staff

Staff members handle daily customer and wash-bay operations.

### Primary Needs

- Register customers quickly
- Find existing customers
- Add vehicles
- Start new wash jobs
- Capture photo and GPS
- Select services
- Apply valid discounts
- Control wash timer
- Record payment
- Generate and share invoice

### Staff Characteristics

- Primarily uses mobile or tablet
- Often operates in a busy environment
- Needs large touch-friendly controls
- Needs minimal steps
- Needs simple error messages
- Must not access sensitive financial information

---

# 8. User Personas

## 8.1 Persona A — Business Owner

**Name:** Owner Admin  
**Goal:** Understand daily business performance and control operations.  
**Main Concerns:**

- Revenue leakage
- Unauthorized discounts
- Missing payments
- Untracked expenses
- Staff accountability
- Incorrect reports
- Data loss
- Customer complaints

---

## 8.2 Persona B — Wash-Bay Staff

**Name:** Service Staff  
**Goal:** Complete customer registration, wash tracking, payment, and invoice delivery quickly.  
**Main Concerns:**

- Slow forms
- Complex navigation
- Camera or GPS failures
- Forgetting timer actions
- Incorrect pricing
- Re-entering customer data
- Payment errors
- Poor mobile usability

---

# 9. Product Principles

WashPro should follow these principles:

## 9.1 Mobile First

Staff operations must work smoothly on phones.

## 9.2 Minimal Operational Steps

The main wash flow should be short and clear.

## 9.3 Server-Side Trust

Financial calculations, permissions, timer timestamps, discount validation, and invoice numbers must be validated on the server.

## 9.4 Historical Accuracy

Completed jobs and invoices must preserve their original values.

## 9.5 Clear Accountability

Sensitive changes must be linked to a user and recorded.

## 9.6 Safe Failure

Network, camera, GPS, upload, or invoice failures must not create duplicate or incomplete business records.

## 9.7 Role-Based Simplicity

Users should see only the features required for their role.

## 9.8 Professional Output

Invoices and reports must look suitable for real business use.

---

# 10. Product Scope

The initial product includes the following modules:

1. Authentication
2. Role and permission management
3. Staff management
4. Customer management
5. Vehicle management
6. Live photo capture
7. GPS capture and location verification
8. Service management
9. Vehicle-specific pricing
10. Wash job creation
11. Wash timer
12. Wash status management
13. Billing engine
14. Coupon management
15. Referral management
16. Payment management
17. Invoice generation
18. WhatsApp sharing
19. Customer history
20. Vehicle history
21. Expense management
22. Admin dashboard
23. Reports and exports
24. Business settings
25. Audit logs
26. File storage
27. Security and privacy
28. Backup and recovery support

---

# 11. Core User Journey

The primary Staff journey is:

```text
Login
  ↓
Search or Add Customer
  ↓
Select or Add Vehicle
  ↓
Capture Live Vehicle Photo
  ↓
Capture GPS Location
  ↓
Select Service and Add-ons
  ↓
Apply Coupon or Referral Benefit
  ↓
Review Price
  ↓
Create Wash Job
  ↓
Start Timer
  ↓
Pause or Resume if Needed
  ↓
End Wash
  ↓
Record Payment
  ↓
Generate Invoice
  ↓
Download, Print, or Share
  ↓
Update Customer and Vehicle History
```

---

# 12. Functional Requirements

# 12.1 Authentication

## Requirement AUTH-001 — Login

The system must allow Admin and Staff users to log in using:

- Username
- Email address
- Phone number

and a password.

### Acceptance Criteria

- Valid credentials create a secure authenticated session.
- Invalid credentials show a clear error.
- The password is masked by default.
- The user can show or hide the password.
- Login attempts are recorded.
- Disabled accounts cannot log in.
- Locked accounts cannot log in until unlocked or the lock expires.

---

## Requirement AUTH-002 — Role-Based Redirection

After login:

- Admin must be redirected to the Admin Dashboard.
- Staff must be redirected to Staff Home.

---

## Requirement AUTH-003 — Logout

Users must be able to log out.

### Acceptance Criteria

- Current session is invalidated.
- User returns to Login.
- Protected pages cannot be reopened without login.

---

## Requirement AUTH-004 — Session Expiry

The system should support configurable session timeout.

### Acceptance Criteria

- Expired sessions are rejected.
- User is asked to log in again.
- Sensitive operations cannot continue after expiry.

---

## Requirement AUTH-005 — Password Change

The system should support:

- Admin password reset for Staff
- Optional forced password change after first login
- User-initiated password change

---

# 12.2 Staff Management

## Requirement STAFF-001 — Create Staff Account

Admin must be able to create Staff accounts.

### Required Fields

- Full name
- Username
- Phone
- Email
- Role
- Account status
- Temporary password
- Optional profile photo

---

## Requirement STAFF-002 — Edit Staff Account

Admin must be able to update Staff profile details and permissions.

---

## Requirement STAFF-003 — Disable Staff

Admin must be able to disable a Staff account.

### Rules

- Disabled Staff cannot log in.
- Existing history remains.
- Sensitive action is audited.
- Active sessions should be revoked where supported.

---

## Requirement STAFF-004 — Reset Password

Admin must be able to reset Staff passwords.

---

## Requirement STAFF-005 — Staff Activity

Admin must be able to review Staff activity including:

- Login activity
- Jobs created
- Timer actions
- Payments received
- Discounts applied
- Invoices generated
- Sensitive actions

---

# 12.3 Customer Management

## Requirement CUST-001 — Add Customer

Staff and Admin must be able to add a customer.

### Fields

- Full name
- Phone
- Email, optional
- Address, optional
- Notes, optional
- Status
- Registration date
- Referral code

---

## Requirement CUST-002 — Customer Duplicate Prevention

Phone number must be used as the primary duplicate-detection field.

### Acceptance Criteria

- Phone number is normalized.
- Existing match triggers a warning.
- Default action is to open the existing customer.
- Duplicate creation is blocked unless the approved design permits Admin override.

---

## Requirement CUST-003 — Search Customer

Users must be able to search by:

- Name
- Phone number
- Customer ID
- Referral code, optional

Search should return results quickly.

---

## Requirement CUST-004 — Customer Profile

The profile must show:

- Customer details
- Vehicles
- Total visits
- Total amount spent
- Last visit
- Wash history
- Invoice history
- Payment history
- Coupon history
- Referral summary
- Photo and GPS history
- Notes

---

## Requirement CUST-005 — Edit Customer

Authorized users must be able to edit customer information.

Historical jobs and invoices must preserve stored snapshots.

---

## Requirement CUST-006 — Deactivate Customer

Authorized users must be able to deactivate a customer.

### Rules

- Customer history remains.
- New jobs are blocked until reactivation.
- Deactivation reason may be required.
- Action is audited.

---

# 12.4 Vehicle Management

## Requirement VEH-001 — Add Vehicle

A customer may own multiple vehicles.

### Fields

- Registration number
- Vehicle type
- Make
- Model
- Manufacturing year
- Colour
- Fuel type, optional
- Front image, optional
- Rear image, optional
- Notes
- Status

---

## Requirement VEH-002 — Registration Normalization

Registration number must be:

- Converted to uppercase
- Trimmed
- Normalized for extra spaces
- Stored in a consistent format

---

## Requirement VEH-003 — Duplicate Vehicle Prevention

The same normalized registration number must not be registered twice.

---

## Requirement VEH-004 — Vehicle Search

Search must support:

- Registration number
- Customer name
- Customer phone
- Make
- Model

---

## Requirement VEH-005 — Vehicle History

The vehicle profile must show:

- Wash dates
- Services
- Duration
- Live photos
- GPS location
- Invoice history
- Payment status
- Staff member
- Notes

---

## Requirement VEH-006 — Vehicle Deactivation

Inactive vehicles cannot be used for new jobs.

Historical records remain available.

---

# 12.5 Live Vehicle Photo

## Requirement PHOTO-001 — Mandatory Live Capture

Staff must capture a live photo during wash-job creation when the requirement is enabled.

### Acceptance Criteria

- Camera opens from the application.
- User captures a live image.
- Image preview is shown.
- User can accept or retake.
- Mandatory capture cannot be replaced by an old gallery image.
- Capture is linked to customer, vehicle, Staff, timestamp, and job.

---

## Requirement PHOTO-002 — Permission Handling

When camera permission is denied:

- Explain why permission is required.
- Show retry action.
- Show browser or device permission instructions.
- Block job progression unless an authorized override exists.

---

## Requirement PHOTO-003 — Image Validation

The system must validate:

- Supported file type
- Maximum file size
- Image dimensions
- Upload completion
- Correct job association

---

## Requirement PHOTO-004 — Photo Security

Vehicle photos must be private.

Only authorized users may view them.

---

# 12.6 GPS and Location Verification

## Requirement GPS-001 — GPS Capture

The system must capture:

- Latitude
- Longitude
- Accuracy
- Date and time
- Staff member
- Job
- Vehicle
- Branch

---

## Requirement GPS-002 — Business Location Comparison

The system must compare captured coordinates with the configured business location.

### Possible Results

- At Business Location
- Outside Business Location
- Poor Accuracy
- Could Not Verify
- Overridden

---

## Requirement GPS-003 — Configurable Radius

Admin must be able to configure the allowed radius.

Example:

```text
100 metres
```

---

## Requirement GPS-004 — Configurable Accuracy

Admin must be able to configure minimum acceptable GPS accuracy.

---

## Requirement GPS-005 — GPS Failure

When GPS capture fails:

- Show the failure reason.
- Allow retry.
- Do not silently continue.
- Record failure details where appropriate.
- Require authorized override if the policy allows continuation.

---

## Requirement GPS-006 — Snapshot Settings

The coordinates, radius, and accuracy rules used for a job must be stored as historical snapshots.

Future setting changes must not alter old verification results.

---

# 12.7 Service Management

## Requirement SERV-001 — Add Service

Admin must be able to create:

- Primary wash services
- Optional add-ons

### Fields

- Name
- Description
- Category
- Base price
- Estimated duration
- Tax applicability
- Display order
- Active status

---

## Requirement SERV-002 — Vehicle-Specific Pricing

Admin must be able to assign different prices for each vehicle type.

---

## Requirement SERV-003 — Edit Service

Admin must be able to update service details.

---

## Requirement SERV-004 — Disable Service

Disabled services:

- Must not appear for new jobs.
- Must remain visible in historical jobs and invoices.

---

## Requirement SERV-005 — Price Snapshot

The selected service price must be stored in the wash job.

Future price changes must not modify completed or existing jobs.

---

## Requirement SERV-006 — Service Usage

Admin should be able to view service usage statistics.

---

# 12.8 Wash Job Creation

## Requirement JOB-001 — Create Wash Job

A wash job represents one service visit for one vehicle.

The Staff user must:

1. Select or add customer.
2. Select or add vehicle.
3. Capture required live photo.
4. Capture GPS.
5. Select service.
6. Select optional add-ons.
7. Apply discount when eligible.
8. Review calculated amount.
9. Assign Staff.
10. Create job.

---

## Requirement JOB-002 — Job Reference

Each wash job must receive a unique reference.

Example:

```text
WJ-2026-000001
```

---

## Requirement JOB-003 — Initial Status

A new job may start as:

- Waiting
- In Progress, if started immediately

---

## Requirement JOB-004 — Job Validation

Before job creation, the server must revalidate:

- Customer
- Vehicle
- Ownership
- Vehicle status
- Service availability
- Service prices
- Photo
- GPS
- Coupon
- Referral
- Tax
- Final amount
- Staff assignment

---

## Requirement JOB-005 — Job Snapshot

The job must preserve:

- Customer name and phone
- Vehicle registration
- Vehicle type
- Make and model
- Service names
- Service prices
- Tax rate
- Discount details

---

## Requirement JOB-006 — Active Jobs List

Users must be able to view:

- Waiting jobs
- In-progress jobs
- Paused jobs

The screen should show:

- Job reference
- Vehicle number
- Customer
- Service
- Staff
- Status
- Timer
- Payment status
- Main action

---

# 12.9 Wash Timer

## Requirement TIMER-001 — Start Timer

Starting a Waiting job must:

- Store server timestamp
- Create Start event
- Change status to In Progress

---

## Requirement TIMER-002 — Pause Timer

Pausing must:

- Store server timestamp
- Create Pause event
- Change status to Paused
- Stop active-duration accumulation

---

## Requirement TIMER-003 — Resume Timer

Resuming must:

- Store server timestamp
- Create Resume event
- Change status to In Progress

---

## Requirement TIMER-004 — End Timer

Ending must:

- Store server timestamp
- Create End event
- Calculate active duration
- Calculate paused duration
- Change status to Completed
- Lock normal editing

---

## Requirement TIMER-005 — Timer Persistence

Refreshing, closing, or reopening the page must not reset the timer.

The timer must be reconstructed from server timestamps.

---

## Requirement TIMER-006 — Timer Correction

Only Admin may correct timer values.

### Rules

- Original events remain.
- Correction requires reason.
- Correction is audited.
- Corrected duration is clearly identifiable.

---

# 12.10 Job Status Management

## Allowed Statuses

- Draft
- Waiting
- In Progress
- Paused
- Completed
- Cancelled

## Allowed Transitions

```text
Draft → Waiting
Draft → Cancelled
Waiting → In Progress
Waiting → Cancelled
In Progress → Paused
In Progress → Completed
In Progress → Cancelled
Paused → In Progress
Paused → Completed
Paused → Cancelled
```

Completed and Cancelled are final states in normal operations.

---

## Requirement STATUS-001 — Cancellation

Cancellation must require:

- Confirmation
- Cancellation reason
- User identity
- Timestamp

Reserved coupons or rewards must be released when applicable.

---

## Requirement STATUS-002 — Completed Job Lock

Completed jobs must be protected from ordinary edits.

Financial and time corrections require an auditable adjustment flow.

---

# 12.11 Billing Engine

## Requirement BILL-001 — Calculation Order

The billing engine must calculate:

1. Primary service
2. Add-ons
3. Subtotal
4. Coupon discount
5. Referral discount
6. Reward discount
7. Manual discount
8. Tax
9. Rounding
10. Final payable amount

---

## Requirement BILL-002 — Integer Money

Financial calculations must avoid floating-point errors.

Amounts must be stored using minor currency units.

---

## Requirement BILL-003 — Vehicle-Specific Price

The selected vehicle type determines the service price.

---

## Requirement BILL-004 — Discount Limit

Discounts must not exceed the eligible bill amount.

Final amount must never become negative.

---

## Requirement BILL-005 — Manual Discount

Manual discounts require:

- Admin permission or approved Staff permission
- Reason
- Audit record

---

## Requirement BILL-006 — Tax

Tax calculation must use configured settings.

The applied rate must be stored as a snapshot.

---

## Requirement BILL-007 — Server Validation

The server must recalculate the final amount before saving.

Frontend totals are display-only.

---

# 12.12 Coupon Management

## Requirement COUPON-001 — Create Coupon

Admin must be able to configure:

- Code
- Description
- Discount type
- Discount value
- Minimum bill
- Maximum discount
- Start date
- Expiry date
- Total usage limit
- Per-customer usage limit
- Eligible services
- Eligible vehicle types
- New-customer-only restriction
- Active status

---

## Requirement COUPON-002 — Coupon Types

Supported types:

- Fixed amount
- Percentage

---

## Requirement COUPON-003 — Coupon Validation

The system must verify:

- Code exists
- Active
- Within date range
- Minimum bill reached
- Total usage available
- Customer usage available
- Eligible service
- Eligible vehicle
- Customer eligibility

---

## Requirement COUPON-004 — Coupon Reservation

A coupon may be reserved during job creation.

If the job is cancelled before completion, the reservation must be released.

---

## Requirement COUPON-005 — Coupon Usage History

Admin must be able to view:

- Customer
- Job
- Date
- Original amount
- Discount amount
- Status

---

## Requirement COUPON-006 — Historical Accuracy

Coupon edits must not alter previous redemptions.

---

# 12.13 Referral Management

## Requirement REF-001 — Referral Code

Each eligible customer should receive a unique referral code.

The code should appear in:

- Customer profile
- Invoice
- WhatsApp message

---

## Requirement REF-002 — Friend Discount

When a valid referral code is entered, the referred customer may receive the configured discount.

---

## Requirement REF-003 — Referrer Reward

The referring customer receives the reward only after:

- Referred wash is completed
- Referred wash is fully paid
- Referral remains valid
- Reward has not already been issued

---

## Requirement REF-004 — Self-Referral Prevention

The system must reject self-referrals.

---

## Requirement REF-005 — Duplicate Prevention

The system must prevent:

- Multiple first-time referral discounts
- Duplicate rewards
- Reuse of single-use benefits
- Negative reward balance

---

## Requirement REF-006 — Reward Statuses

Supported statuses:

- Pending
- Available
- Reserved
- Used
- Expired
- Cancelled

---

## Requirement REF-007 — Reward Redemption

A customer may use available rewards on a future eligible wash.

If the job is cancelled, the reserved reward should be released.

---

## Requirement REF-008 — Referral Configuration

Admin must control:

- Programme enabled
- Friend discount
- Referrer reward
- Fixed or percentage
- Minimum bill
- Maximum discount
- Code expiry
- Reward expiry
- Eligible services
- Eligible vehicle types
- New-customer-only rule
- Maximum successful referrals
- Coupon stacking
- Reward redemption rules

---

# 12.14 Payment Management

## Requirement PAY-001 — Payment Methods

Supported methods:

- Cash
- UPI
- Card
- Bank transfer
- Other

---

## Requirement PAY-002 — Payment Statuses

Supported job-level statuses:

- Pending
- Partially Paid
- Paid
- Refunded
- Cancelled

---

## Requirement PAY-003 — Record Payment

Payment record must include:

- Job
- Amount
- Method
- Status
- Transaction reference
- Date and time
- Received by
- Notes

---

## Requirement PAY-004 — Partial Payment

The system must support partial payments.

### Acceptance Criteria

- Amount paid is recorded.
- Remaining balance is shown.
- Payment status becomes Partially Paid.
- Job appears in Pending Payments.
- Referral reward remains pending.

---

## Requirement PAY-005 — Full Payment

When total valid payment reaches final amount:

- Status becomes Paid.
- Balance becomes zero.
- Referral reward may be finalized.
- Invoice shows paid status.

---

## Requirement PAY-006 — Pending Payment

A completed wash may remain unpaid when business rules permit.

It must appear in Pending Payments.

---

## Requirement PAY-007 — Refund

Only Admin may record refunds.

### Rules

- Refund cannot exceed refundable amount.
- Reason required.
- Original payment remains.
- Revenue updates.
- Referral impact is handled.
- Action is audited.

---

## Requirement PAY-008 — Duplicate Prevention

Repeated network requests must not create duplicate payments.

---

# 12.15 Invoice Management

## Requirement INV-001 — Generate Invoice

The application must generate a professional invoice after job completion.

---

## Requirement INV-002 — Invoice Number

Each invoice must have a unique configurable number.

Example:

```text
WP-2026-000001
```

---

## Requirement INV-003 — Invoice Content

Invoice must include:

- Business name
- Logo
- Address
- Phone
- WhatsApp number
- Email
- Tax or GST details
- Invoice date
- Customer name
- Customer phone
- Vehicle number
- Vehicle type
- Make and model
- Services
- Add-ons
- Start time
- Completion time
- Active duration
- Subtotal
- Discount
- Tax
- Total
- Payment method
- Payment status
- Staff member
- Referral code
- Thank-you message
- Terms and footer

---

## Requirement INV-004 — Invoice Actions

Users must be able to:

- View
- Download PDF
- Print
- Re-share
- Open from customer history
- Open from vehicle history
- Open from job history

---

## Requirement INV-005 — Invoice Immutability

Issued invoice values must not be edited in place.

Corrections must create a revision or adjustment.

---

## Requirement INV-006 — Retry Safety

Invoice-generation retry must not create duplicate invoice numbers.

---

## Requirement INV-007 — Protected Invoice Link

Invoice view or download links should be protected by:

- Secure random token
- Expiry when configured
- Non-public storage
- Access validation

---

# 12.16 WhatsApp Sharing

## Requirement WA-001 — Pre-Filled Message

The system must generate a WhatsApp message containing:

- Customer name
- Vehicle number
- Service
- Amount
- Payment status
- Invoice number
- Referral code
- Invoice link

---

## Requirement WA-002 — Standard Sharing Limitation

The initial release should use:

- Pre-filled text
- Invoice link
- Manual PDF attachment

It must not claim that a normal `wa.me` link automatically attaches a generated PDF.

---

## Requirement WA-003 — Fallback

When WhatsApp cannot open, provide:

- Copy message
- Copy invoice link
- Download PDF

---

# 12.17 Customer and Vehicle History

## Requirement HIST-001 — Customer History

Customer history must include:

- Vehicles
- Washes
- Services
- Durations
- Discounts
- Coupons
- Referrals
- Payments
- Invoices
- Photos
- GPS data
- Staff
- Total visits
- Total spend

---

## Requirement HIST-002 — Vehicle History

Vehicle history must include:

- Wash dates
- Services
- Duration
- Photos
- GPS
- Invoice
- Staff
- Notes
- Payment status

---

## Requirement HIST-003 — Historical Snapshots

History must remain accurate after profile or pricing updates.

---

# 12.18 Expense Management

## Requirement EXP-001 — Add Expense

Admin must be able to add an expense.

### Fields

- Title
- Category
- Amount
- Date
- Payment method
- Description
- Receipt, optional
- Recorded by

---

## Requirement EXP-002 — Expense Categories

Default categories include:

- Cleaning chemicals
- Water
- Electricity
- Staff wages
- Equipment purchases
- Equipment maintenance
- Rent
- Marketing
- Transportation
- Other

---

## Requirement EXP-003 — Edit Expense

Authorized Admin may edit an expense.

Significant financial changes require a reason and audit log.

---

## Requirement EXP-004 — Cancel Expense

Expenses should normally be cancelled rather than permanently deleted.

Cancelled expenses must be excluded from current totals.

---

## Requirement EXP-005 — Expense Filters

Admin must be able to filter by:

- Date range
- Category
- Payment method
- Recorded by

---

## Requirement EXP-006 — Expense Export

Expense reports must be exportable.

---

# 12.19 Admin Dashboard

## Requirement DASH-001 — Summary Cards

Dashboard must show:

- Today’s revenue
- Today’s expenses
- Today’s net profit
- Cars washed today
- Waiting vehicles
- Jobs in progress
- Paused jobs
- Completed jobs
- Pending payments
- Available referral rewards

---

## Requirement DASH-002 — Charts

Dashboard should include:

- Revenue by service
- Revenue by vehicle type
- Daily revenue trend
- Monthly revenue trend
- Expense breakdown
- Profit trend
- Coupon usage
- Referral performance
- Staff job count
- Average wash duration

---

## Requirement DASH-003 — Date Filter

Dashboard must support:

- Today
- Week
- Month
- Custom range

All cards and charts must update consistently.

---

## Requirement DASH-004 — Recent Activity

Show:

- Recent jobs
- Recent payments
- Recent expenses
- New customers
- Coupon redemptions
- Referral rewards
- Cancelled jobs
- Staff login activity

---

# 12.20 Reports

## Requirement REP-001 — Available Reports

Admin must be able to generate:

- Daily revenue
- Weekly revenue
- Monthly revenue
- Custom revenue
- Expenses
- Net profit
- Wash count
- Service popularity
- Vehicle-type distribution
- Customer visit frequency
- Coupon usage
- Referral usage
- Staff performance
- Pending payments
- Completed jobs
- Cancelled jobs
- Average wash duration

---

## Requirement REP-002 — Filters

Reports should support relevant filters such as:

- Date range
- Branch
- Service
- Vehicle type
- Staff
- Payment method
- Payment status
- Coupon
- Referral status

---

## Requirement REP-003 — Export

Reports must support:

- PDF
- Excel or CSV

The export must match selected filters.

---

## Requirement REP-004 — Financial Consistency

Dashboard and reports must use the same accounting rules.

---

# 12.21 Business Settings

## Requirement SET-001 — Business Profile

Admin must configure:

- Business name
- Logo
- Address
- Phone
- WhatsApp
- Email
- Tax or GST number
- Working hours

---

## Requirement SET-002 — Invoice Settings

Admin must configure:

- Invoice prefix
- Footer
- Thank-you message
- Terms
- Logo
- Tax visibility
- Referral message

---

## Requirement SET-003 — Location Settings

Admin must configure:

- Business latitude
- Business longitude
- Allowed radius
- Minimum GPS accuracy

---

## Requirement SET-004 — Financial Settings

Admin must configure:

- Currency
- Tax enabled
- Tax rate
- Rounding
- Default payment method
- Coupon stacking
- Referral stacking

---

## Requirement SET-005 — Regional Settings

Admin must configure:

- Timezone
- Date format
- Number format

---

## Requirement SET-006 — Data Retention

Admin should be able to define retention periods for:

- Photos
- GPS records
- Temporary files
- Login attempts

Subject to legal and business rules.

---

# 12.22 Audit Logs

## Requirement AUDIT-001 — Audited Actions

The system must audit:

- Login failures
- Staff creation
- Staff disablement
- Password resets
- Customer deactivation
- Vehicle ownership changes
- Service price changes
- Coupon changes
- Referral adjustments
- Expense changes
- Refunds
- Invoice revisions
- Timer corrections
- Manual discounts
- Location overrides
- Business setting changes
- Data exports

---

## Requirement AUDIT-002 — Audit Fields

Each log must include:

- User
- Action
- Record type
- Record ID
- Previous value
- New value
- Reason
- Date and time
- IP or device information
- Severity

---

## Requirement AUDIT-003 — Audit Immutability

Audit records must not be editable through normal application screens.

---

# 13. Permissions Matrix

| Feature | Admin | Staff |
|---|---:|---:|
| Login | Yes | Yes |
| View Staff Home | Optional | Yes |
| View Admin Dashboard | Yes | No |
| Add Customer | Yes | Yes |
| Edit Customer | Yes | Yes |
| Deactivate Customer | Yes | No |
| Add Vehicle | Yes | Yes |
| Edit Vehicle | Yes | Yes |
| Deactivate Vehicle | Yes | Optional |
| Capture Photo and GPS | Yes | Yes |
| Create Wash Job | Yes | Yes |
| Start, Pause, Resume, End | Yes | Yes |
| Cancel Waiting Job | Yes | Optional |
| Cancel Active Job | Yes | Optional |
| Apply Valid Coupon | Yes | Yes |
| Apply Valid Referral | Yes | Yes |
| Apply Manual Discount | Yes | No by default |
| Record Payment | Yes | Yes |
| Record Refund | Yes | No |
| Generate Invoice | Yes | Yes |
| Share Invoice | Yes | Yes |
| Manage Staff | Yes | No |
| Manage Services | Yes | No |
| Manage Prices | Yes | No |
| Manage Coupons | Yes | No |
| Manage Referral Settings | Yes | No |
| Manage Expenses | Yes | Optional |
| View Revenue | Yes | No |
| View Expenses | Yes | No by default |
| View Net Profit | Yes | No |
| View Reports | Yes | Limited or No |
| Change Settings | Yes | No |
| Correct Timer | Yes | No |
| View Audit Logs | Yes | No |

Permissions must be enforced on the backend.

---

# 14. Business Rules

## Rule BR-001

A customer may own multiple vehicles.

## Rule BR-002

A vehicle registration number must be unique within the business.

## Rule BR-003

A wash job belongs to one customer and one vehicle.

## Rule BR-004

A new job must contain at least one primary service.

## Rule BR-005

Mandatory photo and GPS requirements must be satisfied before the job proceeds.

## Rule BR-006

Service and tax values used in a job must be stored as snapshots.

## Rule BR-007

The timer uses server timestamps.

## Rule BR-008

Paused duration does not count as active wash duration.

## Rule BR-009

Completed jobs cannot be normally edited.

## Rule BR-010

Discounts cannot exceed the eligible subtotal.

## Rule BR-011

The final amount cannot be negative.

## Rule BR-012

Coupon and referral stacking follows Admin settings.

## Rule BR-013

Coupon usage must be transaction-safe.

## Rule BR-014

Self-referrals are not allowed.

## Rule BR-015

Referral reward is issued only after a qualifying fully paid job.

## Rule BR-016

Payment edits must use adjustment or refund records.

## Rule BR-017

Cancelled jobs do not count as completed washes.

## Rule BR-018

Revenue is based on successful payments minus successful refunds.

## Rule BR-019

Net profit equals net revenue minus active expenses.

## Rule BR-020

Issued invoice snapshots are immutable.

## Rule BR-021

Historical records remain after Staff, service, customer, or vehicle deactivation.

## Rule BR-022

Sensitive actions require user identity and audit logging.

## Rule BR-023

Repeated requests must not create duplicate financial records.

---

# 15. Data Requirements

The product must manage the following entities:

- Organizations
- Branches
- Users
- Sessions
- Login attempts
- Customers
- Vehicle types
- Vehicles
- Services
- Service prices
- Wash jobs
- Wash job items
- Vehicle photos
- GPS captures
- Timer events
- Timer adjustments
- Coupons
- Coupon eligibility
- Coupon redemptions
- Referral codes
- Referral redemptions
- Referral rewards
- Reward transactions
- Payments
- Refunds
- Invoices
- Invoice items
- Expense categories
- Expenses
- Expense attachments
- Settings
- Files
- Audit logs
- Idempotency keys
- Number sequences

---

# 16. Search Requirements

The system must provide fast search for:

## Customers

- Name
- Phone
- Customer ID
- Referral code

## Vehicles

- Registration number
- Customer name
- Customer phone
- Make
- Model

## Jobs

- Job reference
- Customer
- Vehicle
- Status
- Date
- Staff

## Invoices

- Invoice number
- Customer
- Phone
- Vehicle
- Date
- Payment status

## Payments

- Customer
- Job
- Vehicle
- Method
- Date
- Status

## Expenses

- Date
- Category
- Method
- User

---

# 17. Notification Requirements

The product should provide in-app feedback for:

- Successful save
- Failed save
- Invalid form
- Duplicate customer
- Duplicate vehicle
- Camera permission denied
- GPS permission denied
- Poor GPS accuracy
- Outside location
- Coupon accepted
- Coupon rejected
- Referral accepted
- Referral rejected
- Timer started
- Timer paused
- Timer resumed
- Wash completed
- Payment recorded
- Partial balance remaining
- Invoice generated
- Invoice generation failed
- Upload failed
- Session expired
- Access denied

Future versions may add push, email, or automated WhatsApp notifications.

---

# 18. Non-Functional Requirements

# 18.1 Performance

- Main pages should load quickly on normal mobile networks.
- Search should feel immediate for normal datasets.
- Camera images should be compressed where appropriate.
- Large tables must be paginated.
- Dashboard queries must use indexes.
- Repeated clicks must not create duplicate records.
- Loading states must be visible.

---

# 18.2 Reliability

- Timer survives refresh.
- Financial operations are transaction-safe.
- Invoice numbers are unique.
- Job references are unique.
- Coupon and referral redemptions are duplicate-safe.
- Upload failures do not silently create incomplete jobs.
- Network retries do not duplicate payments.
- Generated invoice can be recreated from stored snapshot.

---

# 18.3 Usability

- Mobile-first layout
- Large touch targets
- Clear buttons
- Minimal steps
- Simple language
- Visible status badges
- Confirmation before destructive actions
- Clear form errors
- Preserved form data after recoverable failure
- Search-first customer flow
- Accessible colour contrast

---

# 18.4 Compatibility

Support recent versions of:

- Chrome
- Edge
- Safari
- Firefox

Support:

- Android phones
- Android tablets
- iPhones
- iPads
- Windows desktops
- macOS desktops

Camera and GPS availability depends on device and browser permissions.

---

# 18.5 Accessibility

The product should target WCAG 2.1 AA practices.

Requirements include:

- Keyboard navigation
- Visible focus
- Form labels
- Error announcements
- Sufficient colour contrast
- Screen-reader-friendly controls
- No colour-only status communication
- Touch target sizing
- Logical heading hierarchy

---

# 18.6 Scalability

The initial architecture should support future:

- Multi-branch operation
- More Staff users
- More customers and vehicles
- Large job history
- More reports
- Public booking
- Loyalty
- Inventory
- Online payments
- WhatsApp Business API

---

# 18.7 Maintainability

- Modular frontend
- Modular API
- Versioned database migrations
- Centralized validation
- Centralized permission checks
- Automated tests
- Environment configuration
- Structured logs
- Clear error types
- No duplicated financial logic

---

# 19. Security Requirements

## SEC-001

Passwords must be securely hashed.

## SEC-002

Production traffic must use HTTPS.

## SEC-003

Permissions must be enforced on the backend.

## SEC-004

Customer data must not be public.

## SEC-005

Photo and GPS data must be private.

## SEC-006

File types and sizes must be validated.

## SEC-007

Public invoice links must use secure tokens.

## SEC-008

Login and sensitive APIs must be rate-limited.

## SEC-009

Sessions must expire securely.

## SEC-010

Secrets must not be included in frontend code.

## SEC-011

Database queries must use prepared statements.

## SEC-012

Sensitive actions must be audited.

## SEC-013

Cross-organization and cross-branch access must be blocked.

## SEC-014

Payment card numbers and UPI PINs must never be stored.

## SEC-015

Logs must not expose passwords, tokens, or private secrets.

---

# 20. Privacy Requirements

The application captures:

- Customer details
- Vehicle information
- Vehicle photos
- GPS coordinates
- Staff activity
- Payment references

The product must:

- Explain why camera and location permissions are required.
- Display a privacy notice.
- Store only necessary information.
- Restrict photo and location history.
- Support configurable retention.
- Protect public invoice access.
- Support approved data anonymization.
- Preserve required financial records.
- Avoid unnecessary exposure in exports.

Suggested notice:

> Vehicle photographs and the location where they are captured may be stored for wash-job verification, billing, service records, and dispute resolution. This information is accessible only to authorized Staff and management.

---

# 21. File Storage Requirements

The system must store:

- Live vehicle photos
- Vehicle profile photos
- Business logo
- Expense receipts
- Invoice PDFs

Requirements:

- Private by default
- Secure upload
- File-type validation
- File-size validation
- Unique object keys
- Upload status tracking
- Retry support
- Orphan cleanup
- Protected download links
- Retention policy
- Backup strategy

---

# 22. Error Handling Requirements

Errors must:

- Use simple language
- Explain what happened
- Identify the affected field or action
- Preserve valid entered data
- Offer retry where possible
- Avoid technical stack traces
- Log technical details internally
- Avoid duplicate submission
- Distinguish validation, permission, conflict, and system errors

Suggested error categories:

- Validation
- Authentication
- Authorization
- Duplicate
- Conflict
- Upload
- Camera
- GPS
- Financial
- Network
- Server
- External integration

---

# 23. Offline and Network Behaviour

The initial release is an online responsive web application.

Full offline support is not required.

However:

- The application should detect network loss.
- Unsaved form data may be preserved locally where safe.
- Timer display should recover from server state.
- Retry should verify whether an operation already succeeded.
- Duplicate payments or jobs must be prevented.
- Users should see a clear offline or reconnecting state.

---

# 24. Analytics and Product Success Metrics

The following product metrics should be monitored where privacy and implementation permit.

## 24.1 Operational Metrics

- Average customer registration time
- Average new-wash creation time
- Average wash duration
- Number of jobs per day
- Jobs completed per Staff member
- Timer correction frequency
- Job cancellation rate
- Camera failure rate
- GPS failure rate
- Outside-location rate
- Invoice generation failure rate

---

## 24.2 Financial Metrics

- Daily revenue
- Daily expenses
- Net profit
- Average bill value
- Pending payment amount
- Refund rate
- Total coupon discount
- Total referral discount
- Total referral reward
- Revenue by service
- Revenue by vehicle type

---

## 24.3 Customer Metrics

- New customers
- Returning customers
- Visits per customer
- Total spend per customer
- Referral conversion rate
- Coupon usage rate
- Repeat visit rate

---

## 24.4 Product Reliability Metrics

- API error rate
- Failed login rate
- Duplicate request conflicts
- Upload failure rate
- Average page load time
- Search response time
- Database error rate
- Session expiry errors

---

# 25. Product Success Criteria

The product will be considered successful when:

1. Staff can complete the full wash workflow without paper.
2. Customer search reduces duplicate entry.
3. Vehicle registration duplication is prevented.
4. Mandatory photo and GPS are reliably linked to jobs.
5. Timer remains accurate after refresh.
6. Billing is automatically calculated.
7. Discounts follow configured rules.
8. Referral rewards are not issued incorrectly.
9. Payments and balances are visible.
10. Invoices are generated reliably.
11. Invoices can be shared easily.
12. Customer and vehicle history is complete.
13. Admin can view revenue, expenses, and profit.
14. Reports match source records.
15. Sensitive actions are auditable.
16. Staff cannot access restricted financial screens.
17. The application works smoothly on mobile devices.
18. The client can operate the system after training.

---

# 26. Product Acceptance Criteria

The first production release is accepted when:

1. Admin can log in.
2. Staff can log in.
3. Disabled accounts are blocked.
4. Role permissions are enforced.
5. Staff can add customers.
6. Duplicate phone numbers are handled.
7. Staff can add multiple vehicles.
8. Duplicate registrations are blocked.
9. Staff can create a wash job.
10. Live photo works on supported devices.
11. GPS capture works on supported devices.
12. Location status is calculated.
13. Services can be configured.
14. Vehicle-specific pricing works.
15. Service prices are stored as snapshots.
16. Job timer supports start, pause, resume, and end.
17. Timer survives refresh.
18. Status transitions work.
19. Coupons are validated.
20. Referral codes are validated.
21. Self-referrals are blocked.
22. Referral rewards are issued only after full payment.
23. Partial payment works.
24. Pending payment works.
25. Refund requires Admin permission.
26. Professional invoice is generated.
27. Invoice numbers are unique.
28. Invoice can be downloaded.
29. Invoice can be printed.
30. Invoice details can be shared through WhatsApp.
31. Customer history is complete.
32. Vehicle history is complete.
33. Expenses can be recorded.
34. Net profit is calculated.
35. Dashboard totals match database records.
36. Reports can be filtered.
37. Reports can be exported.
38. Business settings can be updated.
39. Location settings can be updated.
40. Audit logs record sensitive actions.
41. Security testing passes.
42. Mobile testing passes.
43. Desktop testing passes.
44. Backup and restore procedures are documented.
45. Admin and Staff receive training.
46. Final documentation is delivered.

---

# 27. Release Plan

## Phase 1 — Foundation

Includes:

- Project setup
- Authentication
- Role permissions
- Admin and Staff navigation
- Customer management
- Vehicle management
- Basic settings

### Exit Criteria

- Users can log in.
- Roles are enforced.
- Customers and vehicles work.
- Duplicate rules work.

---

## Phase 2 — Wash Operations

Includes:

- Service management
- Vehicle-specific pricing
- New Wash wizard
- Live photo
- GPS
- Location verification
- Job creation
- Timer
- Status flow

### Exit Criteria

- Staff can create and complete a valid wash job.
- Photo and GPS are linked.
- Timer works after refresh.

---

## Phase 3 — Billing and Retention

Includes:

- Billing engine
- Coupon system
- Referral system
- Payments
- Refunds
- Invoice PDF
- WhatsApp sharing

### Exit Criteria

- Final amount is correct.
- Payments work.
- Referral reward rules work.
- Invoice is generated and shareable.

---

## Phase 4 — Business Management

Includes:

- Expenses
- Dashboard
- Reports
- Exports
- Customer history
- Vehicle history
- Staff activity
- Audit logs

### Exit Criteria

- Financial reports match source data.
- Admin can monitor the business.
- Audit trail is complete.

---

## Phase 5 — Quality and Launch

Includes:

- Mobile optimization
- Accessibility review
- Security testing
- Browser testing
- Device testing
- Bug fixing
- Production deployment
- Training
- Documentation
- Handover

---

# 28. Prioritization

## Must Have

- Authentication
- Admin and Staff roles
- Customer management
- Vehicle management
- Service management
- Vehicle pricing
- Live photo
- GPS
- Job creation
- Timer
- Status management
- Billing
- Payments
- Invoice
- WhatsApp sharing
- Expenses
- Dashboard
- Reports
- Audit logs
- Security
- Responsive design

## Should Have

- Coupons
- Referral system
- PDF and Excel export
- Session timeout
- Profile photo
- Staff activity summaries
- Data retention settings
- Invoice public link

## Could Have

- Advanced chart customization
- Optional location map
- Optional completion photo
- Saved report filters
- Bulk import
- Automatic invoice email
- More Staff permissions

## Won’t Have in Initial Release

- Full public booking
- Payment gateway
- Native mobile app
- Inventory
- Payroll
- Multi-branch
- WhatsApp Business API automation
- AI vehicle recognition

---

# 29. Dependencies

The product depends on:

- HTTPS-enabled domain
- Supported browser
- Device camera
- Browser camera permission
- Device location services
- Browser geolocation permission
- Stable internet connection
- Cloudflare hosting
- Cloudflare D1
- Cloudflare R2
- PDF-generation library
- WhatsApp or WhatsApp Web availability
- Client-provided business information
- Client-approved pricing
- Client-approved tax rules
- Client-approved referral rules
- Client-approved location coordinates
- Client-approved retention policy

---

# 30. Risks and Mitigations

## Risk 1 — Camera Permission Denied

**Impact:** Staff cannot complete mandatory capture.

**Mitigation:**

- Clear explanation
- Permission instructions
- Retry
- Admin override policy if approved

---

## Risk 2 — Poor GPS Accuracy

**Impact:** Location cannot be confidently verified.

**Mitigation:**

- Display accuracy
- Retry
- Configurable threshold
- Record result
- Audited override

---

## Risk 3 — Weak Mobile Network

**Impact:** Delays or duplicate submissions.

**Mitigation:**

- Loading states
- Idempotency
- Retry verification
- Compressed images
- Clear network errors

---

## Risk 4 — Incorrect Business Rules

**Impact:** Wrong billing or referral rewards.

**Mitigation:**

- Client approval
- Server-side validation
- Test cases
- Snapshot configuration
- Audit logs

---

## Risk 5 — Unauthorized Financial Changes

**Impact:** Revenue loss or reporting errors.

**Mitigation:**

- Role permissions
- Admin-only adjustments
- Reason requirement
- Audit logs
- Immutable source records

---

## Risk 6 — Duplicate Customer or Vehicle Data

**Impact:** Fragmented history.

**Mitigation:**

- Normalized search
- Unique constraints
- Duplicate warning

---

## Risk 7 — Invoice Failure

**Impact:** Customer does not receive invoice.

**Mitigation:**

- Store invoice snapshot first
- Retry PDF generation
- Avoid duplicate invoice number
- Provide invoice view fallback

---

## Risk 8 — Data Loss

**Impact:** Business records unavailable.

**Mitigation:**

- Managed database recovery
- Migration backups
- R2 backup policy
- Recovery testing
- Documented restore procedure

---

## Risk 9 — Scope Expansion

**Impact:** Delayed delivery and higher cost.

**Mitigation:**

- Approved PRD
- Phase-based release
- Change-request process
- Scope sign-off

---

# 31. Assumptions

This PRD assumes:

- One business organization in the initial release.
- One primary branch.
- Admin controls all global settings.
- Staff normally handles operational workflows.
- The business uses Indian Rupees.
- The default timezone is Asia/Kolkata.
- Tax or GST settings are supplied by the client.
- The client supplies business logo and details.
- WhatsApp sharing is user-confirmed, not automatic.
- Camera and GPS are supported on Staff devices.
- Production is hosted over HTTPS.
- Full offline mode is not required.
- Public booking is future scope.

---

# 32. Open Product Decisions

The client should confirm:

1. Final Staff permissions
2. Whether Staff may cancel active jobs
3. Whether Staff may record expenses
4. Whether unpaid completed jobs can receive an invoice
5. Whether coupon and referral benefits may stack
6. Whether manual discount is allowed
7. Who may override poor GPS or outside location
8. Minimum GPS accuracy
9. Allowed location radius
10. Tax or GST rules
11. Rounding rules
12. Invoice prefix
13. Refund policy
14. Referral friend discount
15. Referrer reward
16. Referral expiry
17. Reward expiry
18. Photo retention period
19. GPS retention period
20. Public invoice-link expiry
21. Whether vehicle ownership can be transferred
22. Whether customer phone numbers must be strictly unique
23. Whether partial-payment invoices are allowed
24. Support period after launch
25. Final delivery timeline

---

# 33. Future Product Roadmap

Potential future releases may include:

## Customer Experience

- Public booking
- Slot selection
- Customer login
- Wash status tracking
- Online payment
- Digital loyalty card
- Memberships
- Subscription packages
- Feedback
- Google review prompts

## Operations

- Multi-branch support
- Inventory
- Chemical usage
- Staff attendance
- Payroll
- Vehicle pickup and delivery
- Before-and-after photos
- Damage notes
- Number-plate recognition

## Communication

- WhatsApp Business API
- Automated reminders
- Birthday offers
- Insurance renewal reminders
- Service reminders
- Invoice email
- Promotional campaigns

## Analytics

- Customer segmentation
- Staff productivity trends
- Service profitability
- Forecasting
- Retention analysis
- Branch comparison
- Campaign attribution

---

# 34. Handover Requirements

Final handover should include:

- Deployed application
- Admin account
- Staff account setup
- Database setup
- File storage setup
- Domain and HTTPS
- Production configuration
- Business settings
- Backup procedure
- Restore procedure
- Admin guide
- Staff guide
- Technical documentation
- Source code, if included
- Credentials handover
- Training
- Bug-support terms
- Change-request process

---

# 35. Final Product Summary

WashPro is a responsive car wash operations and management platform.

The product must enable the complete operational flow:

1. Staff logs in.
2. Customer is selected or registered.
3. Vehicle is selected or added.
4. Live vehicle photo is captured.
5. GPS and timestamp are recorded.
6. Service and add-ons are selected.
7. Coupon or referral benefit is validated.
8. Wash job is created.
9. Timer is started and managed.
10. Wash is completed.
11. Payment is recorded.
12. Invoice is generated.
13. Invoice is downloaded, printed, or shared.
14. Customer and vehicle history is updated.
15. Revenue, expenses, and profit appear in Admin reports.
16. Sensitive changes remain auditable.

The product must balance two priorities:

- Fast, simple Staff operation at the wash bay
- Complete operational and financial control for the business owner

This PRD should be used together with:

- `plan.md`
- `appflow.md`
- `techspec.md`
- `database.md`

as the complete product and implementation foundation for WashPro.
