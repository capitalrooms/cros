#!/usr/bin/env node
// Checks PRODUCTION health by hitting the deployed /api/health endpoint, which
// runs the checks server-side with the real (Sensitive) Vercel env values —
// the only place prod key validity can actually be verified.
//
// Usage: npm run doctor:prod  [-- <base-url>]   (default: cros-sigma.vercel.app)

const base = process.argv[2] || 'https://cros-sigma.vercel.app';
const secret = process.env.CRON_SECRET; // optional: enables per-check detail

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', dim: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

const res = await fetch(`${base}/api/health?full=1`, {
  headers: secret ? { authorization: `Bearer ${secret}` } : {},
}).catch((e) => { console.error(`${C.r}Could not reach ${base}/api/health:${C.x} ${e.message}`); process.exit(1); });

const j = await res.json();
console.log(`${C.b}Production health${C.x}  ${C.dim}${base}${C.x}   ${j.healthy ? `${C.g}healthy${C.x}` : `${C.r}UNHEALTHY${C.x}`}  ${C.dim}(${j.errors} errors, ${j.warnings} warnings)${C.x}`);

if (Array.isArray(j.checks)) {
  for (const c of j.checks) {
    const mark = c.ok ? `${C.g}✓${C.x}` : c.level === 'warn' ? `${C.y}⚠${C.x}` : `${C.r}✗${C.x}`;
    console.log(`  ${mark} ${c.name}${c.detail ? `  ${C.dim}${c.detail}${C.x}` : ''}`);
  }
} else if (Array.isArray(j.failing) && j.failing.length) {
  for (const f of j.failing) console.log(`  ${f}`);
  if (j.note) console.log(`  ${C.dim}${j.note}${C.x}`);
}

process.exit(j.healthy ? 0 : 1);
