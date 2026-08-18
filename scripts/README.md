# Ops scripts

## Health checks — run these before trusting a deploy

Both enforce `lib/schema-manifest.json` (the DB contract) and validate API keys.
They catch the classes of **silent failure** that have bitten this project: dead/
empty API keys, missing tables, and wrong column names (e.g. `tenant_id` vs
`person_id`).

```bash
npm run doctor        # checks LOCAL env (.env.local) + live DB schema
npm run doctor:prod   # checks PRODUCTION via the deployed /api/health endpoint
```

- `doctor` exits non-zero if anything is broken — safe to use in a pre-push hook
  or CI.
- `doctor:prod` hits `https://cros-sigma.vercel.app/api/health`, which runs the
  same checks **server-side on Vercel** (the only place the Sensitive prod key
  values can be verified). Set `CRON_SECRET` in your shell to get per-check detail.

### The live health endpoint
- `GET /api/health` → `{ healthy, errors, warnings, failing[] }` — safe to expose;
  point uptime monitoring at it. Returns HTTP 503 when unhealthy.
- `GET /api/health?full=1` with `Authorization: Bearer <CRON_SECRET>` → per-check detail.
- Never returns secret values, only pass/fail.

### When the doctor reports a problem
- **service-role key INVALID** → the `SUPABASE_SERVICE_ROLE_KEY` is dead/empty.
  This project migrated to Supabase's new API keys, so the value must be the
  `sb_secret_…` key (Supabase → Settings → API → Secret keys), set in Vercel
  (prod) and `.env.local` (local). The old legacy `eyJ…` JWT service_role key is
  disabled and returns "Invalid API key".
- **table missing** → a migration was never applied. See `supabase/migrations/README.md`
  and run `npm run db:migrate`.
- **missing columns** → code references a column not in the live schema; fix the
  code or add a migration.

### Adding to the contract
When code starts depending on a new table/column, add it to
`lib/schema-manifest.json`. Both checkers pick it up automatically.

## Migrations
See `supabase/migrations/README.md`. Runner: `npm run db:migrate` (+ `:list`, `:check`, `:test`).
