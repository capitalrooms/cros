// Read a SpareRoom advert (17 Oct 2026, Harry: "import listings from SpareRoom so we don't always have to double up
// on making ads"). Reads the advert page itself — title, the full description with its line breaks, the facts
// (price, room type, availability, terms, deposit, bills, furnishings, living room) and the photos at full size.
// Plain reading, no AI: what the advert says is what comes back. Only spareroom.co.uk pages are fetched.
export interface SpareRoomAd {
  url: string; reference: string | null; title: string; description: string
  rent: number | null; period: 'pcm' | 'pw' | null; roomType: string | null; ensuite: boolean | null
  available: string | null; minTermMonths: number | null; maxTerm: string | null; deposit: number | null
  billsIncluded: boolean | null; furnished: boolean | null; livingRoom: boolean | null; flatmates: number | null; totalRooms: number | null
  photos: string[]
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£', euro: '€', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' }
const decode = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
const strip = (s: string) => decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
const MONTH: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

export function isSpareRoomUrl(u: string) { try { const h = new URL(u).hostname; return h === 'spareroom.co.uk' || h.endsWith('.spareroom.co.uk') } catch { return false } }

export function parseSpareRoom(url: string, page: string): SpareRoomAd {
  const og = (p: string) => decode(page.match(new RegExp(`property="og:${p}" content="([^"]*)"`))?.[1] ?? '')
  const desc = page.match(/class="detaildesc"[^>]*>([\s\S]*?)<\/(?:p|div)>/i)?.[1]
  // the facts sit as label / value pairs; read them as a list of texts
  const factsHtml = page.slice(Math.max(0, page.indexOf('feature--price')), page.indexOf('feature--household-preferences') > 0 ? page.indexOf('feature--household-preferences') : undefined)
  const bits = decode(factsHtml.replace(/<[^>]+>/g, '|')).split('|').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const after = (label: string) => { const i = bits.findIndex(b => b.toLowerCase() === label.toLowerCase()); return i >= 0 ? bits[i + 1] ?? null : null }
  const yes = (v: string | null) => v == null ? null : /^yes/i.test(v) ? true : /^no/i.test(v) ? false : null
  const price = bits.find(b => /£[\d,.]+\s*(pcm|pw)/i.test(b))
  const pm = price?.match(/£([\d,.]+)\s*(pcm|pw)/i)
  const roomType = price ? bits[bits.indexOf(price) + 1] ?? null : null
  const av = after('Available')
  let available: string | null = null
  if (av && /now/i.test(av)) available = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  else if (av) { const m = av.match(/(\d{1,2})\w*\s+([A-Za-z]{3})\w*\s+(\d{4})/); if (m && MONTH[m[2].toLowerCase()]) available = `${m[3]}-${String(MONTH[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  const num = (v: string | null) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return v && Number.isFinite(n) && n > 0 ? n : null }
  const photos = [...new Set((page.match(/https?:\/\/photos\d*\.spareroom\.co\.uk\/images\/flatshare\/listings\/large\/[0-9/]+\.jpg/gi) ?? []))]
  return {
    url, reference: url.match(/\/(\d{6,})(?:[/?#]|$)/)?.[1] ?? null,
    title: og('title'), description: desc ? strip(desc) : og('description'),
    rent: pm ? Number(pm[1].replace(/,/g, '')) : null, period: (pm?.[2]?.toLowerCase() as 'pcm' | 'pw') ?? null,
    roomType, ensuite: roomType ? /en\s*-?\s*suite/i.test(roomType) : null,
    available, minTermMonths: num(after('Minimum term')), maxTerm: after('Maximum term'), deposit: num(after('Deposit')),
    billsIncluded: yes(after('Bills included?')), furnished: after('Furnishings') ? /^furnished/i.test(after('Furnishings')!) : null,
    livingRoom: yes(after('Living room')), flatmates: num(after('# flatmates')), totalRooms: num(after('Total # rooms')),
    photos,
  }
}

export async function readSpareRoom(url: string): Promise<SpareRoomAd> {
  if (!isSpareRoomUrl(url)) throw new Error('That isn’t a SpareRoom link.')
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36', 'Accept-Language': 'en-GB' }, redirect: 'follow' })
  if (!r.ok) throw new Error(`SpareRoom didn’t open the advert (${r.status}).`)
  const ad = parseSpareRoom(url, await r.text())
  if (!ad.title && !ad.description) throw new Error('No advert was found at that link — is it still live?')
  return ad
}
