# Car Wash Management Web Application — Detailed Project Plan

**Project Name:** WashPro  
**Document Type:** `plan.md`  
**Version:** 1.0  
**Status:** Proposed  
**Prepared For:** Car Wash Business Client  
**Application Type:** Responsive Web Application  
**Primary Devices:** Mobile phones, tablets, laptops, and desktop computers

---

## 1. Project Overview

WashPro is a complete Car Wash Management Web Application designed to manage daily car wash operations from customer registration to final invoice delivery.

The application will allow staff members to register customers, add vehicles, capture a live vehicle photo with GPS location, create wash jobs, run a live timer, apply coupons or referral discounts, complete billing, generate a professional PDF invoice, and share invoice details through WhatsApp.

The owner or administrator will receive a private dashboard to manage staff, services, pricing, expenses, customers, vehicles, coupons, referrals, invoices, wash history, revenue, and net profit.

The system must be simple enough for staff to use at the wash bay while still providing the business owner with complete operational and financial visibility.

---

## 2. Project Goals

The main goals of WashPro are to:

1. Digitize customer, vehicle, wash, billing, and expense records.
2. Reduce manual paperwork and billing errors.
3. Track the exact duration of every wash job.
4. Provide proof of vehicle presence using a live photo, GPS location, and timestamp.
5. Generate professional invoices automatically.
6. Improve customer retention through coupons and referral rewards.
7. Help the owner monitor revenue, expenses, and profit.
8. Maintain a complete customer and vehicle history.
9. Make the system accessible from phones, tablets, laptops, and desktops.
10. Provide clear role-based access for Admin and Staff.

---

## 3. Main User Roles

### 3.1 Admin

The Admin represents the car wash owner or authorized manager.

The Admin can:

- Log in securely.
- Create, edit, disable, and manage staff accounts.
- Reset staff passwords.
- View all customers and vehicles.
- View all wash jobs and invoices.
- Manage services and vehicle-specific prices.
- Create and manage coupon codes.
- Configure referral discounts and rewards.
- Record and manage expenses.
- View revenue, expenses, and net profit.
- Access reports and dashboards.
- Configure business, invoice, tax, and location settings.
- View audit history and staff activity.
- View live vehicle photos and GPS locations.

### 3.2 Staff

Staff members handle customer-facing and wash-bay operations.

Staff can:

- Log in securely.
- Register customers.
- Add one or more vehicles to a customer.
- Search customers and vehicles.
- Create wash jobs.
- Capture a live vehicle photo with GPS location.
- Select wash services and add-ons.
- Apply valid coupons or referral codes.
- Start, pause, resume, and end wash timers.
- Record payment information.
- Generate invoices.
- Download, print, and share invoice details.
- View only the operational information permitted by the Admin.

Staff must not be allowed to view sensitive profit reports, edit global pricing, manage users, or change business settings unless permission is explicitly granted.

---

## 4. Functional Scope

## 4.1 Authentication and Role Management

The application must provide secure login access for Admin and Staff.

### Required Features

- Login using username, email, or phone number and password.
- Role-based permissions.
- Password hashing.
- Secure session handling.
- Logout functionality.
- Disabled accounts must not be able to log in.
- Admin can reset staff passwords.
- Failed login attempts should be logged.
- Staff activity should be linked to their account.
- Optional password-change requirement after first login.
- Optional session timeout after inactivity.

### Staff Account Fields

- Full name
- Username
- Phone number
- Email address
- Role
- Account status
- Date created
- Last login time
- Created by
- Optional profile photo

---

## 4.2 Customer Management

Staff must be able to register and manage customer records.

### Customer Fields

- Customer ID
- Full name
- Phone number
- Email address
- Address
- Registration date
- Total visits
- Total amount spent
- Referral code
- Available referral rewards
- Customer status
- Notes

### Required Features

- Add a new customer.
- Edit customer details.
- Search by name or phone number.
- Prevent accidental duplicate customer creation.
- View all vehicles belonging to a customer.
- View wash history.
- View invoice history.
- View coupon and referral usage.
- View pending and available referral rewards.
- Re-share previous invoices.
- Soft-delete or deactivate customers where necessary.

