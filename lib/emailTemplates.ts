/**
 * Email templates for offer letters.
 * Option 1: Initial offer (invite to apply)
 * Option 2: Confirmed offer (request holding deposit)
 *
 * Now async — all callers must await these functions.
 * Header and footer come from lib/emailWrapper.ts (the shared component).
 */

import { buildEmail } from '@/lib/emailWrapper'

export { FROM } from '@/lib/emailWrapper'

interface OfferEmailContext {
  applicantName?: string
  roomName: string
  propertyAddress: string
  propertyCity: string
  advertisedRent: number
  moveInDate?: string
  applicationUrl: string
  holdingDeposit: number
}

/**
 * Option 1: Initial Offer Letter — invite to apply.
 */
export async function buildOfferLetterEmail(context: OfferEmailContext): Promise<string> {
  const greeting = context.applicantName ? `Hi ${context.applicantName},` : 'Dear Applicant,'

  const inner = `
    <h1 style="font-size:26px;font-weight:700;color:#86284a;margin:0 0 20px;text-align:center;">We'd like to make you an offer!</h1>

    <p>${greeting}</p>

    <p>Thank you for your interest in our rooms at:</p>

    <p style="font-weight:600;color:#1c1917;font-size:15px;">
      ${context.roomName}<br>
      ${context.propertyAddress}<br>
      ${context.propertyCity}
    </p>

    <p>We think you'd be a great fit for this room and would like to invite you to apply.</p>

    <h2 style="font-size:18px;font-weight:700;color:#86284a;margin:24px 0 14px;">Room Details</h2>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
      <tr style="border-bottom:1px solid #e7e5e4;">
        <td style="padding:12px 0;color:#78716c;width:120px;font-weight:600;">Rent</td>
        <td style="padding:12px 0;font-weight:600;">£${context.advertisedRent.toFixed(2)}/month (all bills included)</td>
      </tr>
      <tr style="border-bottom:1px solid #e7e5e4;">
        <td style="padding:12px 0;color:#78716c;font-weight:600;">Minimum Term</td>
        <td style="padding:12px 0;font-weight:600;">6 months</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#78716c;font-weight:600;">Available From</td>
        <td style="padding:12px 0;font-weight:600;">${context.moveInDate || 'To be confirmed'}</td>
      </tr>
    </table>

    <p>To apply, please complete the application form using the link below. We'll review your application and get back to you shortly.</p>

    <div style="text-align:center;margin:24px 0;">
      <a href="${context.applicationUrl}" style="display:inline-block;background:#86284a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Complete Your Application</a>
    </div>

    <p style="font-size:12px;color:#78716c;text-align:center;">This link will expire in 30 days.</p>

    <p>If you have any questions, please don't hesitate to get in touch.</p>

    <p style="margin-top:32px;">All the best,<br><strong style="color:#86284a;">Capital Rooms Team</strong></p>
  `

  return buildEmail(inner)
}

/**
 * Option 2: Confirmed Offer with Holding Deposit Request.
 */
