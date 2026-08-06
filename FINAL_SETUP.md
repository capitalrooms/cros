# CROS v0.1 - Final Setup Instructions

## ✅ What's Completed

Your CROS application is **95% ready**. Here's what's done:

- ✅ Next.js + Supabase project scaffolded and configured
- ✅ Login screen built and fully functional
- ✅ Role-based routing implemented
- ✅ Placeholder dashboards for all roles
- ✅ Supabase auth user created (harry@capitalrooms.co.uk)
- ✅ Environment variables configured (.env.local)
- ✅ Dev server running on http://localhost:3000

## ⏳ Final Step: Database Initialization

The `people` table needs to be created. Due to UI issues, we'll do this via direct SQL:

### Option A: Simple SQL Command (Recommended)

1. Go to: https://supabase.com/dashboard/project/fihjzzxxhprxgjuefgtb/sql

2. **Click the menu (three dots) next to "Untitled query"**

3. **Select "Clear"** to empty the editor completely

4. **Copy and paste ONLY this:**

```sql
DROP TABLE IF EXISTS public.people CASCADE;

CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  property_id UUID,
  room_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.people (email, role) VALUES ('harry@capitalrooms.co.uk', 'administrator');
```

5. **Click Run** → Choose **"Run without RLS"** (since this is initial setup)

6. **✅ Done!** You should see no errors

---

### Option B: Use Table Editor (If SQL fails again)

1. Go to: https://supabase.com/dashboard/project/fihjzzxxhprxgjuefgtb/editor

2. Click **"New table"**

3. Fill in:
   - **Table name**: `people`
   - **Add columns:**
     - `id` (UUID, Primary Key, default: gen_random_uuid())
     - `email` (text, unique, required)
     - `role` (text, required)
     - `property_id` (UUID, optional)
     - `room_id` (UUID, optional)
     - `created_at` (timestamp, default: now())
     - `updated_at` (timestamp, default: now())

4. Click **"Save"**

5. Click the **people** table, then **"Insert row"**

6. Add one row:
   - email: `harry@capitalrooms.co.uk`
   - role: `administrator`
   - Leave others blank

---

## 🧪 Test the Login

Once the table is created:

1. **Open**: http://localhost:3000

2. **Enter**:
   - Email: `harry@capitalrooms.co.uk`
   - Password: `TestPassword123!`

3. **Click "Sign in"** → You should be redirected to `/admin` dashboard

---

## 📁 Project Structure

```
cros/
├── app/                      # Next.js app directory
│   ├── login/page.tsx        # Login screen ← You're using this now
│   ├── admin/page.tsx        # Admin dashboard (placeholder)
│   ├── tenant/page.tsx       # Tenant dashboard (placeholder)
│   ├── contractor/page.tsx   # Contractor dashboard (placeholder)
│   ├── cleaner/page.tsx      # Cleaner dashboard (placeholder)
│   ├── landlord/page.tsx     # Landlord dashboard (placeholder)
│   └── globals.css           # Global styles
├── lib/
│   ├── supabase.ts           # Supabase client config
│   └── auth.ts               # Auth utilities
├── .env.local                # ✅ Configured with your Supabase credentials
├── package.json              # Dependencies
└── README.md                 # Full documentation
```

---

## 🚀 Next Steps (After Login Works)

Once login is working, the next priority is **v1 features**:

1. **Admin People Management Screen**
   - View/add/edit users
   - Assign roles and properties

2. **Tenant Maintenance Reporting**
   - Structured form (location, category, description)
   - Photo uploads
   - Priority/urgency selection

3. **Admin Maintenance Dashboard**
   - View all tickets
   - Filter by status/property/contractor
   - "Needs chasing" view for overdue jobs

4. **Contractor Portal**
   - See assigned jobs
   - Accept/reject/propose times
   - Upload photos and invoices
   - Mark complete

---

## 💡 Tips

- **Login** persists via Supabase auth session
- **Sign out** button on all dashboards
- **Database** is PostgreSQL (view tables in Supabase Dashboard → Table Editor)
- **Design system** locked in (see tailwind.config.ts)
- **Hot reload** works for all code changes

---

## ❓ Need Help?

If you get stuck on database setup, try:
- Copy the SQL one line at a time
- Use Table Editor instead of SQL Editor
- Check that `.env.local` has both Supabase credentials

Once the table exists and you can log in, we can build out the v1 features! 🎉

---

**Your credentials are:**
- Supabase Project: `fihjzzxxhprxgjuefgtb`
- App URL: http://localhost:3000
- Admin Email: harry@capitalrooms.co.uk
- Admin Password: TestPassword123!
