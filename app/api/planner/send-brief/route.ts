import { getCurrentUser } from '@/lib/auth'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <noreply@capitalrooms.co.uk>'

interface Update {
  id: string
  author: string
  when: string
  body: string
  links?: string[]
  images?: string[]   // base64 data URIs
}

function buildBriefHtml(params: {
  contractorName: string
  personalMsg: string
  boardTitle: string
  itemTitle: string
  groupName: string
  status: string
  responsible: string
  updates: Update[]
}) {
  const { contractorName, personalMsg, boardTitle, itemTitle, groupName, status, updates } = params
  const greeting = contractorName ? `Hi ${contractorName},` : 'Hi,'

  const allLinks  = updates.flatMap(u => u.links  || [])
  const allImages = updates.flatMap(u => u.images || [])

  const notesHtml = updates.length === 0
    ? '<p style="color:#9ca3af;font-style:italic;">No notes recorded.</p>'
    : updates.map(u => {
        const linkRows = (u.links || []).map(l =>
          `<div style="margin-top:4px;"><a href="${l}" style="color:#2563eb;font-size:13px;text-decoration:none;">🔗 ${l}</a></div>`
        ).join('')
        const imgRow = u.images && u.images.length
          ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">${u.images.map((img, i) =>
              `<img src="${img}" alt="Photo ${i+1}" width="120" height="90" style="object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;" />`
            ).join('')}</div>`
          : ''
        return `
          <div style="margin-bottom:16px;padding-left:12px;border-left:3px solid #e5e7eb;">
            <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">${u.author} · ${u.when}</div>
            ${u.body ? `<div style="font-size:14px;color:#374151;line-height:1.55;">${u.body}</div>` : ''}
            ${linkRows}${imgRow}
          </div>`
      }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:#1c1917;padding:24px 28px;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#a8a29e;">Capital Rooms</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#fff;line-height:1.2;">Project Brief</h1>
    </div>

    <!-- Item context strip -->
    <div style="background:#f2f0ec;padding:12px 28px;border-bottom:1px solid #e5e2db;display:flex;gap:12px;align-items:center;">
      <span style="font-size:13px;font-weight:600;color:#44403c;">${itemTitle}</span>
      <span style="font-size:11px;color:#a8a29e;">${groupName} · ${boardTitle}</span>
      <span style="margin-left:auto;font-size:11px;background:#fff;border:1px solid #e5e2db;border-radius:6px;padding:2px 8px;color:#57534e;">${status}</span>
    </div>

    <div style="padding:24px 28px;">

      <!-- Greeting / personal note -->
      <p style="font-size:15px;color:#374151;margin:0 0 8px;">${greeting}</p>
      ${personalMsg ? `<p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px;">${personalMsg}</p>` : '<p style="font-size:14px;color:#374151;margin:0 0 20px;">Please find the project brief below.</p>'}

      <!-- Notes section -->
      <div style="margin-bottom:24px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin:0 0 14px;">Notes & context</p>
        ${notesHtml}
      </div>

      ${allLinks.length ? `
      <div style="margin-bottom:24px;padding:14px 16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#3b82f6;margin:0 0 10px;">Reference links</p>
        ${allLinks.map(l => `<div style="margin-bottom:5px;"><a href="${l}" style="font-size:13px;color:#2563eb;">${l}</a></div>`).join('')}
      </div>` : ''}

      ${allImages.length ? `
      <div style="margin-bottom:24px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin:0 0 10px;">Reference photos (${allImages.length})</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${allImages.map((img, i) => `<img src="${img}" alt="Photo ${i+1}" width="160" height="120" style="object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;" />`).join('')}
        </div>
      </div>` : ''}

      <hr style="border:none;border-top:1px solid #f3f4f6;margin:20px 0;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">Please let me know if you have any questions or need anything else.<br>— Harry, Capital Rooms</p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:14px 28px;border-top:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#d1d5db;margin:0;">Capital Rooms · harry@capitalrooms.co.uk</p>
    </div>
  </div>
</body>
</html>`
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  const role = (user?.assignment as any)?.role || ''
  if (!user || !['administrator', 'admin', 'lettings'].includes(role)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await request.json()
    const { contractorEmail, contractorName, personalMsg, boardTitle, itemTitle, groupName, status, responsible, updates } = data

    if (!contractorEmail) return Response.json({ error: 'contractorEmail is required' }, { status: 400 })

    const html = buildBriefHtml({ contractorName: contractorName || '', personalMsg: personalMsg || '', boardTitle, itemTitle, groupName, status, responsible, updates: updates || [] })

    const allLinks  = (updates || []).flatMap((u: Update) => u.links  || [])
    const allImages = (updates || []).flatMap((u: Update) => u.images || [])
    const subject = `Project brief: ${itemTitle}${groupName ? ` — ${groupName}` : ''}`

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return Response.json({ error: 'Email service not configured' }, { status: 500 })

    const emailRes = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [contractorEmail], subject, html }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}))
      return Response.json({ error: `Email failed: ${(err as any)?.message || emailRes.statusText}` }, { status: 502 })
    }

    return Response.json({
      success: true,
      message: `Brief sent to ${contractorEmail}`,
      stats: { notes: (updates || []).length, links: allLinks.length, photos: allImages.length },
    })
  } catch (err) {
    console.error('send-brief error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
