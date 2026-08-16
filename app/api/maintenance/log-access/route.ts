import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.assignment?.role !== 'contractor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { ticketId, action } = await request.json()

    if (!ticketId || !action || !['doorbell', 'knock', 'announced'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Log access action to notes with timestamp
    const { data: ticket } = await supabase
      .from('maintenance_tickets')
      .select('notes')
      .eq('id', ticketId)
      .single()

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const actionLabels: Record<string, string> = {
      doorbell: '🔔 Rang doorbell',
      knock: '🚪 Knocked on door',
      announced: '📢 Announced arrival',
    }

    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const newEntry = `[${timestamp}] ${actionLabels[action]}`

    const updatedNotes = ticket.notes ? `${ticket.notes}\n${newEntry}` : newEntry

    const { error } = await supabase
      .from('maintenance_tickets')
      .update({ notes: updatedNotes })
      .eq('id', ticketId)

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Access logged' })
  } catch (error) {
    console.error('Error logging access:', error)
    return NextResponse.json(
      { error: 'Failed to log access' },
      { status: 500 }
    )
  }
}
