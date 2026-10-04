import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase
    .from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: batches } = await supabase
    .from('bank_import_batches')
    .select('*')
    .order('imported_at', { ascending: false })
    .limit(25)

  const practice = req.nextUrl.searchParams.get('practice') === '1'
  return NextResponse.json({ batches: ((batches || []) as any[]).filter(b => !!b.is_practice === practice) })
}
