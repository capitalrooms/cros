# CROS – Capital Rooms Operating System

A modern property management system built with Next.js and Supabase, designed to reduce admin overhead and automate operational workflows across maintenance, contractors, cleaning, tenants, and landlords.

## Project Status

**v0.1** — Login screen + role-based routing scaffold

- ✅ Shared login screen (email + password)
- ✅ Supabase auth integration
- ✅ Role-based dashboard routing
- ✅ Admin People management screen (coming soon)
- ⏳ Maintenance reporting (v1)
- ⏳ Admin dashboard (v1)
- ⏳ Contractor portal (v1)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([download](https://nodejs.org/))
- **npm** or **yarn** package manager

## Getting Started

### 1. Install Dependencies

```bash
cd cros
npm install
```

### 2. Set Up Supabase

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Copy your **Project URL** and **Anon Public Key** from the API settings
4. Create the `.env.local` file:

```bash
cp .env.local.example .env.local
```

5. Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_ADMIN_EMAIL=harry@capitalrooms.co.uk
```

### 3. Initialize the Database

1. In the Supabase dashboard, open the **SQL Editor**
2. Click **New Query**
3. Copy and paste the contents of `supabase/migrations/001_init_people_table.sql`
4. Click **Run**

This creates:
- `people` table (for user role assignments)
- Indexes for fast lookups
- Row-level security policies
- Auto-updating timestamps

### 4. Create Your First User (Admin)

In the Supabase SQL Editor, run:

```sql
-- Create auth user (via Supabase Auth UI or API)
-- Then add to people table:
insert into people (email, role) values
  ('harry@capitalrooms.co.uk', 'administrator');

-- Test users (optional)
insert into people (email, role) values
  ('tenant@example.com', 'tenant'),
  ('contractor@example.com', 'contractor'),
  ('cleaner@example.com', 'cleaner'),
  ('landlord@example.com', 'landlord');
```

### 5. Create Auth Users

In the Supabase dashboard:

1. Navigate to **Authentication** > **Users**
2. Click **Invite** (or use the Auth API to sign up)
3. Create a user with the email and password
4. User emails **must match** an entry in the `people` table

For development, you can also create a Supabase auth user via SQL:

```sql
select auth.create_user(
  email => 'harry@capitalrooms.co.uk',
  password => 'secure-password-here',
  email_confirm => true
);
```

### 6. Run the Development Server

```bash
npm run dev
```

The app will start at `http://localhost:3000`

## Login Flow

1. User visits the app → redirected to `/login`
2. Enters email + password
3. Supabase authenticates the user
4. App checks if email exists in `people` table
5. If recognized:
   - User is routed to their role-specific dashboard
   - **Admin** → `/admin`
   - **Tenant** → `/tenant`
   - **Contractor** → `/contractor`
   - **Cleaner** → `/cleaner`
   - **Landlord** → `/landlord`
6. If not recognized:
   - User sees: *"This email is not recognized. Please contact your property manager."*
   - User is signed out

## Project Structure

```
cros/
├── app/
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Root redirect (/ → /login or /dashboard)
│   ├── globals.css          # Global Tailwind styles
│   ├── login/
│   │   └── page.tsx         # Login screen
│   ├── dashboard/
│   │   └── page.tsx         # Role-based redirect
│   ├── admin/
│   │   └── page.tsx         # Admin dashboard (placeholder)
│   ├── tenant/
│   │   └── page.tsx         # Tenant portal (placeholder)
│   ├── contractor/
│   │   └── page.tsx         # Contractor portal (placeholder)
│   ├── cleaner/
│   │   └── page.tsx         # Cleaner portal (placeholder)
│   └── landlord/
│       └── page.tsx         # Landlord dashboard (placeholder)
├── lib/
│   ├── supabase.ts          # Supabase client initialization
│   └── auth.ts              # Authentication utilities
├── supabase/
│   └── migrations/
│       └── 001_init_people_table.sql  # Database schema
├── .env.local.example       # Environment template
├── tailwind.config.ts       # Tailwind CSS config
├── tsconfig.json            # TypeScript config
├── next.config.js           # Next.js config
├── package.json             # Dependencies
└── README.md                # This file
```

## Design System

The app follows a minimal, modern design inspired by Apple's aesthetic:

- **Spacing scale**: `xs` (4px), `sm` (8px), `md` (12px), `lg` (16px), `xl` (24px), `2xl` (32px), `3xl` (48px)
- **Typography scale**: `xs`, `sm`, `base`, `lg`, `xl`, `2xl`, `3xl`
- **Colors**: Neutral grays (50–900) + single accent color (blue, `#0066FF`)
- **Border radius**: `sm` (4px), `md` (6px), `lg` (8px)
- **Framework**: Tailwind CSS with a narrow, intentional config

All spacing and sizing use the custom scale defined in `tailwind.config.ts`.

## Development Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Type-check
npm run type-check
```

## Next Steps (v1)

### Admin Dashboard
- [ ] Maintenance ticket overview (Open / Awaiting / Booked / Completed / Cancelled)
- [ ] "Needs chasing" view for overdue contractor responses
- [ ] People/assignment management screen
- [ ] Chase action (re-send contractor notification)

### Tenant Maintenance Reporting
- [ ] Structured maintenance report form (location, category, photos, availability)
- [ ] Dynamic follow-up questions based on category
- [ ] Photo/video upload
- [ ] AI triage + priority suggestion

### Contractor Portal
- [ ] Assigned jobs list
- [ ] Accept / reject / propose time
- [ ] Add estimated cost + quote
- [ ] Upload before/after photos
- [ ] Mark complete + submit invoice

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, React 18
- **Backend/Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Hosting**: Vercel (recommended)
- **Email**: Resend (to be integrated)
- **AI**: Claude API (to be integrated)

## Deployment

### Deploy to Vercel

1. Push this repo to GitHub
2. Connect to [Vercel](https://vercel.com)
3. Set environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy

## Security Notes

- **Row-Level Security (RLS)** is enabled on the `people` table
- Users can only read their own assignment
- Only administrators can modify the `people` table
- Never commit `.env.local` with real credentials
- Use strong passwords in production

## Troubleshooting

### "Not recognized" error on login
- Check that the email exists in the `people` table
- Verify the email matches exactly (case-sensitive in Supabase)
- Check that the auth user was created with the correct email

### "Missing Supabase environment variables"
- Ensure `.env.local` exists and has both keys
- Restart the dev server after creating/updating `.env.local`

### Supabase connection issues
- Verify your Project URL and Anon Key in `.env.local`
- Check that your IP is not blocked (Supabase dashboard → Project Settings → Network)
- Ensure the `people` table migration has been run

## Questions & Open Items

See the build spec (`/docs/BUILD_SPEC.md`) for:
- 10ninety API data sync strategy
- Category question tree for maintenance reporting
- Exact tenant acknowledgment flow for property visits
- Further design direction and detailed feature specs

---

**Built by Capital Rooms**  
Questions? Contact harry@capitalrooms.co.uk
