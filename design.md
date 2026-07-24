# WashPro — UI/UX Design Specification

**Project Name:** WashPro  
**Document Type:** `design.md`  
**Version:** 1.0  
**Status:** Proposed  
**Application Type:** Responsive Car Wash Management Web Application  
**Primary Users:** Admin and Staff  
**Primary Devices:** Mobile phones, tablets, laptops, and desktop computers  
**Design Priority:** Fast mobile operations with clear Admin oversight  

---

# 1. Purpose of This Document

This document defines the complete visual design and user experience direction for WashPro.

It converts the requirements in `plan.md`, `prd.md`, `appflow.md`, `techspec.md`, and `database.md` into a consistent interface system covering:

- Product visual direction
- Information architecture
- Responsive layouts
- Navigation
- Screen structure
- Design tokens
- Typography
- Colour system
- Spacing
- Reusable components
- Forms
- Tables
- Cards
- Status indicators
- Charts
- Camera and GPS interfaces
- Wash timer controls
- Billing and invoice views
- Admin management screens
- Empty, loading, success, warning, and error states
- Accessibility
- Touch interaction
- Motion and animation
- Content style
- Design handoff requirements

The design must make Staff operations fast and simple while giving the Admin access to detailed operational and financial information.

---

# 2. Design Vision

WashPro should feel:

- Modern
- Clean
- Reliable
- Professional
- Fast
- Automotive
- Water-inspired
- Trustworthy
- Easy to understand
- Comfortable to use outdoors and at a busy wash bay

The interface should avoid looking like:

- A generic spreadsheet
- A complicated accounting program
- A highly decorative consumer website
- A dark interface with poor outdoor readability
- A crowded enterprise dashboard
- A form-heavy government portal

The product should feel like a focused operational tool designed specifically for a car wash business.

---

# 3. Design Principles

## 3.1 Mobile Operations First

The Staff workflow should be designed for one-handed or two-handed phone use.

Important Staff actions must:

- Use large buttons
- Remain visible
- Require minimal scrolling
- Avoid tiny icons
- Avoid complex dropdowns
- Support outdoor lighting
- Provide immediate feedback

---

## 3.2 Clear Next Action

Every operational screen must make the next action obvious.

Examples:

- `Take Live Photo`
- `Capture Location`
- `Select Service`
- `Create Job`
- `Start Wash`
- `Pause`
- `Resume`
- `End Wash`
- `Record Payment`
- `Generate Invoice`
- `Share on WhatsApp`

Only one action should appear as the strongest primary action at a time.

---

## 3.3 Status at a Glance

Users should recognize the condition of a job without reading detailed text.

Use consistent status badges for:

- Waiting
- In Progress
- Paused
- Completed
- Cancelled
- Pending
- Partially Paid
- Paid
- Refunded
- At Business Location
- Outside Business Location
- Poor Accuracy

Never communicate status using colour alone.

---

## 3.4 Progressive Disclosure

Show only the information required at the current step.

Examples:

- Do not show invoice settings during New Wash.
- Do not show advanced audit information to Staff.
- Keep secondary customer information collapsed on mobile.
- Show advanced filters only when requested.
- Place uncommon Admin actions inside an overflow menu.

---

## 3.5 Preserve Context

Users must not lose their place when:

- Opening a customer from search
- Returning from vehicle details
- Refreshing a timer
- Correcting an invalid coupon
- Retrying a photo upload
- Opening an invoice from history

The interface should preserve:

- Search term
- Selected filters
- Current wizard step
- Entered form data
- Current job
- Scroll position where practical

---

## 3.6 Operational Safety

Destructive and financial actions require stronger visual treatment.

Examples:

- Cancel Job
- Refund Payment
- Disable Staff
- Cancel Expense
- Correct Timer
- Deactivate Customer
- Change Global Price

These actions should use:

- Clear warning language
- Confirmation dialog
- Reason field where required
- Distinct danger styling
- Summary of impact

---

## 3.7 Outdoor Readability

Staff may use the product in bright sunlight.

Therefore:

- Body text must not be too light.
- Critical information must use strong contrast.
- Controls must have visible boundaries.
- Do not depend on subtle grey differences.
- Primary actions should be high contrast.
- Avoid thin fonts.

---

# 4. Product Personality

WashPro’s design personality should be:

| Attribute | Direction |
|---|---|
| Professional | Business-ready, structured |
| Energetic | Blue water accents and confident controls |
| Reliable | Stable layouts and clear confirmation |
| Efficient | Minimal operational steps |
| Friendly | Simple language and rounded surfaces |
| Modern | Responsive cards, charts, clean typography |
| Secure | Clear private-data and permission treatment |

---

# 5. Visual Theme

The recommended visual theme is:

**Clean Automotive Service + Water Technology**

The visual system combines:

- Deep navy for structure
- Bright water blue for primary actions
- Cyan for active operational highlights
- White for working surfaces
- Light blue-grey for page backgrounds
- Green for successful completion and payment
- Amber for paused, pending, or attention states
- Red for cancellation, refund, or errors

The product should primarily use a light interface because:

- It is easier to read outdoors.
- Forms and tables remain clear.
- Business reports print more naturally.
- Photos and status badges stand out.
- Mobile controls remain understandable.

A future dark mode may be added, but it is not required for the first release.

---

# 6. Brand Mark Direction

The WashPro logo may use:

- A simplified vehicle silhouette
- A water droplet
- A pressure-wash arc
- Clean forward motion
- A shield or sparkle to represent cleanliness

The logo must work in:

- Full horizontal format
- Compact square app icon
- White version
- Dark version
- Single-colour version
- Invoice header
- Browser favicon
- Mobile navigation header

Avoid:

- Detailed realistic vehicle illustrations
- Overly complex bubbles
- Multiple gradients inside the icon
- Thin lines that disappear at small sizes
- Generic stock car-wash graphics

---

# 7. Design Tokens

All components should use centralized design tokens.

Do not hardcode inconsistent colours, spacing, shadows, radii, or font sizes across screens.

---

## 7.1 Colour Tokens

### Brand Colours

```css
:root {
  --brand-950: #071A2F;
  --brand-900: #0B2545;
  --brand-800: #10375C;
  --brand-700: #135B88;
  --brand-600: #087EA4;
  --brand-500: #0EA5D7;
  --brand-400: #38BDF8;
  --brand-300: #7DD3FC;
  --brand-200: #BAE6FD;
  --brand-100: #E0F2FE;
  --brand-50: #F0F9FF;
}
```

### Neutral Colours

