// The email a tenant gets when their notice is recorded, and the move-out form attached to it (29 Oct 2026, Harry: the
// one sent to Flat 4708 was a single line — "make it more COHAB style, attach the check out pdf in a form for them to
// review… single let check outs and room check outs are different"). Two versions from one place:
//   whole home (single let) — the whole property: every room, garden, meters, utilities, council tax, all the keys
//   room in a shared house  — their room plus a fair share of the shared areas; the house carries on around them
// The form is a fillable PDF (forwarding address, meter readings, keys, anything to tell us) they can fill on a
// phone or computer and send back, or bring to the check-out. Server-only.
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib'
import { loadPDFLetterheadAssets } from '@/lib/pdfLetterhead'
import { isWholeLet, placeLabel } from '@/lib/lettings/letWording'
import { propertyPaperworkAddress } from '@/lib/properties/names'
import { dearFromText } from '@/lib/people'
import { getBusinessSettings } from '@/lib/emailWrapper'

export interface MoveOut {
  whole: boolean
  dear: string                 // "Ms Smith" — lib/people
  place: string                // "Flat 4708, Bagshaw Building, 1 Wards Place, London, E14 9EJ" or "Room 2, 44 Bridgeland Road, …"
  moveOutDate: string          // YYYY-MM-DD
  lastRent?: { amount: number; days?: number | null } | null
  deposit?: number | null
  depositProtected?: boolean
  phone?: string | null
  email?: string | null
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** What to do before handing back the keys — the checklist in the email and printed on the form. */
export function moveOutChecklist(whole: boolean): { title: string; items: string[] }[] {
  return whole
    ? [
        { title: 'The home', items: ['Clean every room, including the oven, hob, extractor, fridge and freezer (switched off, doors open)', 'Bathrooms descaled; windows and sills wiped', 'Garden, balcony and bin store left tidy; bins emptied', 'Take everything that is yours, including from lofts, cupboards and sheds'] },
        { title: 'Meters and bills', items: ['Take photos of the gas, electricity and water meters on the day you leave', 'Give the readings to your suppliers and close your accounts', 'Tell the council your council tax ends on your move-out date', 'Cancel or move your broadband and TV licence; set up Royal Mail redirection'] },
        { title: 'Keys', items: ['Every key, fob, permit and remote we gave you — and any copies you had cut'] },
      ]
    : [
        { title: 'Your room', items: ['Empty and clean — floor hoovered, surfaces wiped, inside drawers and wardrobe', 'Furniture back where it was when you moved in', 'Nothing left under the bed or on top of the wardrobe'] },
        { title: 'Shared areas', items: ['Clear your fridge and freezer shelf and your kitchen cupboard', 'Take your things from the bathroom and hallway', 'Leave the kitchen and bathroom as you would want to find them'] },
        { title: 'Keys and post', items: ['Your room key and front door keys (and any fob)', 'Set up Royal Mail redirection; change your address with your bank and employer'] },
      ]
}

export function moveOutEmail(m: MoveOut): { subject: string; html: string } {
  const what = m.whole ? 'the property' : 'your room'
  const steps: [string, string][] = [
    ['Before you go', `Have a look at the checklist below and the move-out form attached. Fill in the form when you can — it tells us where to reach you and ${m.whole ? 'the meter readings' : 'anything we should know'}.`],
    ['Check-out', `On or just before ${day(m.moveOutDate)} we’ll check ${what} against the inventory from when you moved in. We’ll get in touch to agree a time — you’re welcome to be there.`],
    ['Keys', 'Hand back every key on the day. If you can’t meet us, we’ll tell you where to leave them safely.'],
    ['Your deposit', `${m.deposit ? `Your deposit of ${money(m.deposit)} ${m.depositProtected ? 'is held in a government-approved protection scheme' : 'is ready to come back to you'}. ` : ''}We’ll tell you about any deductions with photos, and once we’ve agreed the amount it’s paid back within 10 days.`],
  ]
  const lastRent = m.lastRent?.amount ? `<p style="margin:14px 0 0;font-size:14px;color:#3f3c38">Your last rent payment is <strong>${money(m.lastRent.amount)}</strong>${m.lastRent.days ? ` for ${m.lastRent.days} day${m.lastRent.days === 1 ? '' : 's'}` : ''}, up to your move-out date.</p>` : ''
  const card = 'border:1px solid #E7E3DC;border-radius:14px;padding:18px 20px;margin:0 0 14px;background:#ffffff'
  const html = `
<p style="margin:0 0 14px;font-size:15px;color:#1f1d1a">Dear ${esc(m.dear)},</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#1f1d1a">Thank you for letting us know. We’ve recorded your notice for ${esc(m.place)}, and we’re sorry to see you go. Here’s everything you need for a smooth move-out.</p>
<div style="${card};background:#F7F5F1;text-align:center">
  <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7b766e">Your move-out date</p>
  <p style="margin:6px 0 0;font-size:24px;font-weight:700;color:#1f1d1a">${day(m.moveOutDate)}</p>
  ${lastRent}
</div>
<div style="${card}">
  <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1f1d1a">What happens next</p>
  ${steps.map(([h, t], i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:${i ? '12px' : '0'} 0 0"><tr>
    <td style="width:28px;vertical-align:top"><span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:#1f1d1a;color:#fff;font-size:12px;font-weight:700;line-height:22px;text-align:center">${i + 1}</span></td>
    <td style="vertical-align:top;font-size:14px;line-height:1.55;color:#3f3c38"><strong style="color:#1f1d1a">${h}.</strong> ${t}</td></tr></table>`).join('')}
