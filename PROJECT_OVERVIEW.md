# CROS Project Overview

## What's Been Built (v0.1)

### ✅ Complete

**1. Project Scaffold**
- Next.js 14 with TypeScript, Tailwind CSS
- Supabase integration (auth + Postgres)
- Environment configuration template
- Design system (minimalist, neutral + accent color)

**2. Login Screen**
- Email + password authentication
- Supabase Auth integration
- Error messaging:
  - Invalid credentials: "Invalid email or password"
  - Email not recognized: "This email is not recognized. Please contact your property manager."
- Minimal, Apple-like design (generous whitespace, clear type hierarchy)
- Responsive (works on mobile, tablet, desktop)

**3. Role-Based Routing**
- After login, user is checked against `people` table
- Automatic redirect to role-specific dashboard:
  - Administrator → `/admin`
  - Tenant → `/tenant`
  - Contractor → `/contractor`
  - Cleaner → `/cleaner`
  - Landlord → `/landlord`
- Sign-out functionality on all dashboards

**4. Database Setup**
- `people` table with:
  - `id` (UUID primary key)
  - `email` (unique, indexed)
  - `role` (administrator/tenant/contractor/cleaner/landlord)
  - `property_id`, `room_id` (for future scoping)
  - `created_at`, `updated_at` (auto-managed)
- Row-level security (RLS) enabled:
  - Users can read only their own record
  - Only admins can insert/update/delete
- Indexes on `email`, `property_id`, `role` for performance

**5. Placeholder Dashboards**
- Each role has a minimal dashboard with sign-out
- Sections marked "Coming soon" for future features

---

## Next Steps (v1 Priority Order)

### 1️⃣ Admin People Management Screen

**What it does:**
- Admin can view all users (email, role, property, room)
- Admin can add new people (email → role assignment)
- Admin can edit/delete existing assignments
- Search/filter by email, role, property

**Why first:**
- Unblocks local testing without manually editing database
- Enables setting up test users for each role
- Required before tenant/contractor/cleaner invite flows

**Estimated scope:**
- 1–2 hours
- Reusable table component (will use for other admin screens)
- CRUD forms

### 2️⃣ Tenant Maintenance Reporting (Form + Submission)

**What it does:**
- Tenant taps "Report Maintenance"
- Form flow:
  - Select location (their room, or communal area)
  - Select category (Plumbing / Electrical / Appliance / Window / Heating / Garden / Internet / Other)
  - Dynamic follow-up questions based on category (from configurable DB tree)
  - Optional troubleshooting checkpoint (e.g., "is the boiler plugged in?" → close if yes)
  - Photo/video upload
  - Description (optional)
  - Set availability + urgency
  - Submit → ticket created

**Why second:**
- Core feature that drives the whole system
- Creates data that other features depend on
- Can test end-to-end with admin + contractor portals

**Estimated scope:**
- 3–4 hours
- Reusable file upload component
- Category question tree stored in DB (initially hardcoded for v1, but schema-ready for later config)

### 3️⃣ Admin Maintenance Dashboard

**What it does:**
- Single view of all tickets:
  - Open / Awaiting Contractor / Booked / Completed / Waiting Invoice / Cancelled
  - Filterable by property, contractor, priority, date
  - Special "needs chasing" view (contractor hasn't responded in X hours)
- Click a ticket to see:
  - Timeline (events + status changes)
  - Messages
  - Photos
  - Contractor notes
  - Invoices & costs
  - History
- Chase action (re-send contractor notification link)

**Why third:**
- Follows naturally from maintenance reporting
- Provides visibility into ticket lifecycle
- Enables "chase" feature (critical for contractor follow-up)

**Estimated scope:**
- 4–5 hours
- Table component, timeline component, modal for detail view
- Filter/sort logic

### 4️⃣ Contractor Portal

**What it does:**
- Contractor sees only assigned jobs
- Can accept / reject / propose different time
- Can add estimated cost + upload quote
- Can upload before-and-after photos
- Can mark complete + upload invoice
- On accept → tenant is auto-notified of appointment time
- On reschedule → tenant is auto-notified

**Why fourth:**
- Completes the core maintenance workflow (report → assign → contractor action → complete)
- Enables actual work to be done in the system

**Estimated scope:**
- 3–4 hours
- Reusable job card component
- Status transitions (accept/reject/complete)
- Notifications (stub for now, full integration in v2)

---

## Tech Decisions Locked In

### Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, React 18
- **Backend**: Supabase (PostgreSQL + Auth)
- **Hosting**: Vercel (recommended)
- **Design**: Narrow Tailwind config (intentional, no sprawl)

### Architecture
- One shared login screen for all roles (no self-registration)
- Admin pre-assigns roles via People screen
- Event-driven pattern (event created → acknowledgment → notifications → next steps)
- RLS on Supabase tables for security

### Design Direction
- Minimalist, Apple-like: generous whitespace, one accent color, clear hierarchy
- No unnecessary borders, shadows, or gradients
- Custom spacing/type scales (not default Tailwind)

---

## Data Model (at a glance)

```
people
├── id (UUID)
├── email (unique)
├── role (enum)
├── property_id (nullable)
├── room_id (nullable)
├── created_at, updated_at

maintenance_tickets (to be created)
├── id (UUID)
├── property_id
├── room_id (nullable, for communal areas)
├── tenant_id (FK → people)
├── contractor_id (FK → people, nullable)
├── category
├── status (open/awaiting/booked/completed/cancelled)
├── urgency
├── priority (AI-suggested, human override)
├── description
├── photos (store URLs, metadata in DB)
├── tenant_availability
├── created_at, updated_at, completed_at

maintenance_messages (to be created)
├── Supports timeline in detail view

maintenance_invoices (to be created)
├── cost, date, contractor notes
```

---

## Environment & Running Locally

### Prerequisites
- Node.js 18+
- Supabase account (free tier is fine)

### First-Time Setup
1. `npm install`
2. Create `.env.local` with Supabase credentials
3. Run SQL migration in Supabase
4. `npm run dev` → http://localhost:3000

### Rapid Testing
Once Node.js is installed, the dev server starts in ~5 seconds. Hot reload works for all changes.

---

## Known Open Questions

From the build spec:

1. **10ninety API**: How to sync rent/tenancy data. Scope: v3.
2. **Question tree**: Exact maintenance categories and follow-up questions. Needs real-world testing in v1.
3. **Property visits**: Do tenants get advance notice? How much detail? Scope: v2.
4. **Voice-to-text**: Contractor voice notes → transcription → AI-tidied. Scope: v3.

---

## What NOT to Build Yet

- 10ninety API integration (v3)
- Landlord dashboard (v3)
- House notices / guides (v2)
- Cleaner portal (v2)
- Notice-to-leave flow (v2)
- Google Calendar sync (v2)
- Email sending (placeholder only, v2+)
- AI triage (placeholder only, v1.5+)
- WhatsApp integration (v3+, if at all)

---

## Success Criteria for v1

By end of v1, you should be able to:

✅ Log in as any role  
✅ Add/edit people (admin)  
✅ Report maintenance (tenant)  
✅ See all tickets (admin)  
✅ Chase overdue contractors (admin)  
✅ Accept/reject jobs and mark complete (contractor)  
✅ See appointment confirmations sent (tenant)  

This unlocks real testing and daily use for a small property with 1–2 contractors.

---

**Ready?** Start with Admin People Management screen.  
Questions? Look at the full spec: `/docs/BUILD_SPEC.md`
