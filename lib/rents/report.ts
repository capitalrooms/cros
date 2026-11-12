// The local market report (12 Nov 2026, Harry: "compare 3 local boroughs where an individual has properties — a full
// report maker for email or PDF"). Up to three areas side by side — rents by bedrooms, prices by type, yields, trends,
// our own rooms — with a short commentary written from the figures. As a PDF on our letterhead (lib/pdf/palette — the
// paperwork standard) and as an email. Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL_SMART } from '@/lib/ai-classify'
import { areaPack, packText, SOURCES, type AreaPack } from '@/lib/rents/areaPack'
import { PDF } from '@/lib/pdf/palette'
import { loadPDFLetterheadAssets, fetchPDFBizSettings, drawPDFLogo, drawPDFFooter, PAGE_W, PAGE_H, MARGIN, COL_W, LOGO_H, FOOTER_BAND_H } from '@/lib/pdfLetterhead'

const gbp = (n: number | null | undefined) => n == null ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`
const gbpK = (n: number | null | undefined) => n == null ? '—' : n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(2)}m` : `£${Math.round(n / 1000)}k`
const pct = (n: number | null | undefined) => n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}%`
const mon = (iso: string) => new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The boroughs a landlord's houses are in, most houses first (up to three). */
export async function landlordAreas(s: SupabaseClient, landlordId: string): Promise<string[]> {
  const { data } = await s.from('properties').select('postcode').eq('landlord_id', landlordId).not('postcode', 'is', null)
  const pcs = ((data ?? []) as any[]).map(p => p.postcode)
  if (!pcs.length) return []
  const r = await fetch('https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postcodes: pcs.slice(0, 100) }) }).then(x => x.json()).catch(() => null)
  const count = new Map<string, number>()
  for (const row of r?.result ?? []) { const c = row?.result?.codes?.admin_district; if (c) count.set(c, (count.get(c) ?? 0) + 1) }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 3)
}

export async function reportPacks(s: SupabaseClient, codes: string[]) {
  return (await Promise.all(codes.slice(0, 3).map(c => areaPack(s, c)))).filter(Boolean) as AreaPack[]
}

/** A short commentary written from the figures (and, for reasons, recent news — marked as such). */
export async function reportCommentary(packs: AreaPack[], forName: string | null): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY || !packs.length) return ''
  const client = new Anthropic()
  const prompt = `Write the commentary for Capital Rooms' local market report${forName ? ` for our landlord ${forName}` : ''}, comparing: ${packs.map(p => p.name).join(', ')}.

THE FIGURES (official — use exactly, never invent):
${packs.map(packText).join('\n\n')}

