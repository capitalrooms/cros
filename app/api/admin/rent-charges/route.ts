import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { rentChargesForTenancyId } from '@/lib/rentCharges'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await supabase
    .from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tenancyId = searchParams.get('tenancy_id')

  if (!tenancyId) return NextResponse.json({ error: 'tenancy_id required' }, { status: 400 })

  try {
    const charges = await rentChargesForTenancyId(supabase as any, tenancyId)
    return NextResponse.json({ charges })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not load rent charges' }, { status: 500 })
  }
}
