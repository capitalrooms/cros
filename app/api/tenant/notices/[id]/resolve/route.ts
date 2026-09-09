import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: person } = await supabase
    .from('people')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  const body = await req.json()
  const { resolved_photo_url } = body

  const { data: notice, error } = await supabase
    .from('communal_notices')
    .update({
      status: 'resolved',
      resolved_by: person.id,
      resolved_at: new Date().toISOString(),
      resolved_photo_url: resolved_photo_url || null,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    console.error('[notices resolve]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notice })
}