Write 150–220 words in British English, warm and professional, to a landlord:
- One short paragraph per theme: rents (where they're rising fastest, by bedrooms), house prices (direction, by type of home), yields, and what it means for letting in these areas.
- You may search recent UK news for a likely reason behind a big move; if you use one, say "possibly" and keep it to a clause.
- Rents are whole homes unless it says Capital Rooms' own; house prices are by type of home, not bedrooms.
- Plain paragraphs separated by blank lines. No headings, no bullets, no greeting or sign-off.`
  const run = (tools: boolean) => client.messages.create({ model: AI_MODEL_SMART, max_tokens: 1200,
    ...(tools ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2, user_location: { type: 'approximate', country: 'GB', city: 'London' } } as any] } : {}),
    messages: [{ role: 'user', content: prompt }] })
  let res; try { res = await run(true) } catch { res = await run(false) }
  return (res.content as any[]).filter(x => x.type === 'text').map(x => x.text).join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** The comparison as rows: [label, value per area]. */
export function comparison(packs: AreaPack[]): [string, string[]][] {
  const row = (label: string, f: (p: AreaPack) => string): [string, string[]] => [label, packs.map(f)]
  return [
    row('Average rent (a month)', p => gbp(p.rents.rent_all)),
    row('Change on a year', p => pct(p.rents.change_all)),
    row('1-bed home', p => gbp(p.rents.rent_1)),
    row('2-bed home', p => gbp(p.rents.rent_2)),
    row('3-bed home', p => gbp(p.rents.rent_3)),
    row('4+ bed home', p => gbp(p.rents.rent_4)),
    row('Room — our lets', p => p.ours?.roomMedian ? gbp(p.ours.roomMedian) : '—'),
    row('En-suite — our lets', p => p.ours?.ensuiteMedian ? gbp(p.ours.ensuiteMedian) : '—'),
    row('Average house price', p => gbpK(p.sales?.average)),
    row('Price change on a year', p => pct(p.sales?.change12)),
    row('Flat or maisonette (any size)', p => gbpK(p.sales?.flat)),
    row('Terraced house', p => gbpK(p.sales?.terraced)),
    row('Gross yield', p => p.yieldAll ? `${p.yieldAll}%` : '—'),
  ]
}

export const reportTitle = (packs: AreaPack[]) => `Local market report — ${packs.map(p => p.name).join(', ')}`
const periods = (packs: AreaPack[]) => `Rents ${mon(packs[0].rents.period)}${packs[0].sales ? ` · house prices ${mon(packs[0].sales.month)}` : ''}`

/** A small bar chart made of table cells — shows in every email app (no images). Signed values grow from the middle. */
function bars(title: string, rows: { name: string; value: number | null; label: string }[], signed = false): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const vals = rows.map(r => Math.abs(r.value ?? 0)), max = Math.max(...vals, 0.0001)
  const line = (r: { name: string; value: number | null; label: string }) => {
    const w = Math.max(2, Math.round(Math.abs(r.value ?? 0) / max * (signed ? 48 : 96)))
    const bar = `<td style="width:${w}%;background:${(r.value ?? 0) < 0 ? PDF.alert : PDF.forest};height:12px;font-size:0;line-height:0">&nbsp;</td>`
    const cells = signed
      ? (r.value ?? 0) < 0 ? `<td style="width:${50 - w}%"></td>${bar}<td style="width:50%;border-left:1px solid ${PDF.line}"></td>` : `<td style="width:50%;border-right:1px solid ${PDF.line}"></td>${bar}<td style="width:${50 - w}%"></td>`
      : `${bar}<td style="width:${100 - w}%"></td>`
    return `<tr><td style="padding:4px 10px 4px 0;font-size:13px;color:${PDF.ink};white-space:nowrap;width:38%">${esc(r.name)}</td><td style="padding:4px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>${cells}</tr></table></td><td style="padding:4px 0 4px 10px;font-size:13px;font-weight:700;color:${PDF.ink};text-align:right;white-space:nowrap">${esc(r.label)}</td></tr>`
  }
  return `<div style="margin:22px 0;padding:14px 16px;background:${PDF.tint};border-radius:12px"><p style="margin:0 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${PDF.gold};font-weight:700">${esc(title)}</p><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows.map(line).join('')}</table></div>`
}

/** The email body (also the on-screen preview). */
export function reportHtml(packs: AreaPack[], commentary: string, dear: string | null): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const rows = comparison(packs).map(([l, vs], i) => `<tr style="background:${i % 2 ? '#ffffff' : PDF.tint}"><td style="padding:7px 10px;color:${PDF.muted};font-size:13px">${esc(l)}</td>${vs.map(v => `<td style="padding:7px 10px;text-align:right;font-weight:600;color:${PDF.ink};font-size:14px">${esc(v)}</td>`).join('')}</tr>`).join('')
  return `${dear ? `<p>${esc(dear)}</p>` : ''}
<p>Here’s how the market is moving in ${esc(packs.map(p => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1'))} — the latest official figures, with what we’re seeing in our own rooms. The full report is attached as a PDF.</p>
<p style="margin:18px 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${PDF.gold};font-weight:700">${esc(periods(packs))}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:2px solid ${PDF.forest}">
<tr><td></td>${packs.map(p => `<td style="padding:8px 10px;text-align:right;font-weight:700;color:${PDF.forest};font-size:14px">${esc(p.name)}</td>`).join('')}</tr>${rows}</table>
${bars('Average rent a month', packs.map(p => ({ name: p.name, value: p.rents.rent_all, label: gbp(p.rents.rent_all) })))}
${commentary.split(/\n\n+/).map((p, i, all) => `<p>${esc(p)}</p>${i === Math.floor(all.length / 2) - 1 ? bars('Change on a year', packs.flatMap(x => [{ name: `${x.name} — rents`, value: x.rents.change_all, label: pct(x.rents.change_all) }, { name: `${x.name} — prices`, value: x.sales?.change12 ?? null, label: pct(x.sales?.change12) }]), true) : ''}`).join('')}
${bars('Gross yield', packs.map(p => ({ name: p.name, value: p.yieldAll, label: p.yieldAll ? `${p.yieldAll}%` : '—' })))}
<p style="font-size:12px;color:${PDF.muted}">Sources: ${esc(SOURCES.rents)} and ${esc(SOURCES.sales)} (Crown copyright, Open Government Licence); room rents from Capital Rooms’ own lets. Rents are whole homes unless marked as rooms; house prices are by type of home. A guide, not a valuation.</p>`
}

