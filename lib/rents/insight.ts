// The quarterly market insight (12 Nov 2026, Harry: "3 versions of a 4 quarter market insight with a London scene and
// then the season in question … choose what style I like for the updates or keep all 3 styles on file"). One set of
// London figures — rents (ONS), house prices (Land Registry), the boroughs moving most, our own rooms — laid out three
// ways, each opening on a London scene for the season (public/email/insight, scripts/insight-scenes.mjs):
//   editorial — a magazine letter: cream, serif headline, the story first
//   ink       — our video look: bold outlines, cards, bars
//   graphic   — a data card: forest band, big numbers, few words
// Email-safe (tables, no scripts, images by URL). Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'
import { salesFor, salesHistory } from '@/lib/rents/market'

export type InsightStyle = 'editorial' | 'ink' | 'graphic'
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export const STYLES: { key: InsightStyle; name: string; note: string }[] = [
  { key: 'editorial', name: 'Editorial', note: 'A magazine letter — warm cream, a serif headline, the story first' },
  { key: 'ink', name: 'Ink', note: 'Our video look — bold outlines, cards and bars' },
  { key: 'graphic', name: 'Graphic', note: 'A data card — a forest band, big numbers, few words' },
]
/** Q1 winter (Jan–Mar), Q2 spring, Q3 summer, Q4 autumn */
export const quarterOf = (d = new Date()) => { const q = Math.floor(d.getUTCMonth() / 3) + 1; return { q, year: d.getUTCFullYear(), season: (['winter', 'spring', 'summer', 'autumn'] as Season[])[q - 1] } }
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://capitalrooms.co.uk'
export const sceneUrl = (style: InsightStyle, season: Season) => `${SITE}/email/insight/${style}-${season}.png`

export interface Insight {
  quarter: { q: number; year: number; season: Season }
  rentMonth: string; priceMonth: string | null
  london: { rent: number; rent3: number | null; rent12: number | null; price: number | null; price3: number | null; price12: number | null; flat: number | null; yield: number | null }
  fastest: { name: string; change: number; rent: number }[]; slowest: { name: string; change: number; rent: number }[]
  ours: { rooms: number; median: number | null }
}

const pctOver = (a: number[], n: number) => a.length > n && a[a.length - 1 - n] ? Math.round((a[a.length - 1] - a[a.length - 1 - n]) / a[a.length - 1 - n] * 1000) / 10 : null

export async function londonInsight(s: SupabaseClient, when = new Date()): Promise<Insight> {
  const { data: L } = await s.from('ons_rents').select('*').eq('area_code', 'E12000007').single() as { data: any }
  const from = new Date(); from.setUTCMonth(from.getUTCMonth() - 8)
  const [{ data: hist }, { data: boroughs }, sales, sh, { data: lets }] = await Promise.all([
    s.from('ons_rents_history').select('period, rent_all').eq('area_code', 'E12000007').gte('period', from.toISOString().slice(0, 10)).order('period'),
    s.from('ons_rents').select('area_name, rent_all, change_all').eq('region', 'London').like('area_code', 'E09%'),
    salesFor('London'), salesHistory('London', 13),
    s.from('tenancies').select('rent_amount, end_date, let_cancelled_at, properties!inner(property_type)').lte('start_date', when.toISOString().slice(0, 10)),
  ]) as any[]
  const rents = ((hist ?? []) as any[]).map(h => h.rent_all).filter(Boolean)
  const prices = (sh ?? []).map((x: any) => x.average).filter(Boolean)
  const list = ((boroughs ?? []) as any[]).filter(b => b.change_all != null).sort((a, b) => b.change_all - a.change_all)
  const today = when.toISOString().slice(0, 10)
  const roomRents = ((lets ?? []) as any[]).filter(t => !t.let_cancelled_at && (!t.end_date || t.end_date >= today) && /hmo/i.test(String(t.properties?.property_type ?? 'hmo')) && Number(t.rent_amount) > 300).map(t => Number(t.rent_amount)).sort((a, b) => a - b)
  return {
    quarter: quarterOf(when), rentMonth: L.period, priceMonth: sales?.month ?? null,
    london: { rent: L.rent_all, rent3: pctOver(rents, 3), rent12: L.change_all, price: sales?.average ?? null, price3: pctOver(prices, 3), price12: sales?.change12 ?? null, flat: sales?.flat ?? null,
      yield: L.rent_all && sales?.average ? Math.round(L.rent_all * 12 / sales.average * 1000) / 10 : null },
    fastest: list.slice(0, 5).map(b => ({ name: b.area_name, change: b.change_all, rent: b.rent_all })),
    slowest: list.slice(-3).reverse().map(b => ({ name: b.area_name, change: b.change_all, rent: b.rent_all })),
    ours: { rooms: roomRents.length, median: roomRents.length ? roomRents[Math.floor(roomRents.length / 2)] : null },
  }
}