Phone number should be treated as a primary search field. Duplicate detection should warn staff when a matching phone number already exists.

---

## 4.3 Vehicle Management

A single customer may own multiple vehicles.

### Vehicle Fields

- Vehicle ID
- Customer ID
- Registration number
- Vehicle type
- Make
- Model
- Manufacturing year
- Colour
- Fuel type, optional
- Front image
- Rear image
- Notes
- Date added
- Active status

### Vehicle Types

The Admin should be able to configure supported vehicle types, including:

- Bike
- Hatchback
- Sedan
- SUV
- MUV
- Van
- Pickup
- Commercial vehicle
- Other

### Required Features

- Add multiple vehicles under one customer.
- Edit vehicle information.
- Search by registration number.
- Detect duplicate registration numbers.
- View complete wash history for each vehicle.
- View live photos captured for previous wash jobs.
- View invoice history related to the vehicle.

Vehicle registration numbers should be normalized to uppercase and extra spaces should be removed.

---

## 4.4 Live Vehicle Photo With GPS Location

The staff member must capture a live photograph of the vehicle through the WashPro application when creating or starting a wash job.

### Captured Information

- Live vehicle photo
- GPS latitude
- GPS longitude
- GPS accuracy
- Date
- Time
- Staff member
- Customer
- Vehicle
- Vehicle registration number
- Wash job reference
- Location verification status

### Required Behaviour

1. Staff selects the customer and vehicle.
2. Staff taps **Take Live Photo**.
3. The application opens the device camera.
4. Staff captures the vehicle image.
5. The application captures GPS location at the same time.
6. A preview is shown.
7. Staff can accept or retake the image.
8. The photo and location are linked to the wash job.
9. The wash job cannot proceed until mandatory photo and GPS requirements are satisfied.

### Validation Rules

- The required photo must be captured from the camera.
- Old gallery images must not be accepted for the mandatory live-photo field.
- Location permission must be enabled.
- Camera permission must be enabled.
- GPS coordinates must be captured before submission.
- GPS accuracy must be recorded.
- Poor accuracy should trigger a warning.
- The user should be able to retry GPS capture.
- The system must record capture failure reasons.
- Admin can configure the minimum acceptable GPS accuracy.

### Business Location Verification

The Admin can save the official car wash location.

The system should compare the captured coordinates with the registered business coordinates and display:

- At Business Location
- Outside Business Location
- Location Could Not Be Verified

The Admin can configure an allowed radius, for example 100 metres.

### Technical Conditions

Camera and GPS capture require:

- A device with camera support.
- A device or browser with location support.
- Camera permission.
- Location permission.
- Location services enabled.
- A secure HTTPS connection.

---

## 4.5 Service and Price Management

The Admin must be able to manage all wash services without changing the application code.

### Service Fields

- Service name
- Description
- Service category
- Base price
- Vehicle type
- Estimated duration
- Active status
- Tax applicability
- Display order
- Date created
- Date updated

### Example Services

- Basic Wash
- Deluxe Wash
- Platinum Wash
- Interior Cleaning
- Vacuum Cleaning
- Polishing
- Engine Washing
- Full Detailing
- Foam Wash
- Underbody Wash
- Seat Cleaning
- AC Vent Cleaning

### Required Features

- Add a service.
- Edit a service.
- Enable or disable a service.
- Assign different prices to different vehicle types.
- Create optional add-ons.
- Set tax applicability.
- Set display order.
- View service usage statistics.
- Prevent disabled services from being selected for new jobs.
- Preserve old invoice values even when prices later change.

The service price used in a completed wash job must be stored as a snapshot so that future price changes do not modify old invoices.

---

## 4.6 Wash Job Creation

A wash job represents one service visit for one vehicle.

### Wash Job Creation Flow

1. Search or add the customer.
2. Select or add the vehicle.
3. Capture a live vehicle photo.
4. Capture GPS location.
5. Select primary wash service.
6. Select optional add-ons.
7. Apply coupon or referral code where applicable.
8. Display calculated subtotal, discount, tax, and total.
9. Confirm the job.
10. Assign the staff member.
11. Set status to **Waiting** or start immediately.

