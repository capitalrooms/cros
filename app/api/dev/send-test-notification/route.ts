import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Dev endpoint only' },
      { status: 403 }
    )
  }

  try {
    const { type, recipientRole } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get test user based on role
    const emailMap: Record<string, string> = {
      tenant: 'tenant1+test@capitalrooms.co.uk',
      cleaner: 'cleaner+test@capitalrooms.co.uk',
      admin: 'admin+test@capitalrooms.co.uk',
    }

    const recipientEmail = emailMap[recipientRole] || emailMap.tenant

    const { data: recipient, error: recipientError } = await supabase
      .from('people')
      .select('id, email, full_name')
      .eq('email', recipientEmail)
      .single()

    if (recipientError || !recipient) {
      return NextResponse.json(
        { error: `Recipient ${recipientRole} not found`, details: recipientError?.message },
        { status: 404 }
      )
    }

    // Create appropriate message based on type
    let messageData: any = {
      recipient_id: recipient.id,
      read: false,
    }

    if (type === 'cleaning_scheduled') {
      messageData = {
        ...messageData,
        title: '🧹 Your cleaning is scheduled',
        content: 'A cleaning appointment has been scheduled for 123 Test Street on tomorrow at 10:00 AM. Your cleaner will arrive at the scheduled time.',
        type: 'notification',
        action_link: '/tenant/maintenance',
      }
    } else if (type === 'cleaning_completed') {
      messageData = {
        ...messageData,
        title: '✅ Cleaning completed',
        content: 'Your property has been cleaned. The cleaner has added notes and photos to the job report.',
        type: 'notification',
        action_link: '/tenant/maintenance',
      }
    } else if (type === 'viewing_booked') {
      messageData = {
        ...messageData,
        title: '👀 Viewing scheduled',
        content: 'A property viewing has been booked for 123 Test Street. Please ensure the property is accessible on the scheduled date.',
        type: 'alert',
        action_link: '/tenant/viewings',
      }
    } else if (type === 'next_clean_booked') {
      messageData = {
        ...messageData,
        title: '🗓️ Next cleaning scheduled',
        content: 'The next cleaning has been booked for 123 Test Street on the following week at 10:00 AM.',
        type: 'notification',
        action_link: '/tenant/maintenance',
      }
    } else {
      messageData = {
        ...messageData,
        title: 'Test Message',
        content: 'This is a test notification to verify the messaging system is working.',
        type: 'notification',
      }
    }

    // Create the message
    const { data: createdMessage, error: createError } = await supabase
      .from('messages')
      .insert(messageData)
      .select()

    if (createError) {
      return NextResponse.json(
        {
          error: 'Failed to create message',
          details: createError.message,
          hint: 'Messages table may not exist yet - run migrations',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Test notification sent',
      notification: createdMessage?.[0],
      recipient: {
        email: recipient.email,
        name: recipient.full_name,
        role: recipientRole,
      },
    })
  } catch (error) {
    console.error('Send notification error:', error)
    return NextResponse.json(
      { error: 'Failed to send notification', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