const gbp = (n: number | null) => n == null ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`
const gbpK = (n: number | null) => n == null ? '—' : `£${Math.round(n / 1000)}k`
const pct = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
const mon = (iso: string) => new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const SEASON_LINE: Record<Season, string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', autumn: 'Autumn' }

/** The story, in plain words from the figures (an AI-written version can replace it later). */
export function story(i: Insight): string[] {
  const L = i.london, f = i.fastest[0], sl = i.slowest[0]
  return [
    `London rents ${L.rent12! >= 0 ? 'rose' : 'fell'} ${Math.abs(L.rent12 ?? 0).toFixed(1)}% over the year to ${mon(i.rentMonth)}, to an average of ${gbp(L.rent)} a month${L.rent3 != null ? ` — ${pct(L.rent3)} in the last three months alone` : ''}.`,
    L.price12 != null ? `House prices went the other way: down ${Math.abs(L.price12).toFixed(1)}% on the year to ${gbpK(L.price)}, with flats at ${gbpK(L.flat)}. With rents rising and prices easing, the average London gross yield is now about ${L.yield}%.` : '',
    `${f.name} led the way, with rents up ${f.change.toFixed(1)}%, while ${sl.name} ${sl.change < 0 ? `slipped ${Math.abs(sl.change).toFixed(1)}%` : `barely moved (${pct(sl.change)})`}. For landlords, the strongest growth is in the boroughs where demand from young professionals is outrunning new homes.`,
  ].filter(Boolean)
}

/** Bars made of table cells — every email app shows them. */
function bars(rows: { name: string; value: number; label: string }[], colour: string, track: string, font: string, ink: string, border = ''): string {
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 0.1)
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows.map(r => {
    const w = Math.max(3, Math.round(Math.abs(r.value) / max * 100))
    return `<tr><td style="padding:5px 10px 5px 0;font:600 14px ${font};color:${ink};white-space:nowrap;width:34%">${esc(r.name)}</td><td style="padding:5px 0;width:50%"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${track}"><tr><td style="width:${w}%;background:${r.value < 0 ? '#9B2C1F' : colour};height:14px;${border}font-size:0;line-height:0">&nbsp;</td><td style="height:14px;font-size:0;line-height:0">&nbsp;</td></tr></table></td><td style="padding:5px 0 5px 10px;font:700 14px ${font};color:${ink};text-align:right;white-space:nowrap">${esc(r.label)}</td></tr>`
  }).join('')}</table>`
}

export function insightHtml(i: Insight, style: InsightStyle, season: Season = i.quarter.season, dear = 'Dear landlord,'): { subject: string; html: string } {
  const qn = (['winter', 'spring', 'summer', 'autumn'] as Season[]).indexOf(season) + 1
  const q = `Q${qn} ${i.quarter.year}`, L = i.london
  const subject = `London market insight — ${SEASON_LINE[season]} ${i.quarter.year}`
  const img = `<img src="${sceneUrl(style, season)}" width="600" alt="London in ${season} — the Shard, the Gherkin, St Paul's, Big Ben, the London Eye and Tower Bridge" style="display:block;width:100%;max-width:600px;height:auto;border:0">`
  const paras = story(i)
  const fast = i.fastest.map(b => ({ name: b.name, value: b.change, label: pct(b.change) }))
  const sources = `Sources: ONS Price Index of Private Rents (${mon(i.rentMonth)}) and HM Land Registry UK House Price Index${i.priceMonth ? ` (${mon(i.priceMonth)})` : ''} — Crown copyright, Open Government Licence. Rents are for whole properties; our room figure is Capital Rooms’ own lets.`
  const sans = `'Figtree','Helvetica Neue',Arial,sans-serif`, serif = `Georgia,'Times New Roman',serif`

  if (style === 'editorial') {
    const tile = (k: string, v: string, c: string) => `<td style="padding:14px 10px;text-align:center;border-top:1px solid #D8CCB8;border-bottom:1px solid #D8CCB8"><div style="font:600 11px ${sans};letter-spacing:.14em;text-transform:uppercase;color:#8A7B62">${k}</div><div style="font:400 30px ${serif};color:#1F3B2E;margin-top:4px">${v}</div><div style="font:600 13px ${sans};color:${c.startsWith('-') ? '#9B2C1F' : '#5C6B62'}">${c}</div></td>`
    return { subject, html: `<div style="background:#F6F1E7;padding:24px 0"><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#FBF8F1;border-collapse:collapse">