```css
:root {
  --neutral-950: #0B1220;
  --neutral-900: #111827;
  --neutral-800: #1F2937;
  --neutral-700: #374151;
  --neutral-600: #4B5563;
  --neutral-500: #6B7280;
  --neutral-400: #9CA3AF;
  --neutral-300: #D1D5DB;
  --neutral-200: #E5E7EB;
  --neutral-100: #F3F4F6;
  --neutral-50: #F8FAFC;
  --white: #FFFFFF;
}
```

### Semantic Colours

```css
:root {
  --success-700: #15803D;
  --success-600: #16A34A;
  --success-100: #DCFCE7;
  --success-50: #F0FDF4;

  --warning-700: #A16207;
  --warning-600: #CA8A04;
  --warning-100: #FEF3C7;
  --warning-50: #FFFBEB;

  --danger-700: #B91C1C;
  --danger-600: #DC2626;
  --danger-100: #FEE2E2;
  --danger-50: #FEF2F2;

  --info-700: #1D4ED8;
  --info-600: #2563EB;
  --info-100: #DBEAFE;
  --info-50: #EFF6FF;

  --paused-700: #A16207;
  --paused-100: #FEF3C7;

  --referral-700: #7E22CE;
  --referral-100: #F3E8FF;
}
```

---

## 7.2 Functional Colour Mapping

| Use | Token |
|---|---|
| Page background | `neutral-50` |
| Main surface | `white` |
| Sidebar | `brand-950` |
| Primary button | `brand-600` |
| Primary button hover | `brand-700` |
| Main heading | `neutral-950` |
| Body text | `neutral-700` |
| Secondary text | `neutral-500` |
| Border | `neutral-200` |
| Focus ring | `brand-400` |
| Success | `success-600` |
| Warning | `warning-600` |
| Error | `danger-600` |
| Referral | `referral-700` |

---

## 7.3 Typography Tokens

Recommended font families:

- **Primary UI:** Inter
- **Alternative:** Manrope
- **Numbers and timer:** Inter with tabular numerals