/** A simple line chart on the page: one line per area. */
function chart(doc: any, x: number, y: number, w: number, h: number, title: string, series: { name: string; points: (number | null)[] }[], labels: string[], fmt: (n: number) => string, fontReg: string, fontBold: string) {
  const colours = [PDF.forest, PDF.gold, PDF.muted]
  const vals = series.flatMap(s => s.points.filter((v): v is number => v != null))
  doc.font(fontBold).fontSize(10).fillColor(PDF.forest).text(title, x, y)
  const top = y + 34, bottom = y + h - 16
  if (!vals.length) { doc.font(fontReg).fontSize(9).fillColor(PDF.muted).text('No figures', x, top); return }
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.1 || hi * 0.05; lo -= pad; hi += pad
  const n = Math.max(...series.map(s => s.points.length))
  const px = (i: number) => x + 40 + (w - 50) * (n <= 1 ? 0 : i / (n - 1)), py = (v: number) => bottom - (bottom - top) * (v - lo) / (hi - lo)
  for (let k = 0; k <= 3; k++) {
    const v = lo + (hi - lo) * k / 3, yy = py(v)
    doc.save().strokeColor(PDF.line).lineWidth(0.4).moveTo(x + 40, yy).lineTo(x + w - 10, yy).stroke().restore()
    doc.font(fontReg).fontSize(7).fillColor(PDF.muted).text(fmt(v), x, yy - 4, { width: 36, align: 'right' })
  }
  const step = Math.max(1, Math.ceil(n / 6))
  labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) doc.font(fontReg).fontSize(7).fillColor(PDF.muted).text(l, px(i) - 20, bottom + 4, { width: 40, align: 'center' }) })
  series.forEach((s, si) => {
    doc.save().strokeColor(colours[si % 3]).lineWidth(1.6)
    let started = false
    s.points.forEach((v, i) => { if (v == null) return; if (!started) { doc.moveTo(px(i), py(v)); started = true } else doc.lineTo(px(i), py(v)) })
    doc.stroke().restore()
  })
  let lx = x
  series.forEach((s, si) => { doc.save().rect(lx, y + 19, 10, 3).fill(colours[si % 3]).restore(); doc.font(fontReg).fontSize(8).fillColor(PDF.ink).text(s.name, lx + 13, y + 16, { lineBreak: false }); lx += 13 + doc.widthOfString(s.name) + 14 })
}

