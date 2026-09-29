import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from   = searchParams.get('from')  || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const to     = searchParams.get('to')    || new Date().toISOString().slice(0, 10)
  const search = searchParams.get('search') || ''

  // Two-step: find matching statement IDs first, then fetch LSR rows
  const { data: stmts, error: stmtErr } = await supabase
    .from('landlord_statements')
    .select('id')
    .gte('period_end', from)
    .lte('period_end', to)
  if (stmtErr) return NextResponse.json({ error: stmtErr.message }, { status: 500 })

  const stmtIds = (stmts || []).map((s: any) => s.id)
  if (stmtIds.length === 0) return NextResponse.json({ from, to, properties: [], totals: { management_fee: 0, letting_fee: 0 } })

  const { data: lsrRows, error } = await supabase
    .from('landlord_statement_rooms')
    .select(`
      id, management_fee, letting_fee, rent_income, room_number, tenant_name,
      room:rooms(name, property_id),
      statement:landlord_statements(period_end, period_start,
        properties(id, name, address,
          landlord:people!properties_landlord_id_fkey(first_name, last_name)
        )
      )
    `)
    .in('statement_id', stmtIds)
    .gt('management_fee', 0)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (lsrRows || []).filter((r: any) => r.statement?.properties)

  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter((r: any) => {
      const prop = r.statement?.properties
      const landlord = prop?.landlord
      const name = `${prop?.name || ''} ${prop?.address || ''} ${landlord?.first_name || ''} ${landlord?.last_name || ''}`.toLowerCase()
      return name.includes(q)
    })
  }

  // Group by property
  const byProp = new Map<string, any>()
  for (const r of rows as any[]) {
    const prop = r.statement?.properties
    if (!prop) continue
    const key = prop.id
    if (!byProp.has(key)) {
      byProp.set(key, {
        property_id: prop.id,
        property_name: prop.name || prop.address,
        landlord_name: prop.landlord ? `${prop.landlord.first_name || ''} ${prop.landlord.last_name || ''}`.trim() : '—',
        management_fee_total: 0,
        letting_fee_total: 0,
        rows: [],
      })
    }
    const g = byProp.get(key)!
    g.management_fee_total += Number(r.management_fee || 0)
    g.letting_fee_total    += Number(r.letting_fee || 0)
    g.rows.push({
      id:             r.id,
      room:           r.room?.name || `Room ${r.room_number}`,
      tenant_name:    r.tenant_name,
      period_start:   r.statement?.period_start,
      period_end:     r.statement?.period_end,
      rent_income:    Number(r.rent_income || 0),
      management_fee: Number(r.management_fee || 0),
      letting_fee:    Number(r.letting_fee || 0),
    })
  }

  const properties = [...byProp.values()]
  const totals = {
    management_fee: properties.reduce((s, p) => s + p.management_fee_total, 0),
    letting_fee:    properties.reduce((s, p) => s + p.letting_fee_total, 0),
  }

  return NextResponse.json({ from, to, properties, totals })
}