</div>
<div style="${card}">
  <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1f1d1a">Before you hand back the keys</p>
  ${moveOutChecklist(m.whole).map(g => `<p style="margin:12px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7b766e">${g.title}</p>
  <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;color:#3f3c38">${g.items.map(i => `<li>${i}</li>`).join('')}</ul>`).join('')}
</div>
<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#3f3c38"><strong style="color:#1f1d1a">Attached:</strong> your move-out form. You can fill it in on your phone or computer and reply with it, or bring it on the day.</p>
<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#3f3c38">Any questions, just reply to this email${m.phone ? ` or call ${esc(m.phone)}` : ''}. Thank you for living with us.</p>`
  return { subject: `Your move-out — ${day(m.moveOutDate)}`, html }
}

/** The fillable move-out form (A4). Fields can be typed into on a phone or computer. */
export async function moveOutFormPdf(m: MoveOut & { tenantName: string }): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Move-out form'); pdf.setAuthor('Capital Rooms')
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const form = pdf.getForm()
  const ink = rgb(0.12, 0.11, 0.1), grey = rgb(0.45, 0.43, 0.4), line = rgb(0.86, 0.84, 0.8)
  const L = 48, W = 595.28 - 96
  let y = 800

  try {
    const { logoImg } = loadPDFLetterheadAssets() as any
    if (logoImg?.length) { const img = await pdf.embedPng(logoImg); const h = 46, w = img.width * (h / img.height); page.drawImage(img, { x: L + W - w, y: y - h + 10, width: w, height: h }) }
  } catch { /* logo is a nicety */ }

  const text = (s: string, x: number, yy: number, size = 10, f = font, c = ink) => page.drawText(s, { x, y: yy, size, font: f, color: c })
  text('Move-out form', L, y - 8, 20, bold); y -= 30
  text(`${m.tenantName} · ${m.place}`.slice(0, 110), L, y, 9.5, font, grey); y -= 14
  text(`Moving out ${day(m.moveOutDate)}`, L, y, 9.5, font, grey); y -= 26

  let n = 0
  const field = (label: string, h = 22, multiline = false) => {
    text(label, L, y, 9, bold); y -= h + 4
    const f = form.createTextField(`f${n++}`)
    if (multiline) f.enableMultiline()
    f.addToPage(page, { x: L, y, width: W, height: h, borderColor: line, borderWidth: 1, backgroundColor: rgb(0.985, 0.98, 0.97), font })
    f.setFontSize(multiline ? 9.5 : 10.5)
    y -= 14
  }
  const pair = (a: string, b: string) => {
    text(a, L, y, 9, bold); text(b, L + W / 2 + 6, y, 9, bold); y -= 26
    for (const [i, x] of [[0, L], [1, L + W / 2 + 6]] as const) {
      const f = form.createTextField(`f${n++}`)
      f.addToPage(page, { x, y, width: W / 2 - 6, height: 22, borderColor: line, borderWidth: 1, backgroundColor: rgb(0.985, 0.98, 0.97), font }); f.setFontSize(10.5)
      void i
    }
    y -= 14
  }

  field('Forwarding address (for your deposit letters and any post)', 40, true)
  pair('Phone number after you move', 'Email address after you move')
  if (m.whole) {
    text('Meter readings on the day you leave (please keep photos)', L, y, 10, bold); y -= 16
    pair('Gas', 'Electricity'); pair('Water (if metered)', 'Date and time of the readings')
  }
  pair(m.whole ? 'Keys and fobs you are returning (how many of each)' : 'Keys you are returning (room, front door, fob)', 'Date you will hand back the keys')
  field('Anything broken, worn or not working that we should know about', 52, true)
  field('Anything else — e.g. best times for the check-out, or questions', 40, true)

  y -= 4
  text('Checklist', L, y, 10, bold); y -= 14
  for (const g of moveOutChecklist(m.whole)) {
    if (y < 120) break
    text(g.title, L, y, 8.5, bold, grey); y -= 12
    for (const it of g.items) {
      if (y < 110) break
      const cb = form.createCheckBox(`c${n++}`)
      cb.addToPage(page, { x: L, y: y - 2, width: 9, height: 9, borderColor: line, borderWidth: 1 })
      text(it.length > 100 ? it.slice(0, 99) + '…' : it, L + 15, y, 8.5, font, ink); y -= 13
    }
    y -= 3
  }

  y -= 8
  pair('Your name', 'Date')
  text(`Capital Rooms · Hoxton Mix, 66 Paul Street, London EC2A 4NA${m.email ? ` · ${m.email}` : ''}${m.phone ? ` · ${m.phone}` : ''}`, L, 36, 7.5, font, grey)
  return Buffer.from(await pdf.save())
}

