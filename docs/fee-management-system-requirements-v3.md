# Fee Management System — Requirements Document
*Islamic (Hijri) Calendar-Based Student Billing System*

**Version:** 1.0
**Date:** August 14, 2026
**Status:** Finalized requirements — ready as basis for schema and build

**What changed:** Non-Tuition fees (Books, Exam, Uniform, Bag) are no longer enrollment-based with a pre-generated yearly bill. They're now a **collection flow**: Admin picks the fee type at the moment a student comes to pay, the system shows fee-type-specific variant fields (book/course, uniform size), auto-populates the configured price, and the bill + payment are created together, already Paid. Tuition is unaffected — still enrollment-based, still 12 monthly bills, still the only fee type with late fees.

---

## 1. Purpose & Scope

### 1.1 Purpose
This document defines the requirements for a student fee billing and payment-tracking system. Its defining feature is that the academic year and billing cycle follow the Hijri (Islamic lunar) calendar rather than the Gregorian calendar.

### 1.2 In Scope
- Student record management
- Academic year setup on a Hijri-month billing cycle
- **Tuition**: enrollment-based, billed monthly, 12 bills/year, per-grade pricing, late fees on overdue bills (see FR-4, FR-10)
- **Books, Exam, Uniform, Bag**: not enrollment-based — collected via a pay-as-you-go flow where Admin selects the fee type and variant at the point of payment, and price auto-populates from Settings (see FR-12)
- Per-student payment tracking and permanent, cross-year payment history
- Search and reporting
- Admin settings for fee types, Tuition per-grade pricing, non-Tuition variant pricing, and the late-fee rule

### 1.3 Out of Scope (Initial Release)
Discounts, partial payments, online payment gateway integration (though the system is built with a hook ready for one), a parent portal, and multi-branch support — see Section 7.

