import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { withContractors } from '@/lib/contractors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from     = searchParams.get('from') || new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1).toISOString().slice(0, 10)
  const to       = searchParams.get('to')   || new Date().toISOString().slice(0, 10)
  const search   = searchParams.get('search') || ''
  const status   = searchParams.get('status') || ''  // open | completed | on_hold
  const priority = searchParams.get('priority') || ''

  let query = supabase
    .from('maintenance_tickets')
    .select(`
      id, title, description, category, priority, status, location, contractor_id,
      booked_date, approved_at, on_hold, created_at,
      properties(id, name, address)
    `)
    .gte('created_at', from)
    .lte('created_at', to + 'T23:59:59')
    .order('created_at', { ascending: false })

  if (status)   query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (await withContractors(supabase as any, (data || []) as any[])) as any[]
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter(r => {
      const prop = r.properties
      const text = `${r.title || ''} ${r.category || ''} ${prop?.name || ''} ${prop?.address || ''}`.toLowerCase()
      return text.includes(q)
    })
  }

  const formatted = rows.map(r => ({
    id:          r.id,
    title:       r.title,
    category:    r.category,
    priority:    r.priority,
    status:      r.status,
    location:    r.location || null,
    property:    r.properties?.name || r.properties?.address || '—',
    contractor:  r.contractor ? `${r.contractor.first_name || ''} ${r.contractor.last_name || ''}`.trim() : null,
    booked_date: r.booked_date,
    approved_at: r.approved_at,
    on_hold:     r.on_hold,
    created_at:  r.created_at,
  }))

  const totals = {
    total:     formatted.length,
    open:      formatted.filter(r => !['completed', 'cancelled'].includes(r.status)).length,
    completed: formatted.filter(r => r.status === 'completed').length,
    on_hold:   formatted.filter(r => r.on_hold).length,
  }

  const byPriority = { emergency: 0, high: 0, medium: 0, low: 0 } as Record<string, number>
  for (const r of formatted) {
    if (r.priority && byPriority[r.priority] !== undefined) byPriority[r.priority]++
  }

  return NextResponse.json({ from, to, jobs: formatted, totals, by_priority: byPriority })
}