### Wash Job Fields

- Wash job ID
- Job reference number
- Customer
- Vehicle
- Staff member
- Selected service
- Add-ons
- Price snapshot
- Coupon code
- Referral code
- Discount amount
- Tax amount
- Total amount
- Payment status
- Job status
- Start time
- Pause duration
- End time
- Total active duration
- Live photo
- GPS details
- Notes
- Created date
- Updated date

---

## 4.7 Wash Timer

The application must track the actual duration of each wash.

### Timer Actions

- Start
- Pause
- Resume
- End

### Timer Rules

- The timer starts when staff taps **Start Wash**.
- Start time must be stored on the server.
- Paused time must not count as active wash duration.
- Every pause and resume event should be recorded.
- End time must be stored when the wash is completed.
- Total active duration must be calculated automatically.
- Refreshing or reopening the page must not reset the timer.
- Only authorized staff can control the timer.
- Admin can correct times only through an auditable adjustment process.

---

## 4.8 Wash Job Status Management

Every wash job must have one of the following statuses:

- Waiting
- In Progress
- Paused
- Completed
- Cancelled

### Status Rules

- A newly created job can begin as Waiting.
- Starting the timer changes the status to In Progress.
- Pausing the timer changes the status to Paused.
- Resuming changes it back to In Progress.
- Ending the wash changes the status to Completed.
- A cancelled job must record the cancellation reason.
- Completed jobs should be locked from normal editing.
- Financial adjustments after completion must be audited.

### Dashboard Visibility

The Admin dashboard should show:

- Waiting vehicles
- Jobs in progress
- Paused jobs
- Completed jobs
- Cancelled jobs
- Average wash duration
- Staff assigned to each job

---

## 4.9 Billing Engine

The billing engine must calculate the final payable amount automatically.

### Calculation Order

1. Primary service price
2. Add-on prices
3. Subtotal
4. Coupon or referral discount
5. Tax or GST, when applicable
6. Rounding, if configured
7. Final payable amount

### Billing Rules

- Prices must be based on the selected vehicle type.
- Old jobs must keep their original price snapshots.
- Invalid discounts must not be applied.
- Discount amount cannot exceed the eligible bill amount.
- Tax calculation must use the configured tax rate.
- Manual discount must require Admin permission or a recorded reason.
- Coupon and referral stacking must follow Admin settings.
- Final amount must never become negative.

---

## 4.10 Coupon Code and Discount Management

The Admin must be able to create and control coupon codes.

### Coupon Fields

- Coupon code
- Description
- Discount type
- Discount value
- Minimum bill amount
- Maximum discount amount
- Start date
- Expiry date
- Total usage limit
- Usage limit per customer
- Eligible services
- Eligible vehicle types
- New customers only, optional
- Active status
- Created by
- Created date

### Discount Types

- Fixed amount
- Percentage

### Required Features

- Create unique coupon codes.
- Edit coupon settings.
- Enable or disable coupons.
- Delete unused coupons.
- View coupon usage history.
- Track total discount provided.
- Validate coupon eligibility during billing.
- Reject expired, disabled, invalid, or fully used coupons.
- Display the applied coupon on the invoice.
- Store the original amount and discount amount.

### Coupon Validation

The system must verify:

- Coupon exists.
- Coupon is active.
- Current date is within the validity period.
- Minimum bill amount is met.
- Customer usage limit is not exceeded.
- Total usage limit is not exceeded.
- Selected service is eligible.
- Vehicle type is eligible.
- Customer eligibility is satisfied.

---

## 4.11 Referral Code and Reward Management

A unique referral code should be generated for each eligible customer.

The referral code should appear:

- Below the invoice.
- In the WhatsApp share message.
- In the customer profile.

### Referral Flow

1. Customer A completes and pays for a wash.
2. Customer A receives a referral code.
3. Customer A shares the code with Customer B.
4. Customer B visits the car wash and presents the code.
5. Staff enters the referral code during billing.
6. Customer B receives a referral discount.
7. Customer B completes the wash and payment.
8. Customer A receives a referral reward.
9. Customer A can use the reward on a future wash.

