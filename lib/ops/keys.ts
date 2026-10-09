// How CROS recognises a payment out of the Operations account next month (migration 212).
//   match_key — the description without the parts that change every month (dates, times, "card payment to"…) but
//               WITH the reference numbers, so "OVO ENERGY 81234567" and "OVO ENERGY 81299999" are two houses.
//   payee_key — just the payee's name ("ovo energy"), for a softer suggestion when the reference is new.
const NOISE = new Set([
  'card', 'payment', 'payments', 'to', 'from', 'dd', 'direct', 'debit', 'so', 'standing', 'order', 'fpo', 'fp', 'bgc', 'bp', 'pos',
  'contactless', 'visa', 'mastercard', 'debitcard', 'purchase', 'online', 'ref', 'reference', 'faster', 'transfer', 'tfr', 'on', 'at',
  'gbp', 'cd', 'ddr', 'ft', 'via', 'the',
])
const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/

function tokens(description: string): string[] {
  return description.toLowerCase()
    .replace(/\b\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?\b/g, ' ')        // 12/10/26, 12-10
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')                       // 14:32
    .replace(/\b\d{1,2}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{0,4}\b/g, ' ')   // 12oct, 12oct26
    .replace(/\b\d+\.\d{2}\b/g, ' ')                                   // amounts printed in the line
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(t => t && !NOISE.has(t) && !MONTH.test(t) && !/^\d{1,3}$/.test(t))   // short numbers are dates or counters
}

export function matchKey(description: string): string {
  return tokens(description).join(' ').slice(0, 120) || description.toLowerCase().trim().slice(0, 120)
}

export function payeeKey(description: string): string {
  return tokens(description).filter(t => /^[a-z][a-z&']+$/.test(t)).slice(0, 3).join(' ') || matchKey(description).split(' ')[0] || 'unknown'
}
