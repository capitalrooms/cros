import { getCurrentUser } from '@/lib/serverAuth'
import { senderFields, senderFor } from '@/lib/email/sender'
import { buildEmail } from '@/lib/emailWrapper'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

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

  return `
      <p>${greeting}</p>
      ${personalMsg ? `<p>${personalMsg}</p>` : '<p>Please find the project brief below.</p>'}
      <p style="margin:18px 0 4px;"><strong>${itemTitle}</strong></p>
      <p style="margin:0 0 18px;font-size:12px;color:#78716c;">${groupName} · ${boardTitle} · ${status}</p>
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin:0 0 14px;">Notes &amp; context</p>
      <div style="margin-bottom:24px;">${notesHtml}</div>
      ${allLinks.length ? `
      <div style="margin-bottom:24px;padding:14px 16px;background:#f5f4f2;border-radius:8px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#78716c;margin:0 0 10px;">Reference links</p>
        ${allLinks.map(l => `<div style="margin-bottom:5px;"><a href="${l}" style="font-size:13px;color:#1a1a1a;">${l}</a></div>`).join('')}
      </div>` : ''}
      ${allImages.length ? `
      <div style="margin-bottom:24px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin:0 0 10px;">Reference photos (${allImages.length})</p>
        <div>${allImages.map((img, i) => `<img src="${img}" alt="Photo ${i+1}" width="160" height="120" style="object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;margin:0 6px 6px 0;" />`).join('')}</div>
      </div>` : ''}
      <p>Please let me know if you have any questions or need anything else.</p>`
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

    const html = await buildEmail(buildBriefHtml({ contractorName: contractorName || '', personalMsg: personalMsg || '', boardTitle, itemTitle, groupName, status, responsible, updates: updates || [] }), { sender: await senderFor(request) })

    const allLinks  = (updates || []).flatMap((u: Update) => u.links  || [])
    const allImages = (updates || []).flatMap((u: Update) => u.images || [])
    const subject = `Project brief: ${itemTitle}${groupName ? ` — ${groupName}` : ''}`

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return Response.json({ error: 'Email service not configured' }, { status: 500 })

    const emailRes = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(await senderFields(request)), to: [contractorEmail], subject, html }),
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
