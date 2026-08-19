/**
 * Email templates for offer letters
 * Option 1: Initial offer (invite to apply)
 * Option 2: Confirmed offer (request holding deposit)
 */

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

const emailShell = (inner: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #3f3f46;
      margin: 0;
      padding: 0;
      background-color: #f5f5f4;
    }
    .container {
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      padding: 40px;
    }
    .logo {
      margin-bottom: 40px;
      text-align: center;
    }
    .logo img {
      height: 60px;
      width: auto;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #86284a;
      margin: 0 0 16px;
      text-align: center;
    }
    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #86284a;
      margin: 24px 0 16px;
    }
    p {
      margin: 0 0 16px;
      font-size: 14px;
    }
    .highlight {
      background-color: #f3f1ef;
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
      border-left: 4px solid #86284a;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 14px;
    }
    .details-table tr {
      border-bottom: 1px solid #e7e5e4;
    }
    .details-table td {
      padding: 12px 0;
    }
    .details-table td:first-child {
      color: #78716c;
      width: 120px;
      font-weight: 600;
    }
    .details-table td:last-child {
      font-weight: 600;
    }
    .button {
      display: inline-block;
      background-color: #86284a;
      color: #ffffff;
      padding: 14px 32px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      margin: 20px 0;
      text-align: center;
      font-size: 14px;
    }
    .button-large {
      display: block;
      width: 100%;
      box-sizing: border-box;
      text-align: center;
      padding: 16px;
    }
    .bank-details {
      background-color: #f3f1ef;
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
      font-size: 13px;
    }
    .bank-details p {
      margin: 8px 0;
      font-family: 'Courier New', monospace;
    }
    .bank-label {
      color: #86284a;
      font-weight: 700;
      margin-top: 12px;
    }
    .red-text {
      color: #dc2626;
      font-weight: 700;
    }
    .footer {
      border-top: 1px solid #e7e5e4;
      margin-top: 32px;
      padding-top: 24px;
      font-size: 12px;
      color: #a8a29e;
      text-align: center;
    }
    .footer-address {
      margin: 12px 0;
    }
    .footer-contact {
      margin: 4px 0;
    }
    .footer-link {
      color: #0066cc;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    ${inner}
    <div class="footer">
      <p style="margin: 0 0 16px; font-size: 12px; color: #78716c;">Capital Rooms</p>
      <div class="footer-address">Third Floor | 86–90 Paul Street | London | EC2A 4NE</div>
      <div class="footer-contact">📧 <a href="mailto:management@capitalrooms.co.uk" class="footer-link">management@capitalrooms.co.uk</a></div>
      <div class="footer-contact">📞 0207 112 9163</div>
    </div>
  </div>
</body>
</html>
`

/**
 * Option 1: Initial Offer Letter
 * For: Early-stage applicants we want to review
 * Tone: Professional, inviting, non-committal
 */
export function buildOfferLetterEmail(context: OfferEmailContext): string {
  const greeting = context.applicantName ? `Hi ${context.applicantName},` : 'Dear Applicant,'

  const inner = `
    <h1>We'd like to make you an offer!</h1>

    <p>${greeting}</p>

    <p>Thank you for your interest in our rooms at:</p>

    <p style="font-weight: 600; color: #1c1917; font-size: 15px;">
      ${context.roomName}<br>
      ${context.propertyAddress}<br>
      ${context.propertyCity}
    </p>

    <p>We think you'd be a great fit for this room and would like to invite you to apply.</p>

    <h2>Room Details</h2>
    <table class="details-table">
      <tr>
        <td>Rent</td>
        <td>£${context.advertisedRent.toFixed(2)}/month (all bills included)</td>
      </tr>
      <tr>
        <td>Minimum Term</td>
        <td>6 months</td>
      </tr>
      <tr>
        <td>Available From</td>
        <td>${context.moveInDate || 'To be confirmed'}</td>
      </tr>
    </table>

    <p>To apply, please complete the application form using the link below. We'll review your application and get back to you shortly.</p>

    <div style="text-align: center;">
      <a href="${context.applicationUrl}" class="button button-large">Complete Your Application</a>
    </div>

    <p style="font-size: 12px; color: #78716c; text-align: center;">
      This link will expire in 30 days.
    </p>

    <p>If you have any questions, please don't hesitate to get in touch.</p>

    <p style="margin-top: 32px;">All the best,<br><strong style="color: #86284a;">Capital Rooms Team</strong></p>
  `

  return emailShell(inner)
}

/**
 * Option 2: Confirmed Offer with Holding Deposit Request
 * For: Applicants we're confident about and ready to move forward
 * Tone: Celebratory, urgent, action-oriented
 */
export function buildSearchIsOverEmail(context: OfferEmailContext): string {
  const greeting = context.applicantName ? `Hi ${context.applicantName},` : 'Dear Applicant,'

  const inner = `
    <h1 style="font-size: 32px; margin-bottom: 8px;">THE SEARCH IS OVER!</h1>

    <p style="text-align: center; color: #86284a; font-weight: 600; margin-bottom: 32px; font-size: 16px;">
      ✨ We'd love to have you ✨
    </p>

    <p>${greeting}</p>

    <p style="font-size: 15px; line-height: 1.7;">
      Thank you for your interest in our rooms at:
    </p>

    <p style="font-weight: 600; color: #1c1917; font-size: 15px; margin: 16px 0;">
      ${context.roomName}<br>
      ${context.propertyAddress}<br>
      ${context.propertyCity}
    </p>

    <div class="highlight">
      <p style="margin: 0; font-weight: 700; color: #86284a;">We're pleased to confirm this room is yours!</p>
      <p style="margin: 8px 0 0; font-size: 13px;">To secure it, we just need a holding deposit from you.</p>
    </div>

    <h2>Room Details</h2>
    <table class="details-table">
      <tr>
        <td>Rent</td>
        <td>£${context.advertisedRent.toFixed(2)}/month (all bills included)</td>
      </tr>
      <tr>
        <td>Minimum Term</td>
        <td>6 months with a one month deposit</td>
      </tr>
      <tr>
        <td>Available From</td>
        <td>${context.moveInDate || 'To be confirmed'}</td>
      </tr>
    </table>

    <h2 style="margin-top: 32px;">How to Secure Your Room 🏦</h2>

    <p>The holding deposit is <span class="red-text">one week's rent (£${context.holdingDeposit.toFixed(2)})</span> and is <strong>not an extra fee</strong> – it will be deducted from your final balance.</p>

    <p>Once we receive your deposit, we'll:</p>
    <ol style="margin: 16px 0; padding-left: 20px;">
      <li>Take the property off the market</li>
      <li>Get you started with our referencing provider, Homepl</li>
      <li>Move forward with finalising your tenancy</li>
    </ol>

    <h2>Payment Instructions</h2>
    <div class="bank-details">
      <p class="bank-label">Bank Transfer Details:</p>
      <p><strong>Account Name:</strong> Capital Rooms Ltd</p>
      <p><strong>Sort Code:</strong> 20–18–93</p>
      <p><strong>Account Number:</strong> 40162574</p>
      <p style="margin-top: 12px;"><strong>Payment Reference:</strong></p>
      <p>055B0R03 (for £${context.holdingDeposit.toFixed(2)})</p>
    </div>

    <p style="font-size: 13px; margin-top: 20px;">
      <strong>Please ensure transfer fees are covered on your side.</strong> Once your payment clears, email us a screenshot of the confirmation – we'll fast-track your application.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${context.applicationUrl}" class="button button-large">Complete Your Application</a>
    </div>

    <p style="font-size: 12px; color: #78716c; text-align: center; margin-top: 16px;">
      Don't forget: you'll also need to fill out your full application details using the link above.
    </p>

    <p style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin: 20px 0; font-size: 13px; border-left: 4px solid #f59e0b;">
      <strong>⏰ Act quickly!</strong> We'd appreciate receiving your deposit within 48 hours to secure the room. This link expires in 30 days.
    </p>

    <p style="margin-top: 32px; margin-bottom: 8px;">Should you have any questions, we're here to help:</p>
    <p>📧 <a href="mailto:management@capitalrooms.co.uk" style="color: #0066cc; text-decoration: none;">management@capitalrooms.co.uk</a></p>
    <p>📞 0207 112 9163</p>

    <p style="margin-top: 32px;">All the best,<br><strong style="color: #86284a;">Harry & the Capital Rooms Team</strong></p>
  `

  return emailShell(inner)
}
