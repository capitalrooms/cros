// Fire escape plans in one Capital Rooms style (17 Nov 2026, Harry: "import fire plans like this and then remake them with
// a standardised style that suits the app but just uses the text"). Claude reads whatever plan we're given (PDF, photo)
// and takes out only the real instructions — escape routes, what to do, who to call, the assembly point — leaving any
// template filler ("Lorem ipsum…") behind; then it's laid out on our letterhead in the paperwork palette (lib/pdf/palette)
// and filed on the property as a Fire / Emergency Exit Plan beside the original. Server-only.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL_SMART } from '@/lib/ai-classify'
import { PDF } from '@/lib/pdf/palette'
import { loadPDFLetterheadAssets, drawPDFFooter, fetchPDFBizSettings, PAGE_W, MARGIN, COL_W, FOOTER_BAND_H, PAGE_H } from '@/lib/pdfLetterhead'

export interface FirePlan {
  address: string | null
  onDiscovery: string[]        // if you discover a fire or hear the alarm
  escapeRoutes: string[]
  callForHelp: string[]        // 999 and what to say; our emergency number
  evacuate: string[]
  assemblyPoint: string | null
  doNot: string[]
  other: string[]              // anything else real (fire equipment locations, refuge points…)
}

function media(bytes: Buffer, mime: string): any {
  if (mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } }
  return { type: 'image', source: { type: 'base64', media_type: /png/.test(mime) ? 'image/png' : /webp/.test(mime) ? 'image/webp' : 'image/jpeg', data: bytes.toString('base64') } }
}

export async function readFirePlan(bytes: Buffer, mime: string, houseHint?: string | null): Promise<FirePlan> {
  const client = new Anthropic()
  const res = await client.messages.create({
    model: AI_MODEL_SMART, max_tokens: 2000,
    tool_choice: { type: 'tool', name: 'fire_plan' },
    tools: [{ name: 'fire_plan', description: 'The fire escape plan, as instructions', input_schema: { type: 'object', required: ['onDiscovery', 'escapeRoutes', 'callForHelp', 'evacuate', 'doNot', 'other'], properties: {
      address: { type: 'string', description: 'The building address as written, if any' },
      onDiscovery: { type: 'array', items: { type: 'string' } }, escapeRoutes: { type: 'array', items: { type: 'string' } },
      callForHelp: { type: 'array', items: { type: 'string' } }, evacuate: { type: 'array', items: { type: 'string' } },
      assemblyPoint: { type: 'string' }, doNot: { type: 'array', items: { type: 'string' } }, other: { type: 'array', items: { type: 'string' } },
    } } } as any],
    messages: [{ role: 'user', content: [media(bytes, mime), { type: 'text', text: `This is a fire escape / evacuation plan for a shared house${houseHint ? ` (${houseHint})` : ''}. Take out ONLY its real instructions, in its own words, tidied into short clear steps (British English, sentence case — no SHOUTING capitals). Leave out template filler (e.g. "Lorem ipsum", "Aliquam…"), page furniture and repeats. Put each instruction in the right list: what to do on discovering a fire or hearing the alarm; the escape routes (one per route, e.g. "Through the front door"); calling for help (999 and what to tell them; the managing agent's emergency number); evacuating; the assembly point; things not to do (e.g. don't use lifts, don't go back in); anything else real (where the fire blanket / extinguishers are). Never invent an instruction that isn't there.` }] }],
  })
  const t = (res.content as any[]).find(x => x.type === 'tool_use')?.input ?? {}
  const arr = (v: unknown) => (Array.isArray(v) ? v : []).map(x => String(x).trim()).filter(Boolean).slice(0, 12)
  return { address: t.address ? String(t.address) : null, onDiscovery: arr(t.onDiscovery), escapeRoutes: arr(t.escapeRoutes), callForHelp: arr(t.callForHelp), evacuate: arr(t.evacuate), assemblyPoint: t.assemblyPoint ? String(t.assemblyPoint) : null, doNot: arr(t.doNot), other: arr(t.other) }
}