### 1.4 Intended Audience
Institution administrators (the system's users) and whoever builds the system (the primary readers of this document).

---

## 2. Definitions

| Term | Meaning |
|---|---|
| Academic Year | One billing cycle: Shawwal through Ramadan (12 Hijri months) |
| Hijri Month | A named lunar-calendar month, used here as a billing-period label rather than an astronomically computed date |
| Fee Type | A category of charge — Tuition, Books, Exam, Uniform, Bag. Tuition is enrollment-based and Monthly; the other four are collected ad-hoc via FR-12 |
| Fee Item | A priced variant within a non-Tuition fee type — e.g. a specific book/course under Books, or a size under Uniform. Exam and Bag each have one standard Fee Item |
| Bill | One fee obligation for one student, for one fee type. For Tuition, 12 bills/year (one per Hijri month). For a non-Tuition fee type, one bill is created per collection event, at the moment of payment |
| Late Fee | An extra charge applied to a Tuition bill that remains unpaid past its due date, per the system-wide rule configured in Settings (see FR-10). Never applies to Books, Exam, Uniform, or Bag |
| Payment | A recorded transaction against a bill |

---

## 3. User Roles

- **Admin** — the only role in the initial release, one shared login. Full access to students, academic years, billing, payments, search, reports, and settings.
- *(Future: a read-only parent role — see Section 7.)*

---

## 4. Functional Requirements

### 4.1 Dashboard — FR-1
- FR-1.1 Show total active students
- FR-1.2 Show total fees collected, current academic year (all fee types combined)
- FR-1.3 Show total Tuition fees pending, current academic year
- FR-1.4 Show count of students with at least one pending Tuition month
- FR-1.5 Show the current academic year

### 4.2 Student Management — FR-2
- FR-2.1 Create, view, edit, and deactivate student records
- FR-2.2 Fields: student ID (system-generated), name, father's name, phone, class, admission date, status
- FR-2.3 Each student's billing history is linked across every academic year they've been enrolled in

### 4.3 Academic Year Management — FR-3
- FR-3.1 Admin can create a new academic year (e.g. "2025–2026")
- FR-3.2 Every academic year automatically contains 12 billing periods, in order: Shawwal, Dhul-Qadah, Dhul-Hijjah, Muharram, Safar, Rabi' al-Awwal, Rabi' al-Thani, Jumada al-Ula, Jumada al-Akhirah, Rajab, Sha'ban, Ramadan — no manual month creation needed
- FR-3.3 Ramadan is included as the 12th billing period, placed right after Sha'ban
- FR-3.4 A new academic year always starts at Shawwal, immediately after the previous year's Ramadan
- FR-3.5 Once a new academic year starts, prior years are frozen — their bills and payments never change
- FR-3.6 Admin can select any academic year for a student and see only that year's 12 Tuition months and statuses; other years stay out of view until selected

### 4.4 Tuition Billing — FR-4
- FR-4.1 Enrolling a student in an academic year auto-generates 12 Tuition bills, one per Hijri month, all status "Pending". Tuition is the only fee type that works this way — Books, Exam, Uniform, and Bag are never pre-generated (see FR-12)
- FR-4.2 Admin can view a student's academic year Tuition breakdown: 12 rows, month name and status (Paid/Pending/Overdue), and mark any pending month paid in one action
- FR-4.3 A Tuition bill's assigned billing month is fixed at creation and independent of when it's actually recorded or paid — e.g. if one month's Tuition isn't collected until the following month, the bill still shows as belonging to the original month, not the later one. Admin cannot manually move a bill to a different month

### 4.5 Payment Recording — FR-5
- FR-5.1 Recording a payment captures: amount, date, mode (cash/UPI/bank), reference/receipt number, remarks
- FR-5.2 Saving a payment automatically flips the corresponding bill to "Paid"
- FR-5.3 Tuition amount is set per grade (class), not a flat amount across all students, and configured in Settings (see FR-11)

### 4.6 Payment History — FR-6
- FR-6.1 Every payment is retained permanently; nothing is ever deleted
- FR-6.2 History is viewable per student, across all academic years, showing fee type, month (Tuition only), status, amount, and date

### 4.7 Search — FR-7
- FR-7.1 Search students by name, phone number, student ID, or class

### 4.8 Reports — FR-8
- FR-8.1 Paid/pending Tuition students, by academic year
- FR-8.2 Collected fees, broken down by fee type (Tuition, Books, Exam, Uniform, Bag)
- FR-8.3 Outstanding Tuition fees (Books/Exam/Uniform/Bag have no outstanding state — they're collected at time of payment, see FR-12)
- FR-8.4 Per-academic-year summary
- FR-8.5 Individual student ledger, across all fee types
- FR-8.6 Export any report to PDF and Excel
- FR-8.7 PDF/Excel exports break down non-Tuition collections by Fee Item too (e.g. how much came from Uniform size M vs. size L, which books sold and how many)

### 4.9 Fee Types — FR-9
- FR-9.1 The system supports multiple fee types — Tuition, Books, Exam, Uniform, Bag — configurable by admin rather than hardcoded. Admin can add, rename, or retire fee types
  - FR-9.1a Tuition is **enrollment-based**: a student is enrolled in it per academic year, and 12 bills auto-generate (FR-4.1)
  - FR-9.1b Books, Exam, Uniform, and Bag are **collection-based**: there is no enrollment step; a bill is created only when Admin collects that payment for a student (FR-12)
- FR-9.2 Every active student is implicitly enrolled in Tuition for the academic year (no separate opt-out step in this release)
- FR-9.3 When recording a non-Tuition payment, admin selects the fee type from a dropdown (Books/Exam/Uniform/Bag), then the Fee Item within it (FR-12)

### 4.10 Late Fees — FR-10
- FR-10.1 Late fees apply to **Tuition only**. Books, Exam, Uniform, and Bag never accrue a late fee — they have no due date to be overdue against, since they're created and paid in the same action (FR-12)
- FR-10.2 Admin configures the Tuition late-fee rule in Settings (see FR-11.3): a grace period (days after due date) and a late-fee amount (flat ₹ amount or % of the bill)
- FR-10.3 A Tuition bill still in "Pending" status past its due date + grace period is automatically flagged "Overdue" and the configured late fee is added to the amount owed
- FR-10.4 The late fee is shown as a separate line item on the bill/receipt, distinct from the base Tuition amount, so the ledger shows what was charged for tuition vs. what was charged for lateness
- FR-10.5 Paying an overdue Tuition bill requires paying the base amount + late fee together (no partial payment — see Section 7); saving the payment flips the bill to "Paid"
- FR-10.6 Reports and exports (FR-8) can show late fees collected as their own figure, separate from base fee collections

### 4.11 Non-Tuition Fee Collection Flow — FR-12
- FR-12.1 When a student comes to pay a non-Tuition fee, Admin first selects the **Fee Type** from a dropdown: Books, Exam, Uniform, or Bag
- FR-12.2 Based on the selected fee type, the system shows the relevant selector:
  - **Books** → a Course/Book dropdown (e.g. "Course 5 – Mathematics"), one entry per configured book
  - **Uniform** → a Size dropdown (S, M, L, XL, XXL)
  - **Exam** → no selector; one standard Fee Item
  - **Bag** → no selector; one standard Fee Item
- FR-12.3 Once Admin selects the required detail (book, size, or the standalone item for Exam/Bag), the system automatically fetches and populates the price configured for that Fee Item in Settings (FR-11.5) — Admin does not manually type an amount
- FR-12.4 Admin reviews the auto-populated amount and confirms; confirming creates the bill and records the payment in the same action — the bill is created already "Paid," there is no intermediate "Pending" state for non-Tuition fees
- FR-12.5 Recording a non-Tuition payment still captures date, mode (cash/UPI/bank), reference/receipt number, and remarks, same as FR-5.1
- FR-12.6 Each non-Tuition payment is linked to the student and academic year, so it appears correctly in that student's ledger (FR-6.2) and in fee-type/Fee-Item breakdowns (FR-8.7)

### 4.12 Settings — FR-11
- FR-11.1 A Settings area where admin manages system-wide configuration, replacing any hardcoded values
- FR-11.2 **Fee types:** add, rename, retire a fee type; mark it enrollment-based (Tuition-style) or collection-based (FR-12-style)
- FR-11.3 **Late fee rule:** set the Tuition grace period (days) and late-fee amount (flat ₹ or %). This is the single system-wide Tuition late-fee rule — not configurable per grade
- FR-11.4 **Tuition per-grade pricing:** for each grade (class), set the monthly Tuition amount. Changing an amount only affects bills generated after the change — bills already issued keep their original amount (FR-4.3 pattern)
- FR-11.5 **Non-Tuition Fee Item pricing:** for Books, add/edit/retire individual book/course entries and their price; for Uniform, set the price per size (S/M/L/XL/XXL); for Exam and Bag, set the single standard price. These prices are not per-grade — they apply however the Fee Item is configured, and changes only affect payments collected after the change

---

## 5. Data Model

| Entity | Key Fields |
|---|---|
| Student | id, student_code, name, father_name, phone, class, status, created_at |
| AcademicYear | id, year_name, start_month, end_month, status |
| HijriMonth | id, month_name, sequence (1–12) |
| FeeType | id, name, description, mode (Enrollment / Collection) |
| ClassFee | id, academic_year_id, class_name, monthly_amount *(Tuition only)* |
| FeeItem | id, fee_type_id, label (e.g. "Course 5 – Mathematics", "Size M", "Standard"), price, active *(Books/Exam/Uniform/Bag only)* |
| LateFeeSetting | id, grace_period_days, late_fee_type (Flat / Percent), late_fee_value *(single system-wide row, Tuition only)* |
| MonthlyBill | id, student_id, academic_year_id, month_id (Tuition only, null otherwise), fee_type_id, fee_item_id (non-Tuition only, null for Tuition), amount, late_fee_amount, status (Pending / Paid / Overdue), due_date |
| Payment | id, bill_id, payment_date, amount, payment_mode, receipt_no, remarks |

- `FeeType.mode` distinguishes Tuition (**Enrollment**: bills auto-generate at enrollment, FR-4.1) from Books/Exam/Uniform/Bag (**Collection**: bill created at the point of payment, FR-12.4).
- `ClassFee` now applies to Tuition only — per-grade, per-academic-year monthly amount.
- `FeeItem` holds the priced variants for non-Tuition fee types — one row per book, one row per uniform size, one "Standard" row each for Exam and Bag. `MonthlyBill.amount` for these is copied from `FeeItem.price` at the moment of collection.
- For a non-Tuition `MonthlyBill`, `month_id` is null (no monthly concept) and `status` is created directly as "Paid" — there's no pending window (FR-12.4).
- `LateFeeSetting` remains a single system-wide row, Tuition only (FR-10.1/FR-11.3), unaffected by this version's changes.

---

## 6. Non-Functional Requirements

- **NFR-1 Data integrity** — payment history is append-only; no record is ever edited away or deleted. A Tuition bill's `late_fee_amount` and "Overdue" status are system-set updates to the bill itself (not a payment record), applied automatically once past due date + grace period — this is the one exception to "bills don't change after creation" (FR-4.3), scoped narrowly to late-fee application
- **NFR-2 Locale** — amounts in INR (₹) only; payment/due dates in Gregorian format, billing periods labeled with Hijri month names
- **NFR-3 Authentication** — admin login required (e.g. JWT-based sessions)
- **NFR-4 Auditability** — every payment action should be traceable to who made it and when (groundwork for the future audit-log feature)
- **NFR-5 Scale** — should comfortably handle a few hundred to low thousands of student records without degrading

---

## 7. Out of Scope — Future Enhancements

- Discounts and scholarships
- Partial payments
- SMS/WhatsApp payment reminders
- Online payment gateway (UPI, Razorpay, Stripe) — deferred, but the payment module should be structured so this can be plugged in later without a redesign
- QR-coded receipts
- Parent portal (read-only history)
- Admin mobile app
- Multi-branch/multi-campus support
- Full audit logs
- Automatic Hijri↔Gregorian date conversion
- Late fees on non-Tuition fee types (Books, Exam, Uniform, Bag)
- Per-grade or per-fee-type late-fee rules (late fee is a single system-wide Tuition rule, not customizable per grade)
- A "Pending" or pre-issued state for non-Tuition fees — Books/Exam/Uniform/Bag bills are always created at the moment of collection (FR-12)
- Per-grade pricing for non-Tuition fees — those are priced per Fee Item (book/size/standard), not per grade

---

## 8. Suggested Technical Architecture *(proposed, not final)*

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Auth | JWT |
| Reports | PDF + Excel export |
| Deployment | Docker + Nginx |

---

## 9. Indicative Timeline

- **MVP** (student management, academic years, Tuition billing, non-Tuition collection flow, payment history, basic reports): 2–4 weeks
- **Production-ready** (hardened auth, backups, exports, receipts, polish): 6–10 weeks

*Note: scope includes Tuition's enrollment-based monthly billing with late fees (FR-4, FR-10), plus a separate collection-flow model for Books/Exam/Uniform/Bag with variant-level pricing (FR-12), and a Settings module (FR-11) covering both pricing models.*