### Referral Configuration

The Admin can configure:

- Enable or disable referral programme.
- Discount for referred friend.
- Reward for referring customer.
- Fixed or percentage discount.
- Minimum bill amount.
- Maximum discount amount.
- Referral-code expiry.
- Reward expiry.
- Eligible services.
- Eligible vehicle types.
- New-customer-only restriction.
- Maximum successful referrals.
- Coupon and referral stacking.
- Reward redemption rules.

### Referral Statuses

- Active
- Redeemed
- Reward Pending
- Reward Earned
- Reward Used
- Expired
- Cancelled

### Referral Validation

The system must prevent:

- Self-referrals.
- Multiple first-time referral discounts for the same customer.
- Reuse of single-use referral benefits.
- Expired or disabled code usage.
- Reward creation before referred wash payment.
- Duplicate rewards for the same referred job.
- Reward balance becoming negative.
- Unauthorized manual reward changes.

### Customer Referral Summary

Customer profile should show:

- Referral code
- Total successful referrals
- Pending rewards
- Available rewards
- Used rewards
- Expired rewards
- Reward expiry dates
- Referral history

---

## 4.12 Payment Management

Every completed wash should include payment details.

### Payment Methods

- Cash
- UPI
- Card
- Bank transfer
- Other

### Payment Statuses

- Pending
- Partially Paid
- Paid
- Refunded
- Cancelled

### Payment Fields

- Payment ID
- Wash job
- Amount
- Payment method
- Payment status
- Transaction reference
- Payment date and time
- Received by
- Notes

### Rules

- Referral reward should be issued only after the referred wash is fully paid.
- Completed invoice must show payment status.
- Partial payments must display remaining balance.
- Refunds must require Admin permission.
- Payment edits must be auditable.

---

## 4.13 Expense Management

The Admin must have a dedicated section to record and manage business expenses.

### Expense Categories

- Cleaning chemicals
- Water charges
- Electricity charges
- Staff wages
- Equipment purchases
- Equipment maintenance
- Rent
- Marketing
- Transportation
- Other expenses

### Expense Fields

- Expense ID
- Expense title
- Category
- Amount
- Date
- Payment method
- Description
- Receipt attachment, optional
- Recorded by
- Created date
- Updated date

### Required Features

- Add an expense.
- Edit an expense.
- Delete or cancel an expense with audit history.
- Filter by date.
- Filter by category.
- View daily, weekly, monthly, and custom reports.
- Export reports.
- Include expenses in net profit calculation.

### Profit Formula

**Net Profit = Total Revenue − Total Expenses**

Revenue should be calculated from valid paid wash jobs. Cancelled, refunded, or unpaid amounts must be handled according to configured accounting rules.

---

## 4.14 Professional PDF Invoice

A professional invoice must be generated automatically when a wash job is completed.

### Invoice Details

- Unique invoice number
- Business name
- Business logo
- Business address
- Business phone number
- Business WhatsApp number
- Tax or GST details, if configured
- Invoice date and time
- Customer name
- Customer phone number
- Vehicle registration number
- Vehicle make and model
- Selected service
- Add-ons
- Wash start time
- Wash completion time
- Total active wash duration
- Original amount
- Coupon code or referral code
- Discount amount
- Tax amount
- Final payable amount
- Payment method
- Payment status
- Staff member
- Referral code
- Referral message
- Custom thank-you message
- Invoice terms or footer

### Invoice Actions

- View
- Download PDF
- Print
- Re-share
- Open from customer history
- Open from vehicle history
- Open from wash-job history

### Invoice Numbering

Invoice numbers should be unique and configurable, for example:

`WP-2026-000001`

Completed invoices must be immutable during normal use. Corrections should create an adjustment or revised invoice record with audit history.

---

## 4.15 WhatsApp Sharing

Staff should be able to share invoice information through WhatsApp.

### Share Content

- Customer name
- Vehicle number
- Service
- Final amount
- Payment status
- Invoice number
- Referral code
- Referral message
- Invoice download or view link, where available

### Important Implementation Note