<tr><td>${img}</td></tr>
<tr><td style="padding:28px 40px 6px"><div style="font:700 12px ${sans};letter-spacing:.2em;text-transform:uppercase;color:#B8862A">${SEASON_LINE[season]} · ${q} · London market insight</div>
<h1 style="margin:10px 0 0;font:400 34px/1.15 ${serif};color:#1F3B2E">Rents keep climbing as prices ease</h1></td></tr>
<tr><td style="padding:14px 40px 0;font:400 17px/1.65 ${serif};color:#2A2A26"><p style="margin:0 0 14px">${esc(dear)}</p>${paras.map(p => `<p style="margin:0 0 14px">${esc(p)}</p>`).join('')}</td></tr>
<tr><td style="padding:6px 30px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>${tile('Average rent', gbp(L.rent), `${pct(L.rent12)} a year`)}${tile('Average price', gbpK(L.price), `${pct(L.price12)} a year`)}${tile('Gross yield', L.yield ? `${L.yield}%` : '—', 'London average')}</tr></table></td></tr>
<tr><td style="padding:20px 40px 6px"><div style="font:400 20px ${serif};color:#1F3B2E;margin-bottom:8px">Where rents rose fastest</div>${bars(fast, '#1F3B2E', '#EDE5D6', sans, '#2A2A26')}</td></tr>
${i.ours.median ? `<tr><td style="padding:16px 40px 0;font:italic 400 16px/1.6 ${serif};color:#2A2A26">In our own houses, rooms let at a typical ${gbp(i.ours.median)} a month.</td></tr>` : ''}
<tr><td style="padding:22px 40px 30px;font:400 12px/1.5 ${sans};color:#8A7B62">${esc(sources)}</td></tr></table></div>` }
  }

  if (style === 'ink') {
    const card = (k: string, v: string, c: string, bg: string) => `<td style="padding:6px" width="33%"><div style="border:3px solid #151515;border-radius:14px;background:${bg};padding:14px 12px"><div style="font:800 11px ${sans};letter-spacing:.12em;text-transform:uppercase;color:#151515">${k}</div><div style="font:800 28px ${sans};color:#151515;margin-top:4px">${v}</div><div style="font:700 13px ${sans};color:${c.startsWith('-') ? '#9B2C1F' : '#2F6B4F'}">${c}</div></div></td>`
    return { subject, html: `<div style="background:#FBF3E6;padding:24px 0"><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#FFFFFF;border:3px solid #151515;border-radius:18px;overflow:hidden;border-collapse:separate">
