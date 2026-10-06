// Notice period and minimum term for management / rent collection agreements — chosen per agreement on the
// generator and Send-welcome screens. Agreements saved before these were added fall back to the old fixed
// wording: three months' notice, not to be given in the first twelve months.

export const DEFAULT_NOTICE_MONTHS = 3
export const DEFAULT_MINIMUM_TERM_MONTHS = 12
/** choices offered on the screens (any whole number in range still prints correctly) */
export const NOTICE_OPTIONS = [1, 2, 3, 4, 5, 6, 9, 12]
export const TERM_OPTIONS = [0, 3, 6, 9, 12, 18, 24, 36]

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty']

function inWords(n: number): string {
  if (n <= 20) return WORDS[n]
  const t = Math.floor(n / 10), u = n % 10
  return TENS[t] ? (u ? `${TENS[t]}-${WORDS[u]}` : TENS[t]) : String(n)
}

function whole(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

export function durationTermsFrom(d: { noticeMonths?: unknown; minimumTermMonths?: unknown }) {
  return {
    noticeMonths: whole(d.noticeMonths, DEFAULT_NOTICE_MONTHS, 1, 12),
    minimumTermMonths: whole(d.minimumTermMonths, DEFAULT_MINIMUM_TERM_MONTHS, 0, 60),
  }
}

/** "This agreement shall continue until terminated by either party giving not less than three (3) calendar months' written notice, …" */
export function durationSentence(d: { noticeMonths?: unknown; minimumTermMonths?: unknown }): string {
  const { noticeMonths: n, minimumTermMonths: m } = durationTermsFrom(d)
  const notice = `${inWords(n)} (${n}) calendar ${n === 1 ? "month's" : "months'"} written notice`
  const term = m === 0 ? '' : `, such notice not to be given during the first ${m === 1 ? 'month' : `${inWords(m)} months`} of the agreement`
  return `This agreement shall continue until terminated by either party giving not less than ${notice}${term}.`
}