export async function buildSearchIsOverEmail(context: OfferEmailContext): Promise<string> {
  const greeting = context.applicantName ? `Hi ${context.applicantName},` : 'Dear Applicant,'

  const inner = `
    <h1 style="font-size:30px;font-weight:700;color:#86284a;margin:0 0 8px;text-align:center;">THE SEARCH IS OVER!</h1>

    <p style="text-align:center;color:#86284a;font-weight:600;margin-bottom:28px;font-size:16px;">✨ We'd love to have you ✨</p>

    <p>${greeting}</p>

    <p>Thank you for your interest in our rooms at:</p>

    <p style="font-weight:600;color:#1c1917;font-size:15px;margin:16px 0;">
      ${context.roomName}<br>
      ${context.propertyAddress}<br>
      ${context.propertyCity}
    </p>

    <div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0;border-left:4px solid #86284a;">
      <p style="margin:0;font-weight:700;color:#86284a;">We're pleased to confirm this room is yours!</p>
      <p style="margin:8px 0 0;font-size:13px;">To secure it, we just need a holding deposit from you.</p>
    </div>

    <h2 style="font-size:18px;font-weight:700;color:#86284a;margin:24px 0 14px;">Room Details</h2>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
      <tr style="border-bottom:1px solid #e7e5e4;">
        <td style="padding:12px 0;color:#78716c;width:120px;font-weight:600;">Rent</td>
        <td style="padding:12px 0;font-weight:600;">£${context.advertisedRent.toFixed(2)}/month (all bills included)</td>
      </tr>
      <tr style="border-bottom:1px solid #e7e5e4;">
        <td style="padding:12px 0;color:#78716c;font-weight:600;">Minimum Term</td>
        <td style="padding:12px 0;font-weight:600;">6 months with a one month deposit</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#78716c;font-weight:600;">Available From</td>
        <td style="padding:12px 0;font-weight:600;">${context.moveInDate || 'To be confirmed'}</td>
      </tr>
    </table>

    <h2 style="font-size:18px;font-weight:700;color:#86284a;margin:24px 0 14px;">How to Secure Your Room 🏦</h2>

    <p>The holding deposit is <span style="color:#dc2626;font-weight:700;">one week's rent (£${context.holdingDeposit.toFixed(2)})</span> and is <strong>not an extra fee</strong> — it will be deducted from your final balance.</p>

    <p>Once we receive your deposit, we'll:</p>
    <ol style="margin:16px 0;padding-left:20px;">
      <li>Take the property off the market</li>
      <li>Get you started with our referencing provider, Homepl</li>
      <li>Move forward with finalising your tenancy</li>
    </ol>

    <h2 style="font-size:18px;font-weight:700;color:#86284a;margin:24px 0 14px;">Payment Instructions</h2>
    <div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0;font-size:13px;">
      <p style="color:#86284a;font-weight:700;margin:0 0 8px;">Bank Transfer Details:</p>
      <p style="margin:4px 0;font-family:'Courier New',monospace;"><strong>Account Name:</strong> Capital Rooms Ltd</p>
      <p style="margin:4px 0;font-family:'Courier New',monospace;"><strong>Sort Code:</strong> 20–18–93</p>
      <p style="margin:4px 0;font-family:'Courier New',monospace;"><strong>Account Number:</strong> 40162574</p>
      <p style="margin:12px 0 4px;font-family:'Courier New',monospace;"><strong>Payment Reference:</strong></p>
      <p style="margin:4px 0;font-family:'Courier New',monospace;">055B0R03 (for £${context.holdingDeposit.toFixed(2)})</p>
    </div>

    <p style="font-size:13px;margin-top:16px;"><strong>Please ensure transfer fees are covered on your side.</strong> Once your payment clears, email us a screenshot of the confirmation — we'll fast-track your application.</p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${context.applicationUrl}" style="display:inline-block;background:#86284a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Complete Your Application</a>
    </div>

    <p style="font-size:12px;color:#78716c;text-align:center;margin-top:12px;">Don't forget: you'll also need to fill out your full application details using the link above.</p>

    <p style="background:#fef3c7;padding:12px;border-radius:6px;margin:20px 0;font-size:13px;border-left:4px solid #f59e0b;">
      <strong>⏰ Act quickly!</strong> We'd appreciate receiving your deposit within 48 hours to secure the room. This link expires in 30 days.
    </p>

    <p style="margin-top:28px;margin-bottom:8px;">Should you have any questions, we're here to help:</p>
    <p>📧 <a href="mailto:management@capitalrooms.co.uk" style="color:#0066cc;text-decoration:none;">management@capitalrooms.co.uk</a></p>
    <p>📞 0207 112 9163</p>

    <p style="margin-top:28px;">All the best,<br><strong style="color:#86284a;">Harry &amp; the Capital Rooms Team</strong></p>
  `

  return buildEmail(inner)
}