/** The plan on our letterhead: one heading, numbered steps per section, the assembly point boxed. */
export async function renderFirePlan(plan: FirePlan, house: string): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default
  const a = loadPDFLetterheadAssets()
  const biz = await fetchPDFBizSettings().catch(() => undefined)
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: FOOTER_BAND_H + 24 } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<Buffer>(r => doc.on('end', () => r(Buffer.concat(chunks))))
  doc.registerFont('reg', a.fontReg); doc.registerFont('bold', a.fontBold); doc.registerFont('display', a.fontDisplay)

  if (a.logoImg.length) doc.image(a.logoImg, PAGE_W - MARGIN - 70, MARGIN - 6, { width: 70 })
  doc.font('bold').fontSize(9).fillColor(PDF.gold).text('FIRE ESCAPE PLAN', MARGIN, MARGIN, { characterSpacing: 1.5 })
  doc.font('display').fontSize(26).fillColor(PDF.forest).text('In the event of fire', MARGIN, MARGIN + 16, { width: COL_W - 90 })
  doc.font('reg').fontSize(11).fillColor(PDF.muted).text(plan.address || house, { width: COL_W - 90 })
  doc.moveDown(0.8)
  doc.save().moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).lineWidth(1.2).strokeColor(PDF.gold).stroke().restore()
  doc.moveDown(1)

  const section = (title: string, items: string[], numbered = true) => {
    if (!items.length) return
    if (doc.y > PAGE_H - FOOTER_BAND_H - 110) doc.addPage()
    doc.font('bold').fontSize(13).fillColor(PDF.forest).text(title, MARGIN, doc.y)
    doc.moveDown(0.35)
    items.forEach((it, i) => {
      const y = doc.y
      doc.font('bold').fontSize(11).fillColor(PDF.gold).text(numbered ? `${i + 1}` : '•', MARGIN, y, { width: 18 })
      doc.font('reg').fontSize(11).fillColor(PDF.ink).text(it, MARGIN + 22, y, { width: COL_W - 22, lineGap: 2 })
      doc.moveDown(0.3)
    })
    doc.moveDown(0.7)
  }
  section('If you discover a fire or hear the alarm', plan.onDiscovery)
  section('Escape routes', plan.escapeRoutes)
  section('Call for help', plan.callForHelp)
  section('Evacuate the building', plan.evacuate)
  if (plan.assemblyPoint) {
    if (doc.y > PAGE_H - FOOTER_BAND_H - 90) doc.addPage()
    const y = doc.y
    doc.save().roundedRect(MARGIN, y, COL_W, 52, 8).fill(PDF.tint).restore()
    doc.font('bold').fontSize(9).fillColor(PDF.gold).text('ASSEMBLY POINT', MARGIN + 14, y + 10, { characterSpacing: 1.2 })
    doc.font('bold').fontSize(13).fillColor(PDF.forest).text(plan.assemblyPoint, MARGIN + 14, y + 24, { width: COL_W - 28 })
    doc.y = y + 64
  }
  section('Do not', plan.doNot, false)
  section('Also', plan.other, false)

  // the letterhead footer on every page
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); drawPDFFooter(doc, a.footerImg, biz, a.fontReg) }
  doc.end()
  return finished
}

/** Read the plan, lay it out, and file it on the property (Fire / Emergency Exit Plan). Returns the new document id. */
export async function remakeFirePlan(s: SupabaseClient, o: { propertyId: string; bytes: Buffer; mime: string; byPersonId?: string | null }) {
  const { data: prop } = await s.from('properties').select('name, address').eq('id', o.propertyId).maybeSingle() as { data: any }
  const house = String(prop?.name ?? prop?.address ?? '').split('\n').join(', ')
  const plan = await readFirePlan(o.bytes, o.mime, house)
  if (!plan.escapeRoutes.length && !plan.onDiscovery.length && !plan.evacuate.length) return { error: 'No fire plan instructions found in that file.' }
  const pdf = await renderFirePlan(plan, house)
  const path = `fire-plans/${o.propertyId}/${Date.now()}-fire-escape-plan.pdf`
  const up = await s.storage.from('property-documents').upload(path, pdf, { contentType: 'application/pdf', upsert: false })
  if (up.error) return { error: up.error.message }
  const { data: pub } = s.storage.from('property-documents').getPublicUrl(path)
  const fileName = `Fire escape plan - ${house.split(',')[0]}.pdf`
  const { data, error } = await s.from('property_documents').insert({ property_id: o.propertyId, document_type: 'evacuation_plan', file_name: fileName, storage_url: pub.publicUrl, file_size: pdf.length, description: 'Fire escape plan — Capital Rooms layout (made from the plan on file)', uploaded_by: o.byPersonId ?? null, visible_to_tenants: true }).select('id').single()
  if (error) return { error: error.message }
  return { id: (data as any).id as string, plan }
}

