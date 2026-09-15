/**
 * POST /api/landlord-onboarding/send-with-agreement
 *
 * All-in-one: creates the landlord_onboarding record, generates the
 * management agreement PDF, stores it, and sends one welcome email
 * with the agreement attached and the AML form link included.
 *
 * Body shape:
 * {
 *   // Landlord
 *   full_name, email, phone?,
 *   // Agreement data (ManagementAgreementData)
 *   agreementType, agreementDate, entityType,
 *   clientTitle?, clientFirstName?, clientLastName?,
 *   companyName?, companyReg?, companyCountry?,
 *   clientAddress,   // string[] — landlord's own address
 *   properties,      // string[] — property address(es)
 *   managementFee, letFee, floatAmount?, epcCost,
 *   commencementDate, inventoryNote?,
 * }
 */

import { NextRequest, NextResponse }  from 'next/server'
import { createClient }               from '@supabase/supabase-js'
import { generateManagementAgreementPDF, type ManagementAgreementData } from '@/lib/managementAgreement/generatePDF'
import { fetchPDFBizSettings }        from '@/lib/pdfLetterhead'
import { sendEmail }                  from '@/lib/sendEmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cros-sigma.vercel.app'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

export async function POST(req: NextRequest) {
  const body = await req.json()

  const {
    full_name,
    email,
    phone,
    created_by,
    ...agreementFields
  } = body

  if (!full_name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'full_name and email are required' }, { status: 400 })
  }
  if (!agreementFields.properties?.length || !agreementFields.clientAddress?.length) {
    return NextResponse.json({ error: 'properties and clientAddress are required' }, { status: 400 })
  }

  // 1. Create the onboarding record (stage 1 — email not yet sent)
  const { data: row, error: insertErr } = await svc()
    .from('landlord_onboarding')
    .insert({
      full_name:   full_name.trim(),
      email:       email.trim().toLowerCase(),
      phone:       phone?.trim() || null,
      created_by:  created_by ?? null,
      stage:       1,
      entity_type: agreementFields.entityType ?? null,
    })
    .select()
    .single()

  if (insertErr || !row) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to create record' }, { status: 500 })
  }

  const formUrl = `${BASE_URL}/landlord/onboard/${row.token}`

  // 2. Generate the management agreement PDF
  let pdfBuffer: Buffer
  try {
    const bizSettings = await fetchPDFBizSettings()
    const agreementData: ManagementAgreementData & { bizSettings: typeof bizSettings } = {
      ...agreementFields as ManagementAgreementData,
      bizSettings,
    }
    pdfBuffer = await generateManagementAgreementPDF(agreementData)
  } catch (e) {
    // If PDF fails, still create the record but report the error
    await svc().from('landlord_onboarding').delete().eq('id', row.id)
    return NextResponse.json({ error: `PDF generation failed: ${e instanceof Error ? e.message : e}` }, { status: 500 })
  }

  // 3. Store PDF in Supabase Storage (best-effort — doesn't block send)
  let storagePath: string | null = null
  try {
    const logId = crypto.randomUUID()
    storagePath = `management-agreements/${logId}.pdf`
    await svc().storage
      .from('valuations')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

    await svc().from('landlord_onboarding').update({
      agreement_pdf_path:      storagePath,
      agreement_generated_at:  new Date().toISOString(),
    }).eq('id', row.id)
  } catch {
    storagePath = null // non-fatal
  }

  // 4. Build the filename
  const typeLabel  = agreementFields.agreementType === 'hmo' ? 'Multi-Let' : 'Single-Let'
  const propSlug   = (agreementFields.properties[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
  const dateSlug   = (agreementFields.agreementDate ?? new Date().toISOString()).slice(0, 10)
  const filename   = `Capital-Rooms-Management-Agreement_${typeLabel}_${propSlug}_${dateSlug}.pdf`

  // 5. Send welcome email with agreement attached
  const firstName = full_name.trim().split(' ')[0]
  const feeDesc   = agreementFields.agreementType === 'hmo'
    ? `${agreementFields.managementFee}% of rent collected (multi-let)`
    : `${agreementFields.managementFee}% of rent collected (single let)`

  const bodyHtml = welcomeWithAgreementHtml(firstName, full_name.trim(), formUrl, {
    propertyAddress: (agreementFields.properties[0] ?? '').replace(/\n/g, ', '),
    managementFee:   feeDesc,
    letFee:          String(agreementFields.letFee),
    commencementDate: agreementFields.commencementDate,
  })

  const { ok: emailSent, error: emailError } = await sendEmail(
    email.trim().toLowerCase(),
    'Welcome to Capital Rooms — Your Management Agreement & Registration Form',
    bodyHtml,
    {
      replyTo:     'harry@capitalrooms.co.uk',
      attachments: [
        {
          filename,
          content: pdfBuffer.toString('base64'),
        },
      ],
    }
  )

  // 6. Advance to stage 2 if email sent
  if (emailSent) {
    await svc().from('landlord_onboarding').update({
      stage:           2,
      welcome_sent_at: new Date().toISOString(),
    }).eq('id', row.id)
    row.stage = 2
  }

  return NextResponse.json({
    row,
    emailSent,
    emailError: emailSent ? null : emailError,
    agreementFilename: filename,
    storagePath,
  })
}

// ── Email body ─────────────────────────────────────────────────────────────────

function welcomeWithAgreementHtml(
  firstName: string,
  fullName: string,
  formUrl: string,
  details: {
    propertyAddress: string
    managementFee: string
    letFee: string
    commencementDate: string
  }
): string {
  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }
    catch { return iso }
  }

  return `
<p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">Dear ${fullName},</p>

<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
  Thank you for choosing Capital Rooms. I'm delighted to be working with you. Your management
  agreement is attached to this email as a PDF — please take a moment to review it in full.
  It sets out the scope of our services, our fees, and your terms of engagement.
</p>

<p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;border-left:3px solid #e0e0e0;padding-left:12px;">
  If you did not receive the agreement, or if you would like any corrections made before proceeding,
  please reply to this email and I will come back to you straight away.
</p>

<!-- Agreement summary card -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
  <tr>
    <td style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:8px;padding:20px 24px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.08em;">📋 Your Management Agreement — Key Terms</p>
      <p style="margin:0;font-size:13px;color:#444;line-height:1.8">
        <strong>Property:</strong> ${details.propertyAddress}<br>
        <strong>Management fee:</strong> ${details.managementFee}<br>
        <strong>Let fee:</strong> ${details.letFee}<br>
        <strong>Proposed commencement:</strong> ${fmtDate(details.commencementDate)}<br>
        <strong>Notice period:</strong> 2 months written notice by either party
      </p>
    </td>
  </tr>
</table>

<p style="margin:0 0 20px;font-size:15px;font-weight:700;color:#1a1a1a;">What to do next</p>

<!-- Step 1 -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
  <tr>
    <td width="36" valign="top" style="padding-top:2px;">
      <div style="width:26px;height:26px;background:#1a1a1a;border-radius:50%;text-align:center;line-height:26px;font-size:12px;font-weight:700;color:#fff;">1</div>
    </td>
    <td style="padding-left:12px;">
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1a1a1a;">Review your management agreement</p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">
        Your agreement is attached to this email as a PDF. Please read it carefully — if anything needs
        amending, simply reply and I will update it before we proceed.
      </p>
    </td>
  </tr>
</table>

<!-- Step 2 -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
  <tr>
    <td width="36" valign="top" style="padding-top:2px;">
      <div style="width:26px;height:26px;background:#1a1a1a;border-radius:50%;text-align:center;line-height:26px;font-size:12px;font-weight:700;color:#fff;">2</div>
    </td>
    <td style="padding-left:12px;">
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1a1a1a;">Complete your landlord registration form</p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">
        Our online form collects your identity and property details for our Anti-Money Laundering compliance — a regulatory
        requirement before we can manage your property. You can save your progress at any time and return to it later.
      </p>
    </td>
  </tr>
</table>

<!-- CTA -->
<div style="margin:0 0 32px;text-align:center;">
  <a href="${formUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:14px;font-weight:600;padding:16px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
    Complete registration form →
  </a>
  <p style="margin:10px 0 0;font-size:12px;color:#999;">The link stays active — save your progress and return at any time.</p>
</div>

<!-- Step 3 -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
  <tr>
    <td width="36" valign="top" style="padding-top:2px;">
      <div style="width:26px;height:26px;background:#1a1a1a;border-radius:50%;text-align:center;line-height:26px;font-size:12px;font-weight:700;color:#fff;">3</div>
    </td>
    <td style="padding-left:12px;">
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1a1a1a;">Sign the finalised agreement</p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">
        Once your registration has been verified (usually 1–2 working days), I will send the
        agreement for your electronic signature via Adobe Sign. At that point everything will be in place
        and we can get started.
      </p>
    </td>
  </tr>
</table>

<p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6">
  If you have any questions at any point, simply reply to this email and I will come back to you directly.
</p>

<p style="margin:24px 0 4px;font-size:15px;color:#333">Kind regards,</p>
<p style="margin:0;font-size:15px;color:#333;font-weight:600">Harry</p>
<p style="margin:2px 0 0;font-size:13px;color:#888">Capital Rooms &nbsp;·&nbsp; <a href="mailto:harry@capitalrooms.co.uk" style="color:#555;">harry@capitalrooms.co.uk</a></p>`
}
