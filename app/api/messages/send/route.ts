import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateEmail, validateNotes } from '@/lib/validation'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized messages/send access', ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { recipientEmail, senderEmail, title, message, type, actionLink } = await request.json()

    if (!recipientEmail || !validateEmail(recipientEmail) || !title || !message) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid email: ${recipientEmail}, title: ${title}`, ipAddress: getClientIp(request.headers) })
      return NextResponse.json(
        { error: 'Missing or invalid required fields' },
        { status: 400 }
      )
    }

    if (!validateNotes(message)) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: 'Invalid message content (XSS detected)', ipAddress: getClientIp(request.headers) })
      return NextResponse.json(
        { error: 'Message contains invalid content' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get recipient
    const { data: recipient, error: recipientError } = await supabase
      .from('people')
      .select('id, email, full_name, first_name, last_name')
      .eq('email', recipientEmail)
      .single()

    if (recipientError || !recipient) {
      return NextResponse.json(
        { error: 'Recipient not found' },
        { status: 404 }
      )
    }

    // Get sender if provided
    let senderId = null
    if (senderEmail) {
      const { data: sender } = await supabase
        .from('people')
        .select('id')
        .eq('email', senderEmail)
        .single()
      senderId = sender?.id
    }

    // Create message record
    const { data: newMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        recipient_id: recipient.id,
        sender_id: senderId,
        title,
        content: message,
        type: type || 'notification',
        action_link: actionLink,
        read: false,
        created_at: new Date().toISOString(),
      })
      .select()

    if (insertError) {
      // Try creating a simpler record if columns don't exist
      console.log('Message insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create message', details: insertError.message },
        { status: 500 }
      )
    }

    // TODO: Send email notification
    // For now, just return success

    return NextResponse.json({
      success: true,
      message: 'Message sent',
      messageId: newMessage?.[0]?.id,
    })
  } catch (error) {
    console.error('Send message error:', error)
    return NextResponse.json(
      { error: 'Send message failed' },
      { status: 500 }
    )
  }
}