export async function reportPdf(packs: AreaPack[], commentary: string, forName: string | null): Promise<Buffer> {
  const [{ logoImg, footerImg, fontReg, fontBold }, biz] = await Promise.all([Promise.resolve(loadPDFLetterheadAssets()), fetchPDFBizSettings()])
  // @ts-ignore pdfkit ships without types here
  const PDFKit = (await import('pdfkit')).default
  const doc = new PDFKit({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: reportTitle(packs), Author: 'Capital Rooms' } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const bottom = PAGE_H - FOOTER_BAND_H - 24
  const head = (t: string, y: number) => { doc.font(fontBold).fontSize(8).fillColor(PDF.gold).text(t.toUpperCase(), MARGIN, y, { characterSpacing: 1 }); doc.save().strokeColor(PDF.forest).lineWidth(1).moveTo(MARGIN, y + 12).lineTo(PAGE_W - MARGIN, y + 12).stroke().restore(); return y + 20 }

  drawPDFLogo(doc, logoImg)
  doc.font(fontReg).fontSize(9).fillColor(PDF.muted).text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }), MARGIN, MARGIN)
  doc.font(fontBold).fontSize(20).fillColor(PDF.forest).text('Local market report', MARGIN, MARGIN + 28, { width: COL_W - 110 })
  doc.font(fontReg).fontSize(11).fillColor(PDF.ink).text(packs.map(p => p.name).join(' · '), MARGIN, doc.y + 2, { width: COL_W - 110 })
  doc.font(fontReg).fontSize(9).fillColor(PDF.muted).text(`${forName ? `Prepared for ${forName} · ` : ''}${periods(packs)}`, MARGIN, doc.y + 2, { width: COL_W - 110 })
  let y = Math.max(doc.y + 16, MARGIN + LOGO_H + 14)

  // the comparison table
  y = head('At a glance', y)
  const labelW = 170, colW = (COL_W - labelW) / packs.length
  doc.font(fontBold).fontSize(9.5).fillColor(PDF.forest)
  packs.forEach((p, i) => doc.text(p.name, MARGIN + labelW + colW * i, y, { width: colW - 6, align: 'right' }))
  y += 16
  comparison(packs).forEach(([l, vs], i) => {
    if (i % 2 === 0) doc.save().rect(MARGIN, y - 3, COL_W, 16).fill(PDF.tint).restore()
    doc.font(fontReg).fontSize(9).fillColor(PDF.muted).text(l, MARGIN + 4, y, { width: labelW - 8 })
    vs.forEach((v, k) => doc.font(fontBold).fontSize(9.5).fillColor(PDF.ink).text(v, MARGIN + labelW + colW * k, y, { width: colW - 6, align: 'right' }))
    y += 16
  })
  y += 10

  // trends
  if (y + 170 > bottom) { doc.addPage(); drawPDFLogo(doc, logoImg); y = MARGIN + LOGO_H + 20 }
  y = head('Trends', y)
  const rentLabels = packs[0].rentTrend.map(t => new Date(`${t.period}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }))
  chart(doc, MARGIN, y, COL_W / 2 - 8, 165, 'Average rent, last 3 years', packs.map(p => ({ name: p.name, points: p.rentTrend.map(t => t.all) })), rentLabels, v => `£${Math.round(v).toLocaleString('en-GB')}`, fontReg, fontBold)
  const saleLabels = packs[0].salesTrend.map(t => new Date(`${t.month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }))
  chart(doc, MARGIN + COL_W / 2 + 8, y, COL_W / 2 - 8, 165, 'Average house price, last 2 years', packs.map(p => ({ name: p.name, points: p.salesTrend.map(t => t.average) })), saleLabels, v => `£${Math.round(v / 1000)}k`, fontReg, fontBold)
  y += 180

  // commentary
  if (commentary) {
    if (y + 80 > bottom) { doc.addPage(); drawPDFLogo(doc, logoImg); y = MARGIN + LOGO_H + 20 }
    y = head('What it means', y)
    for (const para of commentary.split(/\n\n+/)) {
      const h = doc.font(fontReg).fontSize(10).heightOfString(para, { width: COL_W, lineGap: 2 })
      if (y + h > bottom) { doc.addPage(); drawPDFLogo(doc, logoImg); y = MARGIN + LOGO_H + 20 }
      doc.font(fontReg).fontSize(10).fillColor(PDF.ink).text(para, MARGIN, y, { width: COL_W, lineGap: 2 }); y = doc.y + 8
    }
  }
  if (y + 40 > bottom) { doc.addPage(); drawPDFLogo(doc, logoImg); y = MARGIN + LOGO_H + 20 }
  doc.font(fontReg).fontSize(7.5).fillColor(PDF.muted).text(`Sources: ${SOURCES.rents} (ONS) and ${SOURCES.sales} (HM Land Registry) — Crown copyright, Open Government Licence; room rents from Capital Rooms’ own lets. Rents are whole homes unless marked as rooms; house prices are by type of home, not bedrooms, and recent months are early estimates. A guide to the market, not a valuation of any property.`, MARGIN, y + 6, { width: COL_W })

  const range = (doc as any).bufferedPageRange?.() || { start: 0, count: 1 }
  for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); drawPDFFooter(doc, footerImg, biz, fontReg) }
  doc.end()
  return new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))
}
