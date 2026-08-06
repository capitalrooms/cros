# Quick Start Setup

## 1. Install Node.js

Download and install **Node.js 18+** from https://nodejs.org/

Verify installation:
```bash
node --version
npm --version
```

## 2. Install Dependencies

```bash
cd cros
npm install
```

## 3. Create Supabase Project

1. Go to https://supabase.com and sign up
2. Create a new project
3. Wait for it to initialize
4. In **Settings → API**, copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **Anon Public Key** (starts with `eyJhbGc...`)

## 4. Set Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and paste your credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_ADMIN_EMAIL=harry@capitalrooms.co.uk
```

## 5. Initialize Database

1. In Supabase, go to **SQL Editor**
2. Click **New Query**
3. Paste contents of `supabase/migrations/001_init_people_table.sql`
4. Click **Run**

## 6. Create First Auth User

In Supabase, go to **Authentication → Users** and click **Invite**.

Or via SQL Editor, run:

```sql
select auth.create_user(
  email => 'harry@capitalrooms.co.uk',
  password => 'choose-a-password',
  email_confirm => true
);
```

Then add to `people` table:

```sql
insert into people (email, role) values
  ('harry@capitalrooms.co.uk', 'administrator');
```

## 7. Run Dev Server

```bash
npm run dev
```

Visit http://localhost:3000

## Test Login

- **Email**: `harry@capitalrooms.co.uk`
- **Password**: (whatever you set above)
- Expected: Redirects to `/admin` dashboard

---

**You're all set!** The login screen is ready. Next step is building the admin People management screen.