export const EMPTY_PLAN: FirePlan = { address: null, onDiscovery: [], escapeRoutes: [], callForHelp: [], evacuate: [], assemblyPoint: null, doNot: [], other: [] }

/** The printable version (17 Nov 2026): A4 landscape, the logo, the steps in columns, the assembly point boxed — and the
 *  house's own floor-plan drawing beside them when we have one as an image (it can't be redrawn, so it's used as it is). */
export async function renderFirePlanLandscape(plan: FirePlan, house: string, drawing?: Buffer | null): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default
  const a = loadPDFLetterheadAssets()
  const W = 841.89, H = 595.28, M = 36
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: M, left: M, right: M, bottom: M } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<Buffer>(r => doc.on('end', () => r(Buffer.concat(chunks))))
  doc.registerFont('reg', a.fontReg); doc.registerFont('bold', a.fontBold); doc.registerFont('display', a.fontDisplay)

  // header band
  doc.save().rect(0, 0, W, 78).fill(PDF.forest).restore()
  doc.font('bold').fontSize(9).fillColor(PDF.gold).text('FIRE EVACUATION PLAN', M, 18, { characterSpacing: 1.6 })
  doc.font('display').fontSize(24).fillColor(PDF.white).text('In the event of fire', M, 31)
  doc.font('reg').fontSize(10).fillColor('#C9D6CC').text(plan.address || house, M, 58, { width: W - 2 * M - 120 })
  if (a.logoImg.length) { doc.save().roundedRect(W - M - 64, 9, 64, 60, 6).fill(PDF.white).restore(); doc.image(a.logoImg, W - M - 58, 13, { width: 52 }) }

  const top = 96, bottom = H - 30
  const hasDrawing = !!drawing?.length
  const colsW = hasDrawing ? (W - 2 * M) * 0.58 : W - 2 * M
  const colW = (colsW - 16) / 2
  const sections: [string, string[], boolean][] = [
    ['If you discover a fire or hear the alarm', plan.onDiscovery, true], ['Escape routes', plan.escapeRoutes, true],
    ['Call for help', plan.callForHelp, true], ['Evacuate the building', plan.evacuate, true], ['Do not', plan.doNot, false], ['Also', plan.other, false],
  ].filter(([, xs]) => (xs as string[]).length) as [string, string[], boolean][]
  let col = 0, y = top
  const x = () => M + col * (colW + 16)
  for (const [title, items, numbered] of sections) {
    const need = 22 + items.reduce((acc, it) => acc + doc.font('reg').fontSize(10).heightOfString(it, { width: colW - 18 }) + 4, 0)
    if (y + need > bottom - (col === 1 && plan.assemblyPoint ? 0 : 0) && y > top) { col = Math.min(col + 1, 1); y = top }
    doc.font('bold').fontSize(11.5).fillColor(PDF.forest).text(title, x(), y, { width: colW }); y = doc.y + 4
    items.forEach((it, i) => {
      doc.font('bold').fontSize(10).fillColor(PDF.gold).text(numbered ? `${i + 1}` : '•', x(), y, { width: 14 })
      doc.font('reg').fontSize(10).fillColor(PDF.ink).text(it, x() + 18, y, { width: colW - 18, lineGap: 1.5 }); y = doc.y + 4
    })
    y += 10
  }
  if (plan.assemblyPoint) {
    const bx = hasDrawing ? M : M + colW + 16, bw = hasDrawing ? colsW : colW, by = Math.min(Math.max(y, top), bottom - 58)
    doc.save().roundedRect(bx, by, bw, 52, 8).fill(PDF.tint).restore()
    doc.font('bold').fontSize(9).fillColor(PDF.gold).text('ASSEMBLY POINT', bx + 14, by + 10, { characterSpacing: 1.2 })
    doc.font('bold').fontSize(13).fillColor(PDF.forest).text(plan.assemblyPoint, bx + 14, by + 24, { width: bw - 28 })
  }
  if (hasDrawing) {
    const dx = M + colsW + 18, dw = W - M - dx
    try { doc.image(drawing!, dx, top, { fit: [dw, bottom - top], align: 'center', valign: 'top' }) } catch { /* not an image pdfkit can read */ }
  }
  doc.font('reg').fontSize(8).fillColor(PDF.muted).text('Capital Rooms · Emergency line 0207 112 9163 · In any emergency call 999 first', M, H - 22, { width: W - 2 * M, align: 'center' })
  doc.end()
  return finished
}