```css
:root {
  --font-sans: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

### Type Scale

| Token | Size | Line Height | Weight | Typical Use |
|---|---:|---:|---:|---|
| Display | 40px | 48px | 700 | Login branding, major empty state |
| H1 | 32px | 40px | 700 | Desktop page title |
| H2 | 26px | 34px | 700 | Section title |
| H3 | 22px | 30px | 650 | Card or modal title |
| H4 | 18px | 26px | 650 | Subsection |
| Body Large | 16px | 24px | 400 | Primary form text |
| Body | 14px | 21px | 400 | Standard content |
| Body Small | 13px | 19px | 400 | Secondary details |
| Label | 13px | 18px | 600 | Form labels |
| Caption | 12px | 17px | 500 | Metadata |
| Metric | 28px | 34px | 700 | KPI cards |
| Timer Mobile | 42px | 48px | 750 | Active timer |
| Timer Desktop | 56px | 64px | 750 | Timer panel |

### Typography Rules

- Use sentence case.
- Avoid all-uppercase headings.
- Uppercase may be used for short vehicle registrations.
- Use tabular numerals for money, durations, invoice numbers, and job numbers.
- Keep mobile page titles between 20 and 24 pixels.
- Avoid body text below 13 pixels.

---

## 7.4 Spacing Scale

Use a 4-pixel base grid.

```css
:root {
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### Typical Use

| Area | Spacing |
|---|---|
| Icon to label | 8px |
| Form label to input | 8px |
| Input to error | 6–8px |
| Form field gap | 16px |
| Card internal padding | 16–24px |
| Section gap | 24–32px |
| Desktop content margin | 24–32px |
| Mobile content margin | 16px |

---

## 7.5 Radius Tokens

```css
:root {
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-pill: 999px;
}
```

### Usage

- Inputs: 10–12px
- Buttons: 10–12px
- Cards: 14–16px
- Modals: 18–20px
- Badges: pill
- Mobile bottom sheet: 20px top corners

---

## 7.6 Shadow Tokens

```css
:root {
  --shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-sm: 0 2px 8px rgba(15, 23, 42, 0.08);
  --shadow-md: 0 8px 24px rgba(15, 23, 42, 0.10);
  --shadow-lg: 0 18px 48px rgba(15, 23, 42, 0.16);
}
```

Use shadows sparingly.

Most layout separation should use:

- Background contrast
- Border
- Spacing
- Typography hierarchy

---

## 7.7 Control Heights

| Control | Mobile | Desktop |
|---|---:|---:|
| Standard input | 48px | 44px |
| Large search | 52px | 48px |
| Primary button | 50–54px | 44–48px |
| Compact button | 40px | 36px |
| Bottom nav | 64–72px | Not used |
| Top header | 56–64px | 64px |
| Sidebar item | 44–48px | 44–48px |

Touch targets must be at least 44 × 44 pixels.

---

# 8. Responsive Breakpoints

Recommended breakpoints:

```css
--bp-sm: 640px;
--bp-md: 768px;
--bp-lg: 1024px;
--bp-xl: 1280px;
--bp-2xl: 1536px;
```

### Layout Behaviour

| Width | Behaviour |
|---|---|
| Under 640px | Single-column mobile |
| 640–767px | Large mobile / small tablet |
| 768–1023px | Tablet layout |
| 1024–1279px | Desktop sidebar |
| 1280px+ | Expanded desktop dashboard |

Do not design only for fixed device sizes.

Layouts must adapt fluidly.

---

# 9. Application Shell

## 9.1 Mobile Shell

The mobile application shell contains:

1. Top header
2. Scrollable content
3. Sticky action area where required
4. Bottom navigation
5. Optional bottom sheet
6. Toast notification layer

### Mobile Header

Contains:

- Back button when nested
- Page title
- Optional job reference
- Optional overflow menu
- Optional profile avatar

The header should remain compact and may be sticky.

---

## 9.2 Desktop Shell

The desktop application shell contains:

1. Persistent sidebar
2. Top header
3. Main content
4. Optional right detail panel
5. Toast layer
6. Modal layer

### Desktop Sidebar

Recommended width:

- Expanded: 248px
- Collapsed: 76px

The sidebar uses dark navy.

It contains:

- Logo
- Main navigation
- Secondary navigation
- User summary
- Logout

---

## 9.3 Staff Mobile Bottom Navigation

Recommended items:

1. Home
2. New Wash
3. Active Jobs
4. Customers
5. More

`New Wash` may use a raised central action style, but it must remain accessible and not overly decorative.

---

## 9.4 Admin Mobile Bottom Navigation

Recommended items:

1. Dashboard
2. Jobs
3. Customers
4. Reports
5. More

---

## 9.5 Desktop Staff Sidebar

Recommended order:

- Home
- New Wash
- Active Jobs
- Customers
- Vehicles
- Invoices
- Wash History
- Profile

---

## 9.6 Desktop Admin Sidebar

Recommended order:

### Operations

- Dashboard
- Active Jobs
- Customers
- Vehicles

### Management

- Staff
- Services
- Pricing
- Coupons
- Referrals
- Expenses

### Finance

- Payments
- Invoices
- Reports

### System

- Business Settings
- Location Settings
- Audit Logs

---

# 10. Page Header Pattern

Desktop page headers should contain:

- Breadcrumb, optional
- Page title
- Supporting description
- Primary action
- Secondary actions
- Date range or status filter when relevant

Example:

```text
Customers
Manage customer profiles, vehicles, and service history.

[Export] [Add Customer]
```

Mobile page headers should contain:

- Page title
- One primary icon action or overflow menu
- Secondary description inside page content when needed

---

# 11. Reusable Components

# 11.1 Button

## Variants

- Primary
- Secondary
- Outline
- Ghost
- Success
- Warning
- Danger
- WhatsApp
- Icon-only
- Text link

## States

- Default
- Hover
- Focus
- Active
- Disabled
- Loading

### Button Rules

- Primary buttons use clear action verbs.
- Avoid vague labels such as `Submit`.
- Use `Save Customer`, `Create Job`, or `Record Payment`.
- Only one primary button per local decision area.
- Danger actions must not visually compete with the normal primary action.

---

# 11.2 Input

Input types include:

- Text
- Phone
- Email
- Number
- Currency
- Date
- Time
- Password
- Search
- Textarea
- Registration number
- GPS read-only field
- Transaction reference

### Input States

- Default
- Hover
- Focus
- Filled
- Disabled
- Read-only
- Error
- Success

### Input Structure

```text
Label
Optional help text
Input
Error or success message
```

Required fields use a visible `Required` indicator or asterisk with accessible text.

---

# 11.3 Select and Combobox

Use searchable comboboxes for:

- Customer
- Vehicle
- Service
- Staff
- Expense category

Use standard select controls for:

- Payment method
- Status
- Vehicle type
- Fuel type

On mobile, long selection lists may open in a bottom sheet.

---

# 11.4 Search Bar

The global search component includes:

- Search icon
- Placeholder
- Clear button
- Optional filter button
- Loading state
- Recent searches, optional

Examples:

- `Search by name or phone`
- `Search vehicle registration`
- `Search invoice number`

---

# 11.5 Card

Card variants:

- Standard
- Interactive
- KPI
- Job
- Customer
- Vehicle
- Service
- Payment
- Warning
- Empty state

Cards should use:

- Clear heading
- Important value
- Supporting details
- Primary action
- Optional overflow menu

---

# 11.6 Status Badge

Status badges use:

- Icon
- Text
- Background
- Border when needed

Recommended mapping:

| Status | Visual |
|---|---|
| Waiting | Blue-grey |
| In Progress | Blue/cyan with activity icon |
| Paused | Amber with pause icon |
| Completed | Green with check icon |
| Cancelled | Red with x icon |
| Pending Payment | Amber |
| Partially Paid | Blue |
| Paid | Green |
| Refunded | Purple or muted red |
| At Location | Green |
| Outside Location | Red |
| Poor Accuracy | Amber |

---

# 11.7 Stepper

Used for New Wash.

Steps:

1. Customer
2. Vehicle
3. Photo & GPS
4. Services
5. Discount
6. Review

Mobile behaviour:

- Show current step name
- Show `Step 3 of 6`
- Use compact progress bar
- Do not show six full labels in narrow space

Desktop behaviour:

- Horizontal stepper
- Full step names
- Completed step icons

---

# 11.8 Tabs

Used for:

- Customer profile
- Vehicle details
- Job details
- Settings
- Reports

Mobile tabs should be:

- Horizontally scrollable
- Clearly selected
- Sticky only when beneficial

Do not hide critical primary actions inside tabs.

---

# 11.9 Table

Tables are mainly for desktop and tablet.

Table structure:

- Header
- Optional selection
- Sortable columns
- Row action menu
- Empty state
- Loading skeleton
- Pagination

### Table Rules

- Keep important identifiers left aligned.
- Right align monetary values.
- Use tabular numerals.
- Status columns use badges.
- Avoid more than 8–10 visible columns.
- Move secondary details to row expansion or details page.
- Use sticky headers for long lists.

---

# 11.10 Mobile List Card

On mobile, tables convert into cards.

Example job card:

```text
KL 24 AB 1234         In Progress
WJ-2026-000129
Rahul Kumar
Deluxe Wash
Assigned: Arun
00:18:42

[Open Job]
```

---

# 11.11 Modal

Use modal dialogs for:

- Confirmations
- Small edits
- Refund
- Manual discount
- Password reset
- Timer correction

Do not use a modal for complex multi-step workflows.

On mobile, use full-screen dialog or bottom sheet depending on complexity.

---

# 11.12 Bottom Sheet

Use for:

- Filters
- Mobile selection lists
- Job quick actions
- Payment methods
- Share options

Bottom sheets should have:

- Drag handle
- Title
- Close button
- Safe-area padding
- Sticky primary action if needed

---

# 11.13 Toast

Toast types:

- Success
- Error
- Warning
- Information

Use toasts for brief outcomes.

Do not use a toast as the only place to show a critical failure.

---

# 11.14 Alert Banner

Use persistent banners for:

- Network offline
- Session expiring
- Photo upload failed
- GPS accuracy low
- Outside business location
- Pending balance
- Data not synchronized

---

# 11.15 Skeleton Loading

Use skeletons for:

- Dashboard cards
- Tables
- Customer profile
- Active jobs
- Charts
- Invoice preview

Avoid full-page spinners when part of the page can load progressively.

---

# 11.16 Empty State

Every list needs an intentional empty state.

Include:

- Simple icon or illustration
- Clear title
- One-sentence explanation
- Relevant action

Example:

```text
No active wash jobs
Start a new wash when the next vehicle arrives.

[Create New Wash]
```

---

# 12. Login Screen Design

## 12.1 Desktop Layout

Use a split layout:

### Left Panel

- WashPro logo
- Automotive or water-inspired illustration
- Short product message
- Optional operational benefits

### Right Panel

- Login card
- Identifier input
- Password input
- Show password
- Login button
- Forgot password, optional
- Privacy notice link

The login card should be centered and no wider than 440px.

---

## 12.2 Mobile Layout

Use:

- Logo at top
- Compact illustration or brand shape
- Welcome heading
- Login form
- Full-width login button
- Version or business name at bottom

Avoid unnecessary marketing content on mobile.

---

## 12.3 Login Copy

Heading:

```text
Welcome back
```

Supporting text:

```text
Sign in to manage today’s car wash operations.
```

Error:

```text
The username or password is incorrect.
```

Disabled account:

```text
This account is disabled. Contact the administrator.
```

---

# 13. Staff Home Design

The Staff Home should prioritize immediate operation.

## 13.1 Mobile Layout

Recommended structure:

1. Greeting and Staff name
2. Date and branch
3. Large `New Wash` card
4. Active job summary
5. Waiting jobs
6. In-progress jobs
7. Paused jobs
8. Pending payments
9. Recent customers
10. Bottom navigation

### Main New Wash Card

Contains:

- Water or car icon
- `Start a New Wash`
- Supporting text
- Large primary button

---

## 13.2 Staff Summary Cards

Use a two-column mobile grid:

- Waiting
- In Progress
- Paused
- Pending Payment

Each card shows:

- Count
- Status icon
- Label
- Subtle semantic background

---

## 13.3 Desktop Layout

Use:

- Page header
- KPI row
- Active jobs table
- Waiting queue
- Recent customers
- Quick actions

---

# 14. Admin Dashboard Design

## 14.1 Dashboard Hierarchy

The dashboard should answer:

1. What is happening now?
2. How much money was received?
3. What was spent?
4. What needs attention?
5. How is the business performing?

---

## 14.2 Desktop Dashboard Layout

Recommended:

### Row 1

- Revenue
- Expenses
- Net Profit
- Cars Washed

### Row 2

- Active Jobs panel
- Pending Payments panel

### Row 3

- Revenue trend chart
- Service performance chart

### Row 4

- Expense breakdown
- Staff performance

### Row 5

- Recent activity table

---

## 14.3 KPI Card Design

Each KPI card contains:

- Label
- Main value
- Change compared with previous period, when available
- Small icon
- Optional mini trend

Do not use decorative charts when data is not meaningful.

---

## 14.4 Dashboard Filters

Place date filter in page header:

- Today
- This Week
- This Month
- Custom

On mobile, use segmented control or filter sheet.

All dashboard components must update together.

---

# 15. Customer Search Design

## 15.1 Mobile

Use:

- Large search input
- Recent customers
- Search results as cards
- Sticky `Add Customer` button

Each customer card displays:

- Name
- Phone
- Vehicle count
- Last visit
- Total visits
- `Start Wash` action
- `View Profile` action

---

## 15.2 Desktop

Use:

- Page header
- Search and filters
- Customer table
- Export
- Add Customer

Recommended columns:

- Customer
- Phone
- Vehicles
- Total Visits
- Last Visit
- Total Spend
- Status
- Actions

---

# 16. Add and Edit Customer Design

## 16.1 Form Sections

### Basic Information

- Full name
- Phone
- Email

### Address

- Address field

### Additional Information

- Notes
- Status

---

## 16.2 Mobile Behaviour

- Single-column form
- Numeric keyboard for phone
- Email keyboard for email
- Sticky `Save Customer` button
- Secondary `Save and Add Vehicle`

---

## 16.3 Duplicate Warning

When a phone match is found, show an inline warning card:

```text
Customer already found
Rahul Kumar • +91 98XXXXXX12
2 vehicles • Last visit 12 July 2026

[Open Customer] [Use Different Number]
```

Do not use a vague error message.

---

# 17. Customer Profile Design

## 17.1 Profile Header

Show:

- Customer name
- Phone
- Status
- Referral code
- `New Wash`
- `Add Vehicle`
- More menu

---

## 17.2 Summary Metrics

- Total visits
- Total spend
- Vehicles
- Available rewards
- Last visit

---

## 17.3 Tabs

- Overview
- Vehicles
- Wash History
- Invoices
- Payments
- Referrals
- Photos & Locations
- Notes

---

## 17.4 Mobile Profile

Use:

- Compact header
- Horizontal metric cards
- Horizontally scrollable tabs
- Stacked history cards

---

# 18. Vehicle Search and Profile Design

## 18.1 Vehicle Search Result

Show:

- Registration number prominently
- Vehicle type
- Make and model
- Colour
- Customer
- Last wash
- Status

Registration should use:

- Uppercase
- Tabular characters
- Strong contrast
- Optional plate-style badge without mimicking an official plate too closely

---

## 18.2 Vehicle Profile

Sections:

- Vehicle summary
- Owner
- Wash count
- Last wash
- Photos
- Wash history
- Invoice history
- Notes

Primary action:

```text
Start New Wash
```

---

# 19. New Wash Wizard Design

The New Wash wizard is the most important Staff workflow.

It must be optimized for speed, clarity, and recovery from errors.

---

## 19.1 Wizard Shell

Contains:

- Back
- Step title
- Step progress
- Current selected customer and vehicle summary
- Main content
- Sticky bottom action bar

Sticky action bar:

- Back or Cancel
- Continue
- Context-specific primary action

---

## 19.2 Step 1 — Customer

Show:

- Search input
- Recent customers
- Search results
- Add New Customer

After selection, show compact confirmation card.

---

## 19.3 Step 2 — Vehicle

Show:

- Customer’s active vehicles
- Vehicle cards
- Add New Vehicle

Vehicle card includes:

- Registration
- Type
- Make/model
- Colour
- Last wash

---

## 19.4 Step 3 — Live Photo and GPS

This screen must make permission and progress states obvious.

Layout:

1. Vehicle summary
2. Camera status
3. Camera preview
4. GPS status
5. Location verification
6. Continue

---

# 20. Live Camera Interface

## 20.1 Before Permission

Show:

- Camera illustration
- Explanation
- `Allow Camera`
- Privacy note

Copy:

```text
Take a live photo of the vehicle
The photo will be linked to this wash job for verification and service history.
```

---

## 20.2 Camera View

Use:

- Full-width camera preview
- Registration and customer overlay outside the image
- Large circular capture button
- Close button
- Flash control when supported
- Camera switch when supported
- Instruction text

Suggested instruction:

```text
Fit the full vehicle inside the frame.
```

---

## 20.3 Photo Preview

Show:

- Captured image
- Timestamp
- Retake
- Use Photo

Do not automatically accept a blurred or incomplete image without user review.

---

## 20.4 Upload State

Show the preview with:

- Upload progress
- `Uploading photo…`
- Retry on failure

The user should not accidentally capture multiple required photos.

---

# 21. GPS Interface

## 21.1 Location Capture Card

Show:

- Location icon
- Current state
- Accuracy
- Distance from business
- Retry
- Help

States:

### Not Started

```text
Location not captured
```

### Capturing

```text
Finding your location…
```

### Valid

```text
At business location
Accuracy: 18 m
```

### Outside

```text
Outside business location
Distance: 242 m
```

### Poor Accuracy

```text
Location accuracy is too low
Accuracy: 180 m
```

### Failed

```text
Location could not be captured
```

---

## 21.2 Map

A map preview is optional.

If included:

- Keep it compact.
- Show business point.
- Show captured point.
- Show allowed radius.
- Do not expose maps on every history card.
- Provide text status even if map fails.

---

## 21.3 Override Design

Admin override must use a warning dialog:

- Current status
- Accuracy
- Distance
- Reason textarea
- `Approve Override`
- `Cancel`

Use clear warning styling.

---

# 22. Service Selection Design

## 22.1 Primary Services

Display active primary services as cards.

Each card includes:

- Service name
- Short description
- Vehicle-specific price
- Estimated duration
- Tax indicator, optional
- Selection control

Selected card uses:

- Brand border
- Check icon
- Subtle brand background

---

## 22.2 Add-Ons

Display after primary service.

Use:

- Checkbox cards
- Price
- Estimated time
- Optional quantity

---

## 22.3 Price Summary

A sticky or visible summary shows:

- Primary service
- Add-ons
- Subtotal
- Current total

Mobile:

- Collapsed summary above sticky Continue button
- Tap to expand

Desktop:

- Right-side summary panel

---

# 23. Discount Design

## 23.1 Discount Options

Use segmented choices:

- No Discount
- Coupon
- Referral
- Reward

Manual discount appears only with permission.

---

## 23.2 Coupon Entry

Contains:

- Code field
- Apply button
- Validation message
- Applied coupon card

Successful card:

```text
WASH20 applied
20% discount • You saved ₹180
[Remove]
```

---

## 23.3 Referral Entry

Show:

- Referral code field
- Referring customer name after validation
- Friend discount
- Reward explanation
- Status

Self-referral or duplicate use must show a clear inline error.

---

## 23.4 Available Reward

Show available rewards as selectable cards:

```text
₹150 reward
Expires 20 August 2026
```

---

# 24. Review and Create Job Screen

Use a summary layout with editable sections.

Sections:

- Customer
- Vehicle
- Photo and Location
- Services
- Discount
- Staff Assignment
- Price Summary
- Notes

Each section has an `Edit` link.

The final amount must be visually prominent.

Primary action:

```text
Create Wash Job
```

Optional secondary action:

```text
Create and Start Wash
```

---

# 25. Active Jobs Design

## 25.1 Mobile Job Cards

Each card should show:

- Vehicle registration
- Customer
- Service
- Job reference
- Staff
- Status
- Timer or waiting duration
- Payment status if completed
- Primary action

Use status-specific top border or icon, not full saturated backgrounds.

---

## 25.2 Desktop Table

Recommended columns:

- Job
- Vehicle
- Customer
- Service
- Staff
- Status
- Timer
- Amount
- Payment
- Action

---

## 25.3 Filters

- All Active
- Waiting
- In Progress
- Paused
- Assigned to Me
- Staff
- Service

Mobile filters open in bottom sheet.

---

# 26. Wash Timer Screen

The Timer screen must be extremely clear.

## 26.1 Mobile Timer Layout

1. Status badge
2. Vehicle registration
3. Customer
4. Service
5. Large active-duration timer
6. Start time and paused duration
7. Primary timer control
8. Secondary action
9. Job details accordion

---

## 26.2 Timer States

### Waiting

- Timer displays `00:00:00`
- Primary action: `Start Wash`

### In Progress

- Large running timer
- Primary action: `Pause`
- Secondary action: `End Wash`

### Paused

- Timer visually paused
- Primary action: `Resume Wash`
- Secondary action: `End Wash`

### Completed

- Final duration
- Completed timestamp
- Primary action: `Record Payment`

---

## 26.3 Timer Visual Treatment

Use:

- Tabular numerals
- Strong contrast
- No distracting animation
- Small live indicator
- Server-sync message when reconnecting

Example:

```text
00:24:18
Active wash time
Paused: 04:12
```

---

## 26.4 End Wash Confirmation

Show:

- Vehicle
- Active duration
- Selected services
- Warning that normal timer editing will be locked
- `End Wash`
- `Continue Washing`

---

# 27. Job Details Design

Use a structured detail page.

Sections:

- Overview
- Customer
- Vehicle
- Services
- Photo
- Location
- Timer History
- Billing
- Payments
- Invoice
- Notes
- Audit, Admin only

Desktop may use a two-column layout:

- Main details
- Status and actions sidebar

Mobile uses stacked cards.

---

# 28. Billing Review Design

## 28.1 Price Breakdown

Use a clear invoice-like panel:

```text
Deluxe Wash                ₹800
Interior Cleaning          ₹250
Subtotal                  ₹1,050
Coupon WASH20              -₹210
GST                         ₹151
Total                       ₹991
```

Right-align monetary values.

Use emphasis:

- Total: largest and boldest
- Discount: success or referral colour
- Tax: neutral
- Balance: warning when non-zero

---

## 28.2 Manual Discount

Admin-only modal includes:

- Discount type
- Value
- Maximum allowed
- Reason
- Updated preview
- Confirm

---

# 29. Payment Screen Design

## 29.1 Payment Summary

Show:

- Final amount
- Previously paid
- Remaining balance
- Payment status

---

## 29.2 Payment Method

Use large selectable cards:

- Cash
- UPI
- Card
- Bank Transfer
- Other

Each uses icon and label.

---

## 29.3 Amount Entry

Default to remaining balance.

Provide:

- `Pay Full Amount`
- Custom amount
- Validation
- Remaining balance preview

---

## 29.4 Payment Success

Show a clear success state:

```text
Payment recorded
₹991 received by UPI
Balance: ₹0
```

Actions:

- Generate Invoice
- View Job
- Share Receipt, optional

---

## 29.5 Partial Payment

Use warning styling:

```text
Partial payment recorded
Paid: ₹500
Remaining: ₹491
```

Primary action:

```text
Generate Invoice
```

or block invoice based on client-approved business rule.

---

# 30. Refund Design

Admin-only refund dialog:

- Original payment
- Refundable amount
- Refund amount
- Reason
- Method/reference
- Impact warning
- Confirm Refund

Danger confirmation text:

```text
This refund will reduce reported revenue and may affect a referral reward.
```

---

# 31. Invoice Design

## 31.1 Invoice Preview

The application preview should resemble the final PDF.

Structure:

1. Business logo and details
2. Invoice number and date
3. Customer and vehicle details
4. Service line items
5. Billing totals
6. Payment information
7. Duration
8. Referral code
9. Thank-you note
10. Terms and footer

---

## 31.2 Invoice PDF Style

Recommended style:

- White background
- Navy headings
- Water-blue accents
- Clean grid
- Strong total
- Minimal decoration
- Printable in colour and grayscale
- A4-friendly
- Clear page margins

Avoid:

- Large background images
- Heavy gradients
- Low-contrast text
- Decorative patterns behind totals

---

## 31.3 Invoice Actions

Use:

- Download PDF
- Print
- Share WhatsApp
- Copy Link
- Open Job

On mobile, actions may open a share sheet or bottom sheet.

---

# 32. WhatsApp Share Design

The Share screen or sheet shows:

- Message preview
- Customer WhatsApp number
- Invoice link status
- Copy message
- Copy link
- Open WhatsApp
- Download PDF

Include a note:

```text
The PDF may need to be attached manually in WhatsApp.
```

---

# 33. Staff Management Design

## 33.1 Staff List

Desktop columns:

- Staff
- Username
- Contact
- Role
- Status
- Last Login
- Jobs Today
- Actions

Mobile cards:

- Name
- Role
- Status
- Phone
- Last login
- Open

---

## 33.2 Add Staff

Form sections:

- Profile
- Login Details
- Role and Permissions
- Temporary Password
- Status

Use permission groups rather than a long unstructured checkbox list.

---

## 33.3 Disable Staff

Confirmation shows:

- Staff name
- Current active jobs
- Session impact
- Reason

---

# 34. Service Management Design

## 34.1 Service List

Show:

- Name
- Primary or Add-On
- Base price
- Vehicle-price coverage
- Duration
- Tax
- Status
- Usage

---

## 34.2 Service Editor

Sections:

- Basic details
- Service type
- Vehicle-specific prices
- Tax
- Duration
- Display
- Status

Vehicle pricing should use a simple table:

| Vehicle Type | Price |
|---|---:|
| Bike | ₹200 |
| Hatchback | ₹400 |
| Sedan | ₹500 |
| SUV | ₹650 |

---

## 34.3 Price Change Warning

When changing price:

```text
This change will apply to new wash jobs only.
Existing jobs and invoices will keep their original price.
```

---

# 35. Coupon Management Design

## 35.1 Coupon List

Show:

- Code
- Type
- Value
- Validity
- Usage
- Total Discount
- Status

---

## 35.2 Coupon Editor

Use sections:

- Coupon identity
- Discount
- Validity
- Usage limits
- Eligibility
- Customer restrictions
- Status

A live example should explain the result:

```text
Example: 20% off a ₹1,000 bill = ₹200 discount.
Maximum discount: ₹250.
```

---

# 36. Referral Management Design

## 36.1 Referral Dashboard

KPI cards:

- Successful referrals
- Pending rewards
- Available rewards
- Used rewards
- Total friend discount
- Total reward issued

---

## 36.2 Referral Settings

Use clear paired cards:

### Friend Benefit

- Fixed or percentage
- Value
- Minimum bill
- Maximum discount

### Referrer Reward

- Fixed or percentage
- Value
- Expiry
- Redemption rules

---

## 36.3 Referral History

Show:

- Referrer
- Referred customer
- Job
- Discount
- Reward
- Status
- Date

---

# 37. Expense Management Design

## 37.1 Expense Dashboard

Show:

- Expenses today
- Expenses this month
- Largest category
- Recent expenses

---

## 37.2 Expense List

Desktop columns:

- Date
- Title
- Category
- Method
- Recorded By
- Amount
- Status
- Receipt
- Actions

Mobile cards show the same information in condensed form.

---

## 37.3 Add Expense Form

Sections:

- Expense details
- Amount and date
- Payment method
- Receipt
- Description

Primary action:

```text
Save Expense
```

---

## 37.4 Cancel Expense

Use warning dialog:

```text
Cancel this expense?
The record will remain in history but will be removed from active expense totals.
```

---

# 38. Reports Design

## 38.1 Reports Home

Use category cards:

### Financial

- Revenue
- Expenses
- Net Profit
- Pending Payments

### Operations

- Wash Count
- Average Duration
- Service Popularity
- Vehicle Types

### Customers

- Visit Frequency
- Coupon Usage
- Referral Performance

### Staff

- Jobs Completed
- Average Duration
- Payments Received

---

## 38.2 Report Page

Structure:

1. Page header
2. Date filter
3. Additional filters
4. Summary cards
5. Chart
6. Data table
7. Export actions

---

## 38.3 Charts

Recommended chart types:

| Data | Chart |
|---|---|
| Revenue trend | Line |
| Revenue by service | Horizontal bar |
| Expenses by category | Donut or bar |
| Vehicle type distribution | Bar |
| Staff performance | Horizontal bar |
| Coupon usage over time | Line or bar |
| Referral status | Stacked bar |
| Profit trend | Line |

### Chart Rules

- Use accessible labels.
- Show values in tooltips.
- Provide a table alternative.
- Avoid 3D charts.
- Avoid unnecessary gradients.
- Use no more than 6–8 categories before grouping as Other.
- Currency axes must use compact formatting.

---

# 39. Business Settings Design

Use a settings layout with left navigation on desktop and a list-to-detail flow on mobile.

Sections:

- Business Profile
- Invoice
- Tax and Billing
- Payment
- Location
- Coupons
- Referrals
- Regional
- Privacy and Retention
- Security

Each section should have its own Save action.

Avoid one extremely long settings page.

---

# 40. Location Settings Design

Show:

- Business address
- Latitude
- Longitude
- Use Current Location
- Map preview
- Allowed radius slider or number input
- Minimum GPS accuracy
- Test Location button
- Save

Display a human-readable explanation:

```text
Photos captured within 100 metres of the business will be marked as At Business Location.
```

---

# 41. Audit Log Design

## 41.1 Audit List

Show:

- Time
- User
- Action
- Record
- Severity
- Device
- View Details

Use filters for:

- User
- Action
- Record type
- Date
- Severity

---

## 41.2 Audit Detail

Use before-and-after comparison.

Example:

```text
Service Price Updated

Previous
SUV price: ₹600

New
SUV price: ₹650

Reason
Updated seasonal pricing.
```

Audit details are read-only.

---

# 42. Profile and Account Design

Profile screen includes:

- Profile photo
- Name
- Role
- Username
- Phone
- Email
- Last login
- Change password
- Logout

Staff should not be able to change their own role or permissions.

---

# 43. Confirmation Dialog Standards

## Standard Confirmation

Used for reversible or low-risk action.

Buttons:

- Cancel
- Confirm

## Warning Confirmation

Used for important action.

Buttons:

- Go Back
- Continue

## Danger Confirmation

Used for cancellation, refund, or disablement.

Buttons:

- Keep Record / Go Back
- Destructive action label

Example:

```text
Cancel wash job?

This job will be removed from the active queue. Reserved discounts will be released.

Reason *
[________________________]

[Keep Job] [Cancel Job]
```

---

# 44. Form Validation Design

Validation should happen:

- On blur for simple fields
- On submit for complete validation
- Immediately for known duplicates after a short debounce
- On server after submission

Error messages appear:

- Below field
- In red
- With error icon
- With clear action

Avoid:

```text
Invalid input
```

Prefer:

```text
Enter a valid 10-digit phone number.
```

---

# 45. Loading and Processing States

## Button Loading

Example:

```text
[Saving Customer…]
```

The button remains the same width where possible.

## Page Loading

Use skeletons.

## Long Processing

For PDF generation:

```text
Generating invoice…
This may take a moment.
```

Do not show fake progress percentages.

---

# 46. Offline and Reconnection Design

Show a persistent top banner:

```text
You’re offline. Some actions are unavailable.
```

When reconnecting:

```text
Connection restored. Checking recent actions…
```

For uncertain submissions:

```text
We are checking whether the payment was already saved.
```

Never encourage the user to submit a payment repeatedly.

---

# 47. Notification and Feedback Copy

## Success

- `Customer added successfully.`
- `Vehicle added successfully.`
- `Wash job created.`
- `Wash started.`
- `Payment recorded.`
- `Invoice generated.`
- `Expense saved.`

## Warning

- `GPS accuracy is low. Try again in an open area.`
- `This customer has a pending balance.`
- `The selected coupon expires today.`

## Error

- `Photo upload failed. Your job details are still saved.`
- `The payment could not be recorded. Check your connection and try again.`
- `This vehicle registration number is already registered.`

---

# 48. Content and Tone Guidelines

WashPro copy should be:

- Direct
- Friendly
- Professional
- Simple
- Action-oriented

Use:

```text
Start Wash
```

Not:

```text
Initiate Service Timer
```

Use:

```text
Remaining balance
```

Not:

```text
Outstanding receivable amount
```

Use complete labels.

Avoid abbreviations unless commonly understood:

- GPS
- GST
- UPI
- PDF

---

# 49. Iconography

Use one consistent icon library.

Recommended style:

- Rounded outline icons
- 1.75–2px stroke
- Simple silhouettes
- Clear at 20–24px

Suggested icons:

| Feature | Icon |
|---|---|
| Dashboard | Gauge |
| New Wash | Droplet + car |
| Jobs | Clipboard |
| Customers | Users |
| Vehicles | Car |
| Camera | Camera |
| Location | Map pin |
| Services | Sparkles |
| Timer | Stopwatch |
| Payments | Wallet |
| Invoice | Receipt |
| Expenses | Credit card or receipt |
| Reports | Chart |
| Settings | Sliders |
| Audit | Shield check |
| WhatsApp | Official WhatsApp mark where permitted |

Do not mix filled and outline styles randomly.

---

# 50. Images and Illustrations

Use illustrations sparingly.

Appropriate uses:

- Login screen
- Empty state
- Camera permission explanation
- GPS permission explanation
- Success completion screen

Avoid decorative images on:

- Active jobs
- Payment forms
- Reports
- Settings
- Audit logs

The operational interface should remain clean and fast.

---

# 51. Motion and Animation

Animations should support understanding.

## Recommended

- Button press feedback
- Card hover on desktop
- Step transition
- Status badge update
- Modal fade and scale
- Bottom sheet slide
- Skeleton shimmer
- Small success check animation

## Avoid

- Continuous water animations
- Bouncing icons
- Large parallax
- Long page transitions
- Animated timer digits that reduce readability
- Confetti for normal operational actions

### Timing

| Motion | Duration |
|---|---:|
| Hover | 120–160ms |
| Button/state | 150–200ms |
| Modal | 180–240ms |
| Page section | 200–280ms |
| Bottom sheet | 220–300ms |

Respect reduced-motion preferences.

---

# 52. Accessibility Requirements

The interface should target WCAG 2.1 AA practices.

Requirements:

- Sufficient colour contrast
- Visible focus states
- Keyboard navigation
- Semantic headings
- Proper labels
- Error association
- Screen-reader status announcements
- Text alternatives for icons
- No colour-only meaning
- 44px touch targets
- Logical tab order
- Reduced-motion support
- Accessible chart alternatives
- Accessible modal focus trapping
- Escape key closes non-critical dialogs
- Persistent errors until resolved

---

# 53. Keyboard Behaviour

Desktop users should be able to:

- Tab through forms
- Press Enter to submit safe forms
- Use Escape to close dialogs
- Use arrow keys in menus
- Use Space to select checkboxes
- Navigate tabs accessibly

Do not trigger dangerous actions with a single Enter press when focus is ambiguous.

---

# 54. Mobile Keyboard Behaviour

Use correct input modes:

| Field | Keyboard |
|---|---|
| Phone | Numeric / tel |
| Email | Email |
| Amount | Decimal numeric |
| Registration | Text uppercase |
| OTP, future | Numeric |
| Date | Native date picker where reliable |

Sticky action bars should move above the mobile keyboard where needed.

---

# 55. Safe Areas and Device Behaviour

Support:

- iPhone safe-area insets
- Android gesture navigation
- Landscape camera mode
- Tablet split-screen
- Browser address-bar resizing
- Keyboard viewport changes

Bottom navigation and sticky actions must not be hidden behind device controls.

---

# 56. Data Density Guidelines

## Staff Screens

- Low to medium density
- Large controls
- Focused content
- Fewer columns
- Larger spacing

## Admin Screens

- Medium density
- More filters
- Compact tables
- More information visible
- Still readable and accessible

Do not reuse one density level for every role.

---

# 57. Design of Sensitive Data

Customer phone, address, photos, and location should not be unnecessarily exposed.

Recommendations:

- Mask phone in large shared screens when full value is unnecessary.
- Show photos only in details.
- Show GPS map only to authorized users.
- Avoid location coordinates in list tables.
- Use permission label on sensitive sections.
- Show download/export warning where appropriate.

---

# 58. Print Design

Reports and invoices should have dedicated print styles.

Print requirements:

- White background
- Remove navigation
- Remove interactive controls
- Preserve headings
- Repeat table headers
- Avoid clipped rows
- Use page breaks intentionally
- Use readable black text
- Include selected filters and generation date
- Avoid printing hidden personal data unexpectedly

---

# 59. Suggested Component Inventory

The design system should include:

- AppShell
- MobileHeader
- DesktopHeader
- Sidebar
- BottomNavigation
- PageHeader
- Breadcrumbs
- Button
- IconButton
- Input
- CurrencyInput
- PhoneInput
- RegistrationInput
- Textarea
- Select
- Combobox
- DatePicker
- SearchBar
- FilterBar
- FilterSheet
- Card
- MetricCard
- JobCard
- CustomerCard
- VehicleCard
- ServiceCard
- PaymentCard
- StatusBadge
- LocationBadge
- Stepper
- Tabs
- Table
- Pagination
- Accordion
- Timeline
- TimerDisplay
- PriceSummary
- FileUploader
- CameraCapture
- PhotoPreview
- LocationCapture
- MapPreview
- AlertBanner
- Toast
- Modal
- BottomSheet
- ConfirmationDialog
- EmptyState
- ErrorState
- Skeleton
- ChartCard
- InvoicePreview
- AuditDiff
- PermissionGate

---

# 60. Design QA Checklist

Before approving each screen, verify:

## Layout

- Correct responsive behaviour
- No horizontal overflow
- Clear primary action
- Adequate spacing
- Content fits common mobile widths

## Typography

- Correct hierarchy
- No text below minimum size
- No clipped labels
- Monetary values aligned

## Colour

- Correct semantic use
- Contrast passes
- Status is not colour-only

## Interaction

- Hover, focus, disabled, loading, and error states
- Touch target size
- Confirmation for risk
- Back navigation
- Unsaved-change handling

## Content

- Clear labels
- Correct terminology
- No technical jargon
- Useful empty states
- Actionable errors

## Accessibility

- Keyboard
- Focus
- Screen-reader labels
- Error announcements
- Reduced motion

---

# 61. Screen Design Deliverables

The UI/UX design phase should produce:

1. Design tokens
2. Logo usage rules
3. Component library
4. Mobile application shell
5. Desktop application shell
6. Login screen
7. Staff Home
8. Admin Dashboard
9. Customer Search
10. Add Customer
11. Customer Profile
12. Vehicle Search
13. Add Vehicle
14. Vehicle Profile
15. New Wash wizard
16. Camera capture
17. GPS capture
18. Service selection
19. Discount selection
20. Job review
21. Active Jobs
22. Timer screen
23. Job details
24. Payment screen
25. Invoice preview
26. WhatsApp share
27. Staff Management
28. Service Management
29. Pricing
30. Coupon Management
31. Referral Management
32. Expense Management
33. Reports
34. Settings
35. Location Settings
36. Audit Logs
37. Loading states
38. Empty states
39. Error states
40. Confirmation dialogs
41. Mobile and desktop prototypes

---

# 62. Prototype Requirements

The clickable prototype should include at least these end-to-end flows:

## Flow 1 — New Customer Wash

Login → New Wash → Add Customer → Add Vehicle → Photo → GPS → Service → Review → Create → Start Timer

## Flow 2 — Complete and Pay

Active Job → End Wash → Billing → Payment → Invoice → WhatsApp

## Flow 3 — Returning Customer

Customer Search → Profile → Select Vehicle → New Wash → Apply Reward

## Flow 4 — Admin Pricing

Dashboard → Services → Edit Vehicle Pricing → Save

## Flow 5 — Admin Expense and Report

Expenses → Add Expense → Dashboard → Report → Export

## Flow 6 — Error Recovery

Photo Upload Failure → Retry → Continue

## Flow 7 — GPS Warning

Poor Accuracy → Retry → Valid Location

---

# 63. Design Handoff Requirements

Every component and screen should provide:

- Desktop frame
- Tablet frame where different
- Mobile frame
- Component states
- Spacing measurements
- Typography token
- Colour token
- Radius
- Shadow
- Responsive rules
- Interaction notes
- Error behaviour
- Accessibility notes
- Empty state
- Loading state

Avoid giving developers only static screenshots.

---

# 64. Recommended Figma Structure

```text
00 Cover
01 Foundations
  - Colours
  - Typography
  - Spacing
  - Grid
  - Icons
  - Shadows
02 Components
  - Buttons
  - Inputs
  - Cards
  - Badges
  - Tables
  - Modals
  - Navigation
03 Staff Mobile
04 Staff Desktop
05 Admin Mobile
06 Admin Desktop
07 Workflows
08 Empty and Error States
09 Invoice and Print
10 Prototype
11 Archive
```

---

# 65. Design Approval Criteria

The design is approved when:

1. Staff can identify the next action immediately.
2. The New Wash flow is clear on mobile.
3. Camera and GPS states are understandable.
4. Job statuses are visually consistent.
5. Timer controls are safe and obvious.
6. Billing totals are easy to verify.
7. Partial payment and balance are clear.
8. Invoice actions are accessible.
9. Admin tables remain readable.
10. Financial screens distinguish revenue, expense, and profit.
11. Dangerous actions require confirmation.
12. All forms include validation states.
13. All major lists include empty and loading states.
14. Mobile navigation remains usable with one hand.
15. Desktop navigation supports efficient management.
16. Colour contrast is acceptable.
17. Status is not represented by colour alone.
18. Key screens are keyboard accessible.
19. Print layouts are defined.
20. The client approves brand direction.
21. The design matches product permissions.
22. The interface supports the defined application flow.
23. No visual element changes the documented business logic.
24. The complete component library is ready for implementation.

---

# 66. Final Design Summary

WashPro should use a clean, responsive, automotive-service interface with a water-inspired visual identity.

The design must prioritize:

- Fast Staff operation
- Clear job status
- Easy customer and vehicle search
- Reliable camera and GPS guidance
- Simple service selection
- Accurate and understandable billing
- Large timer controls
- Clear payment and invoice actions
- Readable Admin dashboards
- Safe financial management
- Consistent auditability
- Strong mobile usability
- Accessible interactions

The visual system should use:

- Deep navy structure
- Water-blue primary actions
- White working surfaces
- Light neutral backgrounds
- Strong semantic status colours
- Inter or Manrope typography
- Rounded but professional components
- Limited and purposeful motion
- Clear spacing and hierarchy

The finished product should feel like a purpose-built operational tool rather than a generic admin template.

This document should be used together with:

- `plan.md`
- `prd.md`
- `appflow.md`
- `techspec.md`
- `database.md`

as the complete design and implementation reference for WashPro.
