import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { property_id } = await request.json()

    if (!property_id) {
      return NextResponse.json(
        { error: 'property_id required' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Get property details
    const { data: property } = await supabase
      .from('properties')
      .select('id, name, address')
      .eq('id', property_id)
      .single()

    // Get all compliance logs
    const { data: logs } = await supabase
      .from('compliance_logs')
      .select('*')
      .eq('property_id', property_id)
      .order('checked_date', { ascending: false })

    // Generate CSV format (can be expanded to full PDF later)
    let csv = 'Compliance Inspection Log\n'
    csv += `Property: ${property?.name}\n`
    csv += `Address: ${property?.address}\n`
    csv += `Generated: ${new Date().toLocaleDateString('en-GB')}\n\n`

    csv += 'Date,Checked By,Type,Fire Door,Smoke Alarm,Notes\n'

    ;(logs || []).forEach((log: any) => {
      const date = new Date(log.checked_date).toLocaleDateString('en-GB')
      const fireDoor = log.fire_door_status || '—'
      const smokeAlarm = log.smoke_alarm_status || '—'
      const notes = (log.notes || '').replace(/"/g, '""')

      csv += `"${date}","${log.checked_by_name || 'Unknown'}","${log.check_type}","${fireDoor}","${smokeAlarm}","${notes}"\n`
    })

    // Return as CSV for now (PDF generation requires additional library)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="compliance-log-${property?.name}-${new Date().getTime()}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting compliance data:', error)
    return NextResponse.json(
      { error: 'Failed to export compliance data' },
      { status: 500 }
    )
  }
}
