# Service-Role Key Rotation & Setup

**CRITICAL:** The `SUPABASE_SERVICE_ROLE_KEY` is the **highest-privilege secret** in your Supabase project — it bypasses all RLS policies. Treat it like a root password. It must be rotated if ever leaked, and it must be set correctly for background jobs (crons, batch operations) to work.

This project uses the **new Supabase API key format** (`sb_secret_…`). The old JWT format (`eyJ…`) is deprecated and will fail with "Invalid API key".

---

## When to rotate the key

- **On first setup** — set it in local dev and Vercel production
- **After an engineer leaves** — rotate immediately (team member may have seen it)
- **If ever leaked** — rotate at Supabase console immediately
- **On production security incident** — rotate all secrets
- **Annually** — best practice for long-lived secrets

---

## How to rotate (step-by-step)

### Step 1: Get the new key from Supabase

1. Open Supabase dashboard: https://supabase.com/dashboard
2. Select your project (Capital Rooms: `fihjzzxxhprxgjuefgtb`)
3. Go to **Settings** (bottom left) → **API** → **API Keys**
4. Find the **Secret keys** section (below Publishable keys)
5. Click the **copy icon** next to the `default` secret key (starts with `sb_secret_…`)
6. Your clipboard now has the key — **do not paste it anywhere visible** (terminal, chat, email, etc.)

### Step 2: Update local development (.env.local)

```bash
# In /Users/boo/Documents/Claude/cros directory
nano .env.local
# or open in editor

# Find the line: SUPABASE_SERVICE_ROLE_KEY=...
# Replace the entire value with the NEW key from your clipboard
# Do NOT add quotes around the key
# Save and close
```

**Verify locally:**
```bash
npm run doctor
# Should show: ✓ SUPABASE_SERVICE_ROLE_KEY present
# AND: ✓ service-role/secret key authenticates (bypasses RLS)
```

### Step 3: Update production (Vercel)

```bash
# Copy the same key to clipboard again (from Supabase)
cd /Users/boo/Documents/Claude/cros

# Remove the old (possibly dead) key and add the new one
npx vercel env rm SUPABASE_SERVICE_ROLE_KEY production -y

# Paste the key when prompted
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
# It will ask: "Which environments?" → type "production"
```

### Step 4: Redeploy production

```bash
npx vercel --prod --yes
```

Wait for deployment to finish (should take 1-2 min), then verify:

```bash
npm run doctor:prod
# Should show: healthy: true
# AND: service-role key authenticates
```

### Step 5: Verify background jobs work

After redeploy, manually trigger one of the jobs that depends on the service key:

```bash
# Test safety-check generation (uses service key)
curl -s -X POST https://cros-sigma.vercel.app/api/tenant-safety-checks/generate \
  -H "Content-Type: application/json" -d '{}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.success?'✓ works':'✗ FAILED:'+j.error)})"

# Or check the live health endpoint
curl -s https://cros-sigma.vercel.app/api/health | jq .healthy
# Should be true
```

---

## Troubleshooting

### "Invalid API key" error after rotation
- **Cause:** You copied from the wrong place or the key is truncated
- **Fix:** Go back to Supabase → Settings → API, re-copy the `sb_secret_…` key carefully
- **Verify:** The key should be ~90+ characters and start with `sb_secret_`

### npm run doctor still shows service key as invalid after setting it
- **Cause 1:** The env var isn't being read (not in .env.local, or path is wrong)
- **Cause 2:** Vercel env var hasn't propagated (takes 1-2 min after `npx vercel env add`)
- **Fix:** Wait 2 min, then run `npm run doctor:prod` again

### Cron jobs still failing after key rotation
- **Cause:** The cron job pod in Vercel might have cached the old env
- **Fix:** Manually re-trigger the cron or wait for the next scheduled run
- **Verify via:** `npm run doctor:prod` to confirm the key actually works

---

## What breaks if the service-role key is wrong/missing

The following features will **silently fail** (no error, just zero results):

1. **Tenant safety-check generation** — fire door / smoke alarm monthly checks won't be created
2. **Auto-file acknowledgments** — notes won't auto-file after 7 days
3. **Any future batch operations** that need to bypass RLS

These are **non-blocking errors** (they don't crash the app), which makes them especially dangerous at scale — users won't notice for weeks.

---

## How to prevent this in the future

1. **Pre-deploy health check** — `npm run doctor:prod` gates every Vercel deploy (catches dead keys before going live)
2. **Live monitoring** — `/api/health` endpoint is checked on every request; alerts if key fails
3. **Annual rotation reminder** — add to your calendar to rotate the key once per year, even if there's no incident

See `scripts/README.md` for how to use the health checks.