/** Everything the email and form need, read from the tenancy — shared by the send (set-on-notice) and the preview,
 *  so what the office previews is exactly what goes. */
export async function prepareMoveOut(s: { from: (t: string) => any }, x: {
  tenancyId: string; moveOutDate: string; tenantName?: string | null; proRataAmount?: number | string | null; proRataDays?: number | string | null
  roomName?: string | null; propertyAddress?: string | null
}): Promise<MoveOut & { tenantName: string }> {
  const { data: t } = await s.from('tenancies').select('room_id, property_id, deposit_amount, deposit_protected_at, deposit_protection_assumed').eq('id', x.tenancyId).maybeSingle()
  const [{ data: prop }, { data: room }] = await Promise.all([
    t?.property_id ? s.from('properties').select('name, address, postcode, property_type').eq('id', t.property_id).maybeSingle() : Promise.resolve({ data: null }),
    t?.room_id ? s.from('rooms').select('name').eq('id', t.room_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const roomName = room?.name ?? x.roomName ?? null
  const whole = isWholeLet(prop?.property_type, roomName)
  const biz = await getBusinessSettings().catch(() => null as any)
  return {
    whole, dear: dearFromText(x.tenantName), tenantName: String(x.tenantName ?? ''),
    place: placeLabel(whole, roomName, prop ? propertyPaperworkAddress(prop) : String(x.propertyAddress ?? '')),
    moveOutDate: x.moveOutDate,
    lastRent: x.proRataAmount != null && Number(x.proRataAmount) > 0 ? { amount: Number(x.proRataAmount), days: x.proRataDays ? Number(x.proRataDays) : null } : null,
    deposit: t?.deposit_amount ? Number(t.deposit_amount) : null, depositProtected: !!(t?.deposit_protected_at || t?.deposit_protection_assumed),
    phone: biz?.phone ?? null, email: biz?.email ?? null,
  }
}