A standard WhatsApp `wa.me` link can open WhatsApp with a pre-filled text message, but it cannot reliably attach a generated PDF automatically.

The recommended implementation is one of the following:

1. Generate the PDF, allow staff to download it, and then manually attach it in WhatsApp.
2. Upload the invoice securely and include a private invoice-view or download link in the WhatsApp message.
3. Use a paid WhatsApp Business API integration as a future optional feature.

The initial version should use a pre-filled WhatsApp message and an invoice link or manual attachment flow.

---

## 4.16 Customer and Vehicle History

The application must maintain a complete history.

### Customer History

- Registered vehicles
- Previous washes
- Services and add-ons
- Dates and durations
- Amounts
- Discounts
- Coupons
- Referrals
- Payments
- Invoices
- Live photos
- GPS locations
- Staff members
- Total visits
- Total spend

### Vehicle History

- Wash dates
- Selected services
- Wash duration
- Before-wash live photos
- GPS location
- Invoice history
- Staff member
- Notes
- Payment status

---

## 4.17 Admin Dashboard

The Admin dashboard must provide a clear business summary.

### Dashboard Cards

- Today’s revenue
- Today’s expenses
- Today’s net profit
- Cars washed today
- Vehicles waiting
- Jobs in progress
- Paused jobs
- Completed jobs
- Pending payments
- Available referral rewards

### Charts and Summaries

- Revenue by wash service
- Revenue by vehicle type
- Daily revenue trend
- Monthly revenue trend
- Expense breakdown
- Profit trend
- Coupon usage
- Referral performance
- Staff job count
- Average wash duration

### Recent Activity

- Recent wash jobs
- Recent payments
- Recent expenses
- New customers
- Coupon redemptions
- Referral rewards
- Cancelled jobs
- Staff login activity

---

## 4.18 Reports and Export

The Admin should be able to generate reports for:

- Daily revenue
- Weekly revenue
- Monthly revenue
- Custom date-range revenue
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
- Completed and cancelled jobs
- Average wash duration

### Export Formats

- PDF
- Excel or CSV

Reports should respect the selected date range and filters.

---

## 4.19 Business Settings

The Admin should be able to configure:

- Business name
- Logo
- Address
- Phone number
- WhatsApp number
- Email
- Tax or GST number
- Currency
- Tax percentage
- Invoice prefix
- Invoice footer
- Thank-you message
- Working hours
- Business GPS location
- Allowed location radius
- Minimum GPS accuracy
- Referral settings
- Coupon stacking rules
- Default payment method
- Time zone
- Date format
- Number format

---

## 4.20 Audit Log

Important actions must be recorded.

### Audited Actions

- Login attempts
- Staff account creation
- Staff account disablement
- Service price changes
- Coupon creation and editing
- Referral reward adjustments
- Expense editing and deletion
- Invoice adjustments
- Payment changes
- Wash time corrections
- Customer data deletion
- Settings changes

### Audit Fields

- User
- Action
- Record type
- Record ID
- Previous value
- New value
- Date and time
- IP or device information, where available

---

## 5. Application Screens

## 5.1 Public or Login Area

1. Login screen
2. Forgot or reset password flow, optional

## 5.2 Staff Area

1. Staff home
2. Add customer
3. Customer search
4. Customer profile
5. Add vehicle
6. Vehicle details
7. New wash
8. Live camera and GPS capture
9. Service and add-on selection
10. Coupon and referral validation
11. Wash timer
12. Active jobs
13. Payment entry
14. Invoice preview
15. WhatsApp sharing
16. Wash history

## 5.3 Admin Area

1. Admin dashboard
2. Staff management
3. Customer management
4. Vehicle management
5. Service management
6. Vehicle-type pricing
7. Coupon management
8. Referral management
9. Expense management
10. Wash-job history
11. Invoice history
12. Payment history
13. Reports
14. Business settings
15. Location settings
16. Audit logs

---

## 6. Permissions Matrix

