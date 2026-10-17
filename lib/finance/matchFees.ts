// Match each room row's management / letting fee from its statement's own lines — the rule behind
// /api/admin/reconciliation/fees (17 Oct 2026). plan() only reads; the route writes what it returns.
import type { SupabaseClient } from '@supabase/supabase-js'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const roomOf = (d: string) => { const m = d.match(/\bRoom\s*(\d+)\b/i) || d.match(/#(\d+)\b/); return m ? parseInt(m[1], 10) : null }
const words = (v: string) => String(v ?? '').toLowerCase().replace(/^(mr|mrs|miss|ms|dr|mx)\.?\s+/, '').split(/[^a-z]+/).filter(w => w.length > 1)

export async function planFeeMatch(s: SupabaseClient) {
  const { data: lines } = await s.from('statement_line_items').select('id, statement_id, category, description, amount')
  const { data: rows } = await s.from('landlord_statement_rooms').select('id, statement_id, room_number, tenant_name, rent_income, management_fee, letting_fee, other_deductions, net_to_landlord')
  const recat: { id: string; to: string }[] = []
  const byStmt = new Map<string, any[]>()
  for (const l of (lines ?? []) as any[]) {
    const d = String(l.description ?? '')
    const to = /\bmanagement\s+fee\b/i.test(d) ? 'management_fee' : /\bletting\s+fee\b/i.test(d) ? 'letting_fee' : null
    if (to && l.category !== to) { recat.push({ id: l.id, to }); l.category = to }
    byStmt.set(l.statement_id, [...(byStmt.get(l.statement_id) ?? []), l])
  }
  const rowFix: { id: string; management_fee: number; letting_fee: number; net_to_landlord: number }[] = []
  const held: string[] = []
  const stmts = new Set<string>()
  // each fee line goes to ONE room row: same room number, the tenant it names, and — when a room has two rent lines
  // (a part month and a full one) — the rent it is that percentage of ("Management Fee (12%)" → 12% of which rent)
  const rowsByStmt = new Map<string, any[]>()
  for (const r of (rows ?? []) as any[]) rowsByStmt.set(r.statement_id, [...(rowsByStmt.get(r.statement_id) ?? []), r])
  const name = (v: string) => words(v).filter(w => w !== 'room' && !/^\d+$/.test(w))
  for (const [sid, rs] of rowsByStmt) {
    const got = new Map<string, { m: number; l: number }>()
    for (const l of (byStmt.get(sid) ?? []).filter(x => x.category === 'management_fee' || x.category === 'letting_fee')) {
      const d = String(l.description), room = roomOf(d)
      let cands = rs.filter(r => Number(r.room_number) === room)
      const named = cands.filter(r => name(r.tenant_name).some(w => words(d).includes(w)))
      if (named.length) cands = named
      if (!cands.length) continue
      const pct = Number(d.match(/\((\d+(?:\.\d+)?)\s*%/)?.[1] ?? NaN) / 100
      const pick = cands.length === 1 ? cands[0]
        : l.category === 'management_fee' && pct > 0
          ? [...cands].sort((x, y) => Math.abs(Number(l.amount) - Number(x.rent_income) * pct) - Math.abs(Number(l.amount) - Number(y.rent_income) * pct))[0]
          : [...cands].sort((x, y) => Number(y.rent_income) - Number(x.rent_income))[0]
      const g = got.get(pick.id) ?? { m: 0, l: 0 }
      if (l.category === 'management_fee') g.m += Number(l.amount || 0); else g.l += Number(l.amount || 0)
      got.set(pick.id, g)
    }
    for (const r of rs) {
      const g = got.get(r.id)
      // only fill in a fee the statement actually shows for that room — never wipe one that's already set
      const nextM = g && g.m > 0 ? r2(g.m) : Number(r.management_fee || 0), nextL = g && g.l > 0 ? r2(g.l) : Number(r.letting_fee || 0)
      const net = r2(Number(r.rent_income || 0) - nextM - nextL - Number(r.other_deductions || 0))
      const changes = Math.abs(nextM - Number(r.management_fee || 0)) > 0.005 || Math.abs(nextL - Number(r.letting_fee || 0)) > 0.005 || Math.abs(net - Number(r.net_to_landlord || 0)) > 0.005
      // a fee bigger than the rent is left for a person to check against the PDF (LS1057: the agent's own statement
      // shows a £412.50 "management fee" on £190 rent)
      if (changes && net < 0) { held.push(r.id); continue }
      if (changes) {
        rowFix.push({ id: r.id, management_fee: nextM, letting_fee: nextL, net_to_landlord: net }); stmts.add(sid)
      }
    }
  }
  for (const x of recat) { const l = (lines ?? []).find((y: any) => y.id === x.id) as any; if (l) stmts.add(l.statement_id) }
  return { recat, rowFix, held, stmts: [...stmts], byStmt }
}

