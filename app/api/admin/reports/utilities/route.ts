import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const CERT_FIELDS = [
  { key: 'gas_safe',           label: 'Gas Safety',            expiry: 'gas_safe_cert_expiry',              date: 'gas_safe_cert_date' },
  { key: 'electrical',         label: 'Electrical Certificate', expiry: 'electrical_cert_expiry',            date: 'electrical_cert_date' },
  { key: 'fire_detection',     label: 'Fire Detection Test',    expiry: 'fire_detection_expiry',   date: 'fire_detection_test_date' },
  { key: 'pat_test',           label: 'PAT Test',               expiry: 'pat_test_expiry',              date: 'pat_test_date' },
  { key: 'emergency_lighting', label: 'Emergency Lighting',     expiry: null,                                date: 'emergency_lighting_test_date' },
]

function certStatus(expiryStr: string | null | undefined): 'current' | 'expiring_soon' | 'expired' | 'missing' {
  if (!expiryStr) return 'missing'
  const expiry = new Date(expiryStr)
  const today  = new Date()
  const days   = Math.floor((expiry.getTime() - today.getTime()) / 86400000)
  if (days < 0)   return 'expired'
  if (days <= 60) return 'expiring_soon'
  return 'current'
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') || 'all'  // all | expired | expiring_soon | missing
  const search = searchParams.get('search') || ''

  const { data: props, error } = await supabase
    .from('properties')
    .select(`
      id, name, address,
      gas_safe_cert_date, gas_safe_cert_expiry,
      electrical_cert_date, electrical_cert_expiry,
      fire_detection_test_date, fire_detection_expiry,
      pat_test_date, pat_test_expiry,
      emergency_lighting_test_date,
      landlord:people!properties_landlord_id_fkey(first_name, last_name)
    `)
    .or('letting_type.is.null,letting_type.neq.let_only')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (props || []) as any[]
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter(r => `${r.name || ''} ${r.address || ''}`.toLowerCase().includes(q))
  }

  const formatted = rows.map(p => {
    const certs = CERT_FIELDS.map(cf => {
      const expiry = cf.expiry ? p[cf.expiry] : null
      const date   = p[cf.date]
      const status = certStatus(expiry)
      const days   = expiry ? Math.floor((new Date(expiry).getTime() - new Date().getTime()) / 86400000) : null
      return { key: cf.key, label: cf.label, date, expiry, status, days_until_expiry: days }
    })
    const worst = certs.some(c => c.status === 'expired') ? 'expired'
      : certs.some(c => c.status === 'expiring_soon') ? 'expiring_soon'
      : certs.some(c => c.status === 'missing') ? 'missing' : 'current'
    return {
      property_id:   p.id,
      property_name: p.name || p.address,
      landlord_name: p.landlord ? `${p.landlord.first_name || ''} ${p.landlord.last_name || ''}`.trim() : '—',
      certs,
      worst_status:  worst,
    }
  })

  const filtered = filter === 'all' ? formatted : formatted.filter(p => {
    if (filter === 'expired')       return p.worst_status === 'expired'
    if (filter === 'expiring_soon') return p.worst_status === 'expiring_soon'
    if (filter === 'missing')       return p.worst_status === 'missing'
    return true
  })

  const summary = {
    total:          formatted.length,
    expired:        formatted.filter(p => p.worst_status === 'expired').length,
    expiring_soon:  formatted.filter(p => p.worst_status === 'expiring_soon').length,
    missing:        formatted.filter(p => p.worst_status === 'missing').length,
    current:        formatted.filter(p => p.worst_status === 'current').length,
  }

  return NextResponse.json({ properties: filtered, summary, filter })
}