<tr><td style="border-bottom:3px solid #151515">${img}</td></tr>
<tr><td style="padding:24px 28px 4px"><span style="display:inline-block;border:2px solid #151515;border-radius:999px;padding:4px 12px;font:800 12px ${sans};background:#F2A541;color:#151515">${SEASON_LINE[season]} · ${q}</span>
<h1 style="margin:12px 0 0;font:800 30px/1.1 ${sans};color:#151515">London’s market this ${season}</h1></td></tr>
<tr><td style="padding:8px 22px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>${card('Rent', gbp(L.rent), `${pct(L.rent12)} a year`, '#DDE8DF')}${card('Price', gbpK(L.price), `${pct(L.price12)} a year`, '#F1D3A8')}${card('Yield', L.yield ? `${L.yield}%` : '—', 'gross, London', '#FFFFFF')}</tr></table></td></tr>
<tr><td style="padding:10px 28px;font:500 16px/1.6 ${sans};color:#151515"><p style="margin:0 0 12px">${esc(dear)}</p>${paras.map(p => `<p style="margin:0 0 12px">${esc(p)}</p>`).join('')}</td></tr>
<tr><td style="padding:6px 28px 4px"><div style="border:3px solid #151515;border-radius:14px;padding:14px 16px;background:#FBF3E6"><div style="font:800 15px ${sans};color:#151515;margin-bottom:8px">Fastest-rising rents 📈</div>${bars(fast, '#2F6B4F', '#FFFFFF', sans, '#151515', 'border:2px solid #151515;')}</div></td></tr>
${i.ours.median ? `<tr><td style="padding:14px 28px 0"><div style="border:3px solid #151515;border-radius:14px;padding:12px 16px;background:#DDE8DF;font:700 15px ${sans};color:#151515">🏠 Our rooms let at a typical ${gbp(i.ours.median)} a month</div></td></tr>` : ''}
<tr><td style="padding:20px 28px 26px;font:500 12px/1.5 ${sans};color:#5C6B62">${esc(sources)}</td></tr></table></div>` }
  }

  // graphic
  const big = (k: string, v: string, c: string) => `<td style="padding:16px 8px;text-align:left" width="50%"><div style="font:800 46px/1 ${sans};color:#1F3B2E;letter-spacing:-.02em">${v}</div><div style="font:700 12px ${sans};letter-spacing:.14em;text-transform:uppercase;color:#5C6B62;margin-top:6px">${k}</div><div style="font:700 15px ${sans};color:${c.startsWith('-') ? '#9B2C1F' : '#2F6B4F'}">${c}</div></td>`
  return { subject, html: `<div style="background:#E9EEEA;padding:24px 0"><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#FFFFFF;border-collapse:collapse">
<tr><td style="background:#1F3B2E;padding:26px 32px 22px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>
<td style="vertical-align:top"><div style="font:700 12px/14px ${sans};letter-spacing:.2em;text-transform:uppercase;color:#E8B931">${q} · ${SEASON_LINE[season]}</div><div style="font:800 34px/36px ${sans};color:#FFFFFF;margin-top:8px">London market<br>insight</div></td>
<td style="vertical-align:top;text-align:right;width:110px"><img src="${SITE}/brand/logo-white.png" width="101" height="94" alt="Capital Rooms" style="display:block;margin-left:auto;width:101px;height:94px;border:0"></td>
</tr></table></td></tr>
<tr><td>${img}</td></tr>
<tr><td style="padding:14px 24px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>${big('Average rent', gbp(L.rent), `${pct(L.rent12)} a year · ${pct(L.rent3)} in 3 months`)}${big('Average price', gbpK(L.price), `${pct(L.price12)} a year`)}</tr><tr>${big('Gross yield', L.yield ? `${L.yield}%` : '—', 'London average')}${big('Typical room rent', gbp(i.ours.median), 'in our houses')}</tr></table></td></tr>
<tr><td style="padding:10px 32px"><div style="font:800 13px ${sans};letter-spacing:.14em;text-transform:uppercase;color:#1F3B2E;border-top:4px solid #1F3B2E;padding-top:12px;margin-bottom:6px">Rents rising fastest</div>${bars(fast, '#1F3B2E', '#E9EEEA', sans, '#132219')}</td></tr>
<tr><td style="padding:10px 32px 0;font:500 15px/1.6 ${sans};color:#132219">${esc(paras[0])}</td></tr>
<tr><td style="padding:18px 32px 26px;font:500 11px/1.5 ${sans};color:#5C6B62">${esc(sources)}</td></tr></table></div>` }
}
