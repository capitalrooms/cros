import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/adminAuth'
import { sendEmail } from '@/lib/sendEmail'
import { senderFor } from '@/lib/email/sender'
import { ContractorEmailDetails } from '@/lib/voice/actions/contractorEmail'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const details = (await req.json()) as ContractorEmailDetails

  if (!details.subject || !details.body) {
    return NextResponse.json({ error: 'Subject and body required' }, { status: 400 })
  }

  try {
    const supabase = createRouteHandlerClient({ cookies })
    const sender = await senderFor(req)
    let recipientEmail: string | null = null
    let recipientName = ''

    // Route 1: Find contractor from active job at property
    if (details.recipientType === 'job_contractor') {
      let propertyId = details.propertyId
      if (!propertyId && details.propertyName) {
        const { data: prop } = await supabase
          .from('properties')
          .select('id')
          .or(`name.ilike.%${details.propertyName}%`)
          .limit(1)
          .single()
        if (prop) propertyId = prop.id
      }

      if (!propertyId) {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 })
      }

      // Find active jobs at this property with contractors
      const { data: jobs } = await supabase
        .from('admin_tasks')
        .select('contractor_id, people!contractor_id(email, first_name, last_name, full_name)')
        .eq('property_id', propertyId)
        .not('contractor_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)

      if (jobs && jobs.length > 0 && jobs[0].people) {
        const person = jobs[0].people as any
        recipientEmail = person.email
        recipientName = person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email
      } else {
        return NextResponse.json(
          { error: `No active jobs found at ${details.propertyName || 'this property'}` },
          { status: 404 }
        )
      }
    }

    // Route 2: Search contractor by name
    else if (details.recipientType === 'contractor_by_name') {
      const { data: people } = await supabase
        .from('people')
        .select('id, email, first_name, last_name, full_name')
        .or(`first_name.ilike.%${details.contractorName}%, last_name.ilike.%${details.contractorName}%, full_name.ilike.%${details.contractorName}%`)
        .limit(1)
        .single()

      if (!people) {
        return NextResponse.json(
          { error: `Contractor not found: ${details.contractorName}` },
          { status: 404 }
        )
      }

      recipientEmail = people.email
      recipientName = people.full_name || [people.first_name, people.last_name].filter(Boolean).join(' ') || people.email
    }

    // Route 3: Email landlord
    else if (details.recipientType === 'landlord') {
      let propertyId = details.propertyId
      if (!propertyId && details.propertyName) {
        const { data: prop } = await supabase
          .from('properties')
          .select('landlord_id')
          .or(`name.ilike.%${details.propertyName}%`)
          .limit(1)
          .single()
        if (prop) propertyId = prop.id
      }

      if (!propertyId) {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 })
      }

      const { data: prop } = await supabase
        .from('properties')
        .select('landlord_id, people!landlord_id(email, first_name, last_name, full_name)')
        .eq('id', propertyId)
        .single()

      if (prop?.people) {
        const person = prop.people as any
        recipientEmail = person.email
        recipientName = person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email
      } else {
        return NextResponse.json({ error: 'Landlord not found for this property' }, { status: 404 })
      }
    }

    if (!recipientEmail) {
      return NextResponse.json({ error: 'Could not find recipient' }, { status: 400 })
    }

    // Build body with property details if requested
    let body = details.body
    if (details.includePropertyDetails && details.propertyName) {
      body += `\n\n<hr />\n<p><small><strong>Property:</strong> ${details.propertyName}</small></p>`
    }

    // Send email using styled design
    const result = await sendEmail(recipientEmail, details.subject, body, { sender, signature: true })

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      sentTo: recipientEmail,
      recipientName,
      message: `Email sent to ${recipientName}`,
    })
  } catch (e) {
    console.error('Contractor email error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
