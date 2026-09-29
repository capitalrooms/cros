// Landlord statements are numbered in one running sequence — LS0951, LS0952 … — carrying on from the numbers
// 10ninety used, so every statement (imported or produced by CROS) has its own unique reference.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function nextStatementNumber(s: SupabaseClient): Promise<string> {
  const { data } = await s.from('landlord_statements').select('statement_reference').ilike('statement_reference', 'LS%')
  const max = Math.max(0, ...((data ?? []) as any[]).map(x => parseInt(String(x.statement_reference).replace(/^LS/i, ''), 10)).filter(n => Number.isFinite(n)))
  return `LS${String(max + 1).padStart(4, '0')}`
}