| Feature | Admin | Staff |
|---|---:|---:|
| Login | Yes | Yes |
| Add customer | Yes | Yes |
| Edit customer | Yes | Yes |
| Add vehicle | Yes | Yes |
| Capture live photo and GPS | Yes | Yes |
| Create wash job | Yes | Yes |
| Start, pause, resume, and end timer | Yes | Yes |
| Apply valid coupon | Yes | Yes |
| Apply valid referral code | Yes | Yes |
| Generate invoice | Yes | Yes |
| Share invoice | Yes | Yes |
| Manage services and pricing | Yes | No |
| Manage coupons | Yes | No |
| Manage referral settings | Yes | No |
| Manage expenses | Yes | Optional |
| View revenue and profit | Yes | No |
| Manage staff | Yes | No |
| Change business settings | Yes | No |
| View audit logs | Yes | No |

---

## 7. Core Data Model

The application should include the following main database entities.

### 7.1 Users

Stores Admin and Staff accounts.

### 7.2 Customers

Stores customer details, visit totals, and referral information.

### 7.3 Vehicles

Stores vehicles connected to customers.

### 7.4 Vehicle Photos

Stores vehicle images and metadata.

### 7.5 Location Captures

Stores GPS latitude, longitude, accuracy, timestamp, and verification status.

### 7.6 Services

Stores available wash services and add-ons.

### 7.7 Service Prices

Stores prices for each service and vehicle type.

### 7.8 Wash Jobs

Stores wash-job status, customer, vehicle, staff, billing, and timing information.

### 7.9 Wash Job Items

Stores selected services and add-ons for each wash job.

### 7.10 Timer Events

Stores start, pause, resume, and end events.

### 7.11 Coupons

Stores coupon definitions.

### 7.12 Coupon Redemptions

Stores coupon usage records.

### 7.13 Referral Codes

Stores customer referral codes.

### 7.14 Referral Redemptions

Stores referred-customer usage.

### 7.15 Referral Rewards

Stores rewards earned and redeemed by referring customers.

### 7.16 Payments

Stores payment transactions and statuses.

### 7.17 Expenses

Stores business expenses.

### 7.18 Invoices

Stores invoice records and generated PDF references.

### 7.19 Settings

Stores business-level configuration.

### 7.20 Audit Logs

Stores important system changes.

---

## 8. Suggested Technical Architecture

The application may use the following architecture:

### Frontend

- React-based responsive web interface
- Tailwind CSS or equivalent responsive styling
- Mobile-first layout
- Camera access through browser media APIs
- GPS capture through browser geolocation APIs
- Client-side validation
- Accessible forms and buttons

### Backend

- Serverless or API-based backend
- Role-based authentication
- Customer, vehicle, wash, coupon, referral, invoice, and expense APIs
- Secure file-upload validation
- Server-side billing validation
- Server-side timer timestamps
- Audit logging

### Database

- Relational SQL database
- Indexed search fields
- Foreign-key relationships
- Transactional coupon and referral redemption
- Unique invoice numbers
- Unique referral codes
- Duplicate protection

### File Storage

Used for:

- Vehicle photos
- Business logo
- Expense receipts
- Generated invoices

### Hosting

- HTTPS-enabled hosting
- Custom domain or approved subdomain
- Environment-based configuration
- Database backup
- File-storage backup strategy

---

## 9. Security Requirements

- Passwords must never be stored as plain text.
- All production traffic must use HTTPS.
- Admin and Staff permissions must be enforced on the backend.
- File uploads must be checked for type and size.
- Customer data must not be publicly accessible.
- Invoice links should be protected or use hard-to-guess access tokens.
- GPS and photo information must be visible only to authorized users.
- Database inputs must be validated.
- Rate limiting should be added to login and sensitive APIs.
- Sessions must expire securely.
- Sensitive actions must be logged.
- Backups must be protected.
- Secrets and credentials must not be stored in frontend code.

---

## 10. Privacy and Consent

Because the system captures customer details, vehicle images, and GPS location, the business must display a clear notice.

Suggested notice:

> Vehicle photographs and the location where they are captured may be stored for wash-job verification, billing, service records, and dispute resolution. This information is accessible only to authorized staff and management.

The application should:

- Request camera permission.
- Request location permission.
- Explain why permissions are needed.
- Store only necessary information.
- Allow the Admin to define data-retention periods.
- Restrict access to live photos and GPS history.
- Avoid exposing private data in public invoice links.

