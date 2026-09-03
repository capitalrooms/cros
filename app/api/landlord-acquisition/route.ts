import { NextRequest, NextResponse } from 'next/server'
import { acquisitionEmailHtml } from '@/lib/email-templates/acquisition'

// POST /api/landlord-acquisition
// Body: { firstName, email, greeting?, headshotUrl?, igUrl?, fbUrl? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    firstName, email, greeting, headshotUrl, igUrl, fbUrl,
    managementFee, lettingFee,
    showOfferBanner, showFreeManagement, freeManagementMonths, showLettingDiscount, discountedLettingFee,
  } = body

  if (!firstName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'firstName and email are required' }, { status: 400 })
  }

  const html = acquisitionEmailHtml({
    firstName: firstName.trim(),
    greeting: greeting?.trim() || undefined,
    headshotUrl: headshotUrl?.trim() || undefined,
    igUrl: igUrl?.trim() || undefined,
    fbUrl: fbUrl?.trim() || undefined,
    managementFee: managementFee?.trim() || undefined,
    lettingFee: lettingFee?.trim() || undefined,
    showOfferBanner: showOfferBanner !== false,
    showFreeManagement: showFreeManagement !== false,
    freeManagementMonths: freeManagementMonths ?? 1,
    showLettingDiscount: showLettingDiscount !== false,
    discountedLettingFee: discountedLettingFee?.trim() || undefined,
  })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Harry at Capital Rooms <management@capitalrooms.co.uk>',
      reply_to: 'management@capitalrooms.co.uk',
      to: email.trim(),
      subject: `Let us make property simple, ${firstName.trim()}.`,
      html,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Resend error: ${text}` }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json({ ok: true, id: data.id })
}

// GET /api/landlord-acquisition?firstName=X&greeting=Y&headshotUrl=Z&...
// Returns the rendered HTML for preview (no send)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const firstName = p.get('firstName') || 'there'
  const greeting = p.get('greeting') || undefined
  const headshotUrl = p.get('headshotUrl') || undefined
  const igUrl = p.get('igUrl') || undefined
  const fbUrl = p.get('fbUrl') || undefined
  const managementFee = p.get('managementFee') || undefined
  const lettingFee = p.get('lettingFee') || undefined
  const showOfferBanner = p.get('showOfferBanner') !== 'false'
  const showFreeManagement = p.get('showFreeManagement') !== 'false'
  const freeManagementMonths = p.get('freeManagementMonths') || 1
  const showLettingDiscount = p.get('showLettingDiscount') !== 'false'
  const discountedLettingFee = p.get('discountedLettingFee') || undefined

  const html = acquisitionEmailHtml({
    firstName, greeting, headshotUrl, igUrl, fbUrl,
    managementFee, lettingFee,
    showOfferBanner, showFreeManagement, freeManagementMonths, showLettingDiscount, discountedLettingFee,
  })
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
