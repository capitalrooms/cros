interface CheckoutEmailData {
  tenantName: string
  tenantEmail: string
  roomName: string
  propertyAddress: string
  moveOutDate: string
  lastRentAmount: number
  proRataRent: number
  proRataCalculation: string
  depositAmount?: number
  depositReturnInfo?: string
  cleaningNotes?: string
  contactEmail?: string
  contactPhone?: string
}

export function buildCheckoutEmail(data: CheckoutEmailData): string {
  const moveOutFormatted = new Date(data.moveOutDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Time to Check Out - Capital Rooms</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f9f9f9;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #86284a 0%, #a83356 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: bold;
    }
    .header p {
      margin: 10px 0 0 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .section {
      margin: 25px 0;
      padding: 20px;
      background-color: #f5f5f5;
      border-left: 4px solid #86284a;
      border-radius: 4px;
    }
    .section h3 {
      margin: 0 0 15px 0;
      color: #86284a;
      font-size: 16px;
      font-weight: 600;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #555;
    }
    .detail-value {
      text-align: right;
      color: #333;
    }
    .amount {
      font-size: 18px;
      font-weight: bold;
      color: #86284a;
    }
    .pro-rata-note {
      font-size: 12px;
      color: #666;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
    }
    .checklist {
      margin: 20px 0;
    }
    .checklist-item {
      display: flex;
      align-items: flex-start;
      margin: 12px 0;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .checklist-icon {
      margin-right: 12px;
      font-size: 20px;
      flex-shrink: 0;
    }
    .checklist-text {
      flex: 1;
    }
    .checklist-text strong {
      display: block;
      color: #333;
      margin-bottom: 4px;
    }
    .checklist-text p {
      margin: 0;
      font-size: 14px;
      color: #666;
    }
    .footer {
      background-color: #f5f5f5;
      padding: 20px 30px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .contact-info {
      background: white;
      padding: 15px;
      border-radius: 4px;
      margin-top: 10px;
    }
    .contact-info p {
      margin: 5px 0;
      font-size: 14px;
    }
    .cta-button {
      display: inline-block;
      background-color: #86284a;
      color: white;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 4px;
      margin: 20px 0;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>Time to Check Out</h1>
      <p>We're sad to see you go!</p>
    </div>

    <div class="content">
      <div class="greeting">
        <p>Hi ${data.tenantName},</p>
        <p>We hope you've enjoyed your time at <strong>${data.roomName}, ${data.propertyAddress}</strong>. Your tenancy is coming to an end, and we want to make sure everything runs smoothly for your checkout.</p>
      </div>

      <div class="section">
        <h3>📅 Important Dates & Details</h3>
        <div class="detail-row">
          <span class="detail-label">Room:</span>
          <span class="detail-value">${data.roomName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Property:</span>
          <span class="detail-value">${data.propertyAddress}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Move-Out Date:</span>
          <span class="detail-value"><strong>${moveOutFormatted}</strong></span>
        </div>
      </div>

      <div class="section">
        <h3>💷 Final Payment Breakdown</h3>
        <div class="detail-row">
          <span class="detail-label">Regular Monthly Rent:</span>
          <span class="detail-value">£${data.lastRentAmount.toFixed(2)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Pro-Rata Amount (${data.proRataCalculation}):</span>
          <span class="detail-value"><span class="amount">£${data.proRataRent.toFixed(2)}</span></span>
        </div>
        <div class="pro-rata-note">
          ℹ️ Your final rent payment is calculated on a pro-rata basis for the days you're occupying the room in your final month.
        </div>
      </div>

      <div class="section">
        <h3>✅ Checkout Checklist</h3>
        <div class="checklist">
          <div class="checklist-item">
            <div class="checklist-icon">🧹</div>
            <div class="checklist-text">
              <strong>Deep Clean the Room</strong>
              <p>Please ensure the room is thoroughly cleaned, including all fixtures and fittings. ${data.cleaningNotes || 'We may arrange a professional clean if needed.'}</p>
            </div>
          </div>
          <div class="checklist-item">
            <div class="checklist-icon">🔑</div>
            <div class="checklist-text">
              <strong>Return Keys</strong>
              <p>Please return all keys to the property by your move-out date. Keep track of your key return for your records.</p>
            </div>
          </div>
          <div class="checklist-item">
            <div class="checklist-icon">💡</div>
            <div class="checklist-text">
              <strong>Meter Readings</strong>
              <p>Please take final readings of gas, electricity, and water meters. Send these to us with photos if possible.</p>
            </div>
          </div>
          <div class="checklist-item">
            <div class="checklist-icon">📋</div>
            <div class="checklist-text">
              <strong>Forward Your Address</strong>
              <p>Please ensure you've informed us of your forwarding address for any final correspondence or deposit return.</p>
            </div>
          </div>
          <div class="checklist-item">
            <div class="checklist-icon">📸</div>
            <div class="checklist-text">
              <strong>Take Photos</strong>
              <p>Take photos/videos of the room in its clean state as evidence of the condition for your records.</p>
            </div>
          </div>
        </div>
      </div>

      ${data.depositAmount ? `
      <div class="section">
        <h3>🏦 Deposit Information</h3>
        <p>Your deposit of <span class="amount">£${data.depositAmount.toFixed(2)}</span> is held in a government-approved scheme. Once we've confirmed the room is clean and undamaged, we'll process your deposit return within 30 days of checkout.</p>
        ${data.depositReturnInfo ? `<p>${data.depositReturnInfo}</p>` : ''}
      </div>
      ` : ''}

      <div class="section">
        <h3>❓ Questions?</h3>
        <p>If you have any questions about your checkout process, please get in touch:</p>
        ${data.contactEmail || data.contactPhone ? `
        <div class="contact-info">
          ${data.contactEmail ? `<p>📧 Email: ${data.contactEmail}</p>` : ''}
          ${data.contactPhone ? `<p>📞 Phone: ${data.contactPhone}</p>` : ''}
        </div>
        ` : ''}
      </div>

      <p>Thank you for being a valued resident. We wish you all the best with your next chapter!</p>
      <p><strong>Best regards,</strong><br/>The Capital Rooms Team</p>
    </div>

    <div class="footer">
      <p>Capital Rooms Ltd | Innovating London living since 2018</p>
      <p>This is an automated message from Capital Rooms. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
