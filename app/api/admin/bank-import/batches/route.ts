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
    .select('id, filename, bank_name, period_from, period_to, transaction_count, credit_total, new_matched, new_unmatched, duplicates_skipped, possible_dupes, imported_at')
    .order('imported_at', { ascending: false })
    .limit(25)

  return NextResponse.json({ batches: batches || [] })
}
