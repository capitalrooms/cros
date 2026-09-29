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
  const from   = searchParams.get('from') || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
  const to     = searchParams.get('to')   || new Date().toISOString().slice(0, 10)
  const search = searchParams.get('search') || ''

  const { data: charges, error } = await supabase
    .from('rent_charges')
    .select(`
      id, charge_month, amount_due, amount_received, status, voided,
      room:rooms(id, name,
        property:properties(id, name, address,
          landlord:people!properties_landlord_id_fkey(first_name, last_name)
        )
      )
    `)
    .gte('charge_month', from.slice(0, 7) + '-01')
    .lte('charge_month', to.slice(0, 7) + '-01')
    .eq('voided', false)
    .order('charge_month', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (charges || []) as any[]
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter(r => {
      const prop = r.room?.property
      const name = `${prop?.name || ''} ${prop?.address || ''}`.toLowerCase()
      return name.includes(q)
    })
  }

  // Group by property
  const byProp = new Map<string, any>()
  for (const r of rows) {
    const prop = r.room?.property
    const key = prop?.id || 'unknown'
    if (!byProp.has(key)) {
      byProp.set(key, {
        property_id:   prop?.id,
        property_name: prop?.name || prop?.address || 'Unknown',
        landlord_name: prop?.landlord ? `${prop.landlord.first_name || ''} ${prop.landlord.last_name || ''}`.trim() : '—',
        total_due:     0,
        total_received: 0,
        outstanding:   0,
        charge_count:  0,
        months: new Map<string, { due: number; received: number }>(),
      })
    }
    const g = byProp.get(key)!
    const due      = Number(r.amount_due || 0)
    const received = Number(r.amount_received || 0)
    g.total_due      += due
    g.total_received += received
    g.outstanding    += Math.max(0, due - received)
    g.charge_count   += 1

    const month = r.charge_month.slice(0, 7)
    if (!g.months.has(month)) g.months.set(month, { due: 0, received: 0 })
    g.months.get(month)!.due      += due
    g.months.get(month)!.received += received
  }

  const properties = [...byProp.values()].map(p => ({
    ...p,
    months: [...p.months.entries()].map(([month, v]: [string, any]) => ({ month, ...v })),
    collection_rate: p.total_due > 0 ? Math.round((p.total_received / p.total_due) * 100) : 100,
  }))

  const totals = {
    total_due:       properties.reduce((s, p) => s + p.total_due, 0),
    total_received:  properties.reduce((s, p) => s + p.total_received, 0),
    outstanding:     properties.reduce((s, p) => s + p.outstanding, 0),
    collection_rate: 0,
  }
  totals.collection_rate = totals.total_due > 0 ? Math.round((totals.total_received / totals.total_due) * 100) : 100

  return NextResponse.json({ from, to, properties, totals })
}
