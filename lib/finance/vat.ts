// VAT on Capital Rooms' fees (1 Nov 2026, Harry: registered from 1 November 2026; fees are quoted plus VAT).
// Anything dated before VAT_FROM keeps the old "not VAT registered" wording, so earlier agreements reprint unchanged.
// The registration number lives in system_settings 'vat_number'; until it's set, documents say "to follow".
import type { SupabaseClient } from '@supabase/supabase-js'

export const VAT_FROM = '2026-11-01'
export const VAT_RATE = 0.2

/** Is VAT charged on fees for something dated `iso` (an agreement date, invoice date…)? */
export const vatApplies = (iso?: string | null) => (iso || new Date().toISOString()).slice(0, 10) >= VAT_FROM

/** "12%" → "12% + VAT (14.4% inc. VAT)"; "£300 per room" → "£300 + VAT per room (£360 inc. VAT)". */
export function plusVat(fee: string): string {
  const f = fee.trim()
  if (!f || /vat/i.test(f) || /^(included|to be agreed|as agreed)/i.test(f)) return f
  const pct = f.match(/^(\d+(?:\.\d+)?)\s*%/)
  if (pct) {
    const inc = +(Number(pct[1]) * (1 + VAT_RATE)).toFixed(2)
    return `${pct[1]}% + VAT (${inc}% inc. VAT)${f.slice(pct[0].length)}`
  }
  const gbp = f.match(/^£\s?(\d[\d,]*(?:\.\d+)?)/)
  if (gbp) {
    const n = Number(gbp[1].replace(/,/g, ''))
    const inc = n * (1 + VAT_RATE)
    const incStr = `£${Number.isInteger(inc) ? inc.toLocaleString('en-GB') : inc.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `${gbp[0]} + VAT${f.slice(gbp[0].length)} (${incStr} inc. VAT)`
  }
  return `${f} (plus VAT)`
}

/** The paragraph under each fee table. */
export function vatSentence(iso: string | null | undefined, vatNumber: string | null | undefined, deducted: string): string {
  if (!vatApplies(iso)) return `Capital Rooms Ltd is not VAT registered, so no VAT is added to our fees. ${deducted}`
  return `Capital Rooms Ltd is VAT registered (VAT registration number: ${vatNumber?.trim() || 'to follow'}). All fees are shown before VAT, which is added at the standard rate (currently ${VAT_RATE * 100}%) and shown on our statements and invoices. ${deducted}`
}

export async function fetchVatNumber(s: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await s.from('system_settings').select('value').eq('key', 'vat_number').maybeSingle()
    const v = (data as { value?: unknown } | null)?.value
    return typeof v === 'string' && v.trim() ? v.trim() : null
  } catch { return null }
}