---

## 11. Validation and Error Handling

The application must provide clear errors for:

- Invalid login.
- Disabled account.
- Duplicate phone number.
- Duplicate vehicle registration.
- Missing customer details.
- Missing mandatory vehicle details.
- Camera permission denied.
- Location permission denied.
- GPS unavailable.
- Poor GPS accuracy.
- Missing live photo.
- Invalid coupon.
- Expired coupon.
- Coupon usage limit reached.
- Invalid referral code.
- Self-referral attempt.
- Duplicate referral attempt.
- Missing service selection.
- Timer already running.
- Attempt to complete an unpaid job, depending on business rules.
- Invoice generation failure.
- File upload failure.
- Network interruption.

Errors should be written in simple language and provide a retry option where possible.

---

## 12. Non-Functional Requirements

### Performance

- Main pages should load quickly on typical mobile networks.
- Search results should appear without noticeable delay.
- Image uploads should be compressed where appropriate.
- Dashboard reports should use indexed database queries.

### Reliability

- Timer state must survive refreshes.
- Coupon and referral redemption must use database transactions.
- Duplicate invoice numbers must be impossible.
- Failed uploads must not create incomplete wash jobs without warning.

### Usability

- Large touch-friendly controls.
- Mobile-first design.
- Clear status labels.
- Minimal steps for staff.
- Confirmation before destructive actions.
- Visible loading indicators.

### Compatibility

- Latest versions of Chrome, Edge, Safari, and Firefox.
- Android phones and tablets.
- iPhones and iPads, subject to browser permissions.
- Windows and macOS desktops.

### Scalability

The architecture should allow future support for:

- Multiple car wash branches
- Multiple Admin roles
- Inventory management
- Employee attendance
- Customer booking
- Loyalty points
- WhatsApp Business API
- Online payment gateway
- Automated customer reminders

---

## 13. Testing Plan

## 13.1 Functional Testing

Test:

- Admin login
- Staff login
- Staff permissions
- Customer creation
- Vehicle creation
- Duplicate detection
- Camera capture
- GPS capture
- Location validation
- Service selection
- Vehicle-specific pricing
- Timer actions
- Job status changes
- Coupon validation
- Referral validation
- Payment recording
- Expense recording
- Invoice generation
- WhatsApp sharing
- Dashboard totals
- Report filters

## 13.2 Device Testing

Test on:

- Android mobile
- iPhone
- Android tablet
- iPad
- Windows desktop
- macOS desktop, where available

## 13.3 Permission Testing

Test:

- Camera permission granted
- Camera permission denied
- Location permission granted
- Location permission denied
- GPS disabled
- Poor GPS signal
- Device without camera
- Browser without required API support

## 13.4 Security Testing

Test:

- Unauthorized Admin-page access
- Session expiration
- Disabled staff login
- Invalid file upload
- Injection attempts
- Direct invoice-link access
- Coupon abuse
- Referral abuse
- Duplicate requests
- Permission bypass attempts

## 13.5 Financial Testing

Test:

- Fixed coupon
- Percentage coupon
- Maximum discount
- Minimum bill
- Referral discount
- Referral reward
- Coupon and referral stacking
- Tax calculation
- Partial payment
- Refund
- Cancelled wash
- Expense impact on profit
- Date-range reports

---

## 14. Acceptance Criteria

The project will be considered functionally complete when:

1. Admin and Staff can log in with correct permissions.
2. Staff can register customers and multiple vehicles.
3. Staff can capture a live vehicle photo and GPS location.
4. Live capture is linked to the correct wash job.
5. Admin can manage services and vehicle-specific prices.
6. Staff can create and manage a wash job.
7. Timer survives page refresh and calculates duration correctly.
8. Statuses work correctly.
9. Admin can create and manage coupons.
10. Coupon validation prevents invalid use.
11. Referral codes are generated and shared.
12. Referred customers receive configured discounts.
13. Referrers receive rewards only after successful paid referrals.
14. Admin can record and report expenses.
15. Net profit is calculated correctly.
16. Professional PDF invoices are generated.
17. Invoices can be downloaded, printed, and shared.
18. Admin dashboard totals match database records.
19. Customer and vehicle histories are complete.
20. The application works responsively on supported devices.
21. Security and permission tests pass.
22. The client receives deployment, basic training, and handover documentation.

