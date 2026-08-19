import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Time-shift all viewings for a property by N minutes
 * Updates viewing_slot times and sends notification to all tenants
 */
export async function POST(request: NextRequest) {
  try {
    const { property_id, shift_minutes } = await request.json()

    if (!property_id || !shift_minutes) {
      return NextResponse.json(
        { error: 'property_id and shift_minutes required' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Get current user
    const {
      data: { user }
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch all upcoming viewings for this property
    const { data: viewings, error: fetchError } = await supabase
      .from('viewings')
      .select('id, viewing_slot, viewing_date, room_id, rooms(name)')
      .eq('property_id', property_id)
      .gte('viewing_date', new Date().toISOString().split('T')[0])

    if (fetchError || !viewings) {
      return NextResponse.json({ error: 'Failed to fetch viewings' }, { status: 500 })
    }

    // Update each viewing's time
    const updates = viewings.map((viewing) => {
      const [hours, minutes] = viewing.viewing_slot.split(':').map(Number)
      const currentDate = new Date(2000, 0, 1, hours, minutes)
      currentDate.setMinutes(currentDate.getMinutes() + shift_minutes)

      const newHours = String(currentDate.getHours()).padStart(2, '0')
      const newMinutes = String(currentDate.getMinutes()).padStart(2, '0')
      const newSlot = `${newHours}:${newMinutes}`

      return {
        id: viewing.id,
        oldSlot: viewing.viewing_slot,
        newSlot,
        roomName: (viewing.rooms as any)?.name || 'Room'
      }
    })

    // Perform batch update
    for (const update of updates) {
      await supabase
        .from('viewings')
        .update({ viewing_slot: update.newSlot })
        .eq('id', update.id)
    }

    return NextResponse.json({
      success: true,
      shifted_count: updates.length,
      updates: updates.map((u) => ({
        room: u.roomName,
        old_time: u.oldSlot,
        new_time: u.newSlot
      })),
      message: `Shifted ${updates.length} viewing(s) by +${shift_minutes} minutes`
    })
  } catch (error) {
    console.error('Error time-shifting viewings:', error)
    return NextResponse.json(
      { error: 'Failed to shift viewing times' },
      { status: 500 }
    )
  }
}