---

## 15. Recommended Development Phases

Because the expanded requirements are significantly larger than the original four-screen proposal, a phased plan is recommended.

### Phase 1 — Foundation

- Project setup
- Database design
- Authentication
- Admin and Staff roles
- Customer management
- Vehicle management
- Basic business settings

### Phase 2 — Wash Operations

- Service management
- Vehicle-specific pricing
- New wash workflow
- Live camera capture
- GPS capture
- Business-location verification
- Wash timer
- Job status management

### Phase 3 — Billing and Customer Retention

- Billing engine
- Payment recording
- Coupon system
- Referral system
- Reward tracking
- PDF invoice
- WhatsApp sharing

### Phase 4 — Business Management

- Expense management
- Admin dashboard
- Reports
- Export
- Customer and vehicle history
- Audit logs

### Phase 5 — Quality and Launch

- Mobile optimization
- Security review
- Device testing
- Bug fixing
- Deployment
- Domain and HTTPS setup
- Staff training
- Admin training
- Documentation
- Final handover

---

## 16. Timeline Consideration

The original proposal described a three-week delivery timeline. The added features—especially role management, GPS photo verification, configurable services, coupons, referral rewards, expenses, detailed invoices, reports, and audit logs—substantially increase the project scope.

A realistic production timeline should be reconfirmed after final UI and business-rule approval.

### Recommended Estimate

- Planning and final confirmation: 2–3 days
- Core development: 4–5 weeks
- Testing and corrections: 1–2 weeks
- Deployment and training: 2–3 days

**Recommended total:** approximately 5–7 weeks.

A three-week delivery may still be possible only by launching a smaller Phase 1 version first and delivering the remaining modules in later phases.

---

## 17. Scope and Commercial Change Notice

The expanded scope is larger than the initial WashPro proposal. Before development begins, the following should be reconfirmed with the client:

- Final feature list
- Development price
- Delivery timeline
- Free-support period
- Hosting limits
- File-storage limits
- Domain renewal responsibility
- Paid third-party service costs
- WhatsApp integration method
- Data-retention period
- Future change-request pricing

Any feature not included in the approved final scope should be treated as additional work.

---

## 18. Future Enhancements

The following features are not required for the first release but can be added later:

- Customer online booking
- Slot management
- Multi-branch support
- Loyalty points
- Membership plans
- Subscription wash packages
- Inventory and chemical stock
- Staff attendance
- Payroll
- Automated WhatsApp reminders
- Birthday offers
- Insurance renewal reminders
- Online payment gateway
- WhatsApp Business API
- Customer feedback
- Google review link
- Before-and-after photo comparison
- Automatic number-plate recognition
- Mobile app version

---

## 19. Final Deliverables

The final handover should include:

- Fully deployed responsive web application
- Admin login
- Staff login
- Database setup
- File-storage setup
- HTTPS configuration
- Domain or subdomain setup
- Business settings configuration
- Admin training
- Staff training
- User guide
- Basic technical documentation
- Backup and restore instructions
- Source-code handover, if included in the agreement
- Credentials handover
- Agreed bug-fix support period

---

## 20. Final Summary

WashPro will provide a complete digital workflow for the car wash business:

1. Staff logs in.
2. Customer and vehicle are selected or registered.
3. A live vehicle photo is captured.
4. GPS location and timestamp are recorded.
5. Wash service and add-ons are selected.
6. Coupon or referral discount is validated.
7. Wash job is created.
8. Timer is started and managed.
9. Wash is completed.
10. Payment is recorded.
11. Invoice is generated.
12. Referral code is shown.
13. Invoice details are shared through WhatsApp.
14. Customer and vehicle history are updated.
15. Revenue, expenses, and profit are reflected in the Admin dashboard.

This plan provides a structured foundation for design, development, testing, deployment, and client approval.
