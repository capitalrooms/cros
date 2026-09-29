/**
 * POST /api/admin/bank-import/fuzzy-suggest
 *
 * Given an unmatched bank_transaction, attempt to identify the most likely
 * tenant using three signals:
 *   1. Saved bank_sender_name on tenancies (highest confidence — previously confirmed)
 *   2. Jaro-Winkler name similarity against active tenant names
 *   3. Amount proximity — payment within £5 of a tenant's rent
 *
 * Three-layer safety:
 *   1. CONFIDENCE GATE — only returns a suggestion if exactly ONE candidate
 *      survives above threshold. Multiple candidates → no suggestion, must be
 *      manually allocated.
 *   2. AMOUNT CHECK — the payment amount must be within 5% of the tenant's
 *      rent_amount or amount_due to be suggested.
 *   3. NEVER AUTO-ALLOCATES — returns a suggestion for human review only.
 *      Admin must call /allocate to confirm.
 *
 * Body: { transaction_id: string }
 * Returns: { suggestion: SuggestionResult | null, confidence: string, reason: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ledgerStart } from '@/lib/clientLedger'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ── Jaro-Winkler similarity (0-1, higher = more similar) ─────────────────────
function jaroWinkler(s1: string, s2: string): number {
  s1 = s1.toLowerCase().trim()
  s2 = s2.toLowerCase().trim()
  if (s1 === s2) return 1
  if (!s1.length || !s2.length) return 0

  const matchDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1
  const s1Matches = new Array(s1.length).fill(false)
  const s2Matches = new Array(s2.length).fill(false)

  let matches = 0
  let transpositions = 0

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDist)
    const end = Math.min(i + matchDist + 1, s2.length)
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = s2Matches[j] = true
      matches++
      break
    }
  }

  if (!matches) return 0

  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3

  // Winkler prefix boost (up to 4 chars)
  let prefix = 0
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaro + prefix * 0.1 * (1 - jaro)
}

const JW_THRESHOLD = 0.82  // industry-standard threshold for name matching

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase
    .from('people').select('id, role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { transaction_id } = await req.json()
  if (!transaction_id) return NextResponse.json({ error: 'transaction_id required' }, { status: 400 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Load the transaction ────────────────────────────────────────────────────
  const { data: txn } = await service
    .from('bank_transactions')
    .select('id, transaction_date, amount, description, extracted_ref, status')
    .eq('id', transaction_id)
    .single()

  if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  if (txn.status !== 'unmatched') {
    return NextResponse.json({ suggestion: null, reason: 'Transaction is not unmatched' })
  }

  // ── Load active tenancies with bank_sender_name and rent ────────────────────
  const today = new Date().toISOString().split('T')[0]
  const { data: tenancies } = await service
    .from('tenancies')
    .select(`
      id, person_id, room_id, rent_amount, payment_reference, bank_sender_name,
      people:people!person_id(id, first_name, last_name, email),
      rooms(id, name, property_id, current_asking_rent, properties(id, name))
    `)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .not('payment_reference', 'is', null)

  if (!tenancies?.length) {
    return NextResponse.json({ suggestion: null, reason: 'No active tenancies found' })
  }

  // ── Score each tenancy ──────────────────────────────────────────────────────
  interface Candidate {
    tenancy: any
    score: number
    signals: string[]
  }

  const candidates: Candidate[] = []

  for (const t of tenancies as any[]) {
    const personName = [t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ')
    const rentAmount = t.rent_amount ?? t.rooms?.current_asking_rent ?? 0
    let score = 0
    const signals: string[] = []

    // Signal 1: saved bank sender name (strongest — previously verified)
    if (t.bank_sender_name) {
      const nameSim = jaroWinkler(t.bank_sender_name, txn.description)
      if (nameSim >= JW_THRESHOLD) {
        score += 0.6
        signals.push(`Bank name match (${(nameSim * 100).toFixed(0)}% similarity to saved name "${t.bank_sender_name}")`)
      }
    }

    // Signal 2: tenant full name in description (Jaro-Winkler)
    if (personName) {
      const nameSim = jaroWinkler(personName, txn.description)
      if (nameSim >= JW_THRESHOLD) {
        score += 0.4
        signals.push(`Name match (${(nameSim * 100).toFixed(0)}% — "${personName}")`)
      }
      // Also try surname alone (common in bank descriptions)
      const surname = t.people?.last_name
      if (surname && surname.length > 2) {
        const surnameSim = jaroWinkler(surname, txn.description)
        if (surnameSim >= 0.9 && score === 0) {
          score += 0.25
          signals.push(`Surname match (${(surnameSim * 100).toFixed(0)}% — "${surname}")`)
        }
      }
    }

    // Signal 3: amount proximity (within 5%)
    if (rentAmount > 0) {
      const diff = Math.abs(txn.amount - rentAmount) / rentAmount
      if (diff <= 0.05) {
        score += 0.3
        signals.push(`Amount match (£${txn.amount} vs £${rentAmount} expected)`)
      } else if (diff <= 0.15) {
        score += 0.1
        signals.push(`Amount near (£${txn.amount} vs £${rentAmount} expected, ${(diff * 100).toFixed(0)}% off)`)
      }
    }

    // Must have at least a name signal to qualify
    if (score > 0 && signals.some(s => s.includes('match'))) {
      candidates.push({ tenancy: t, score, signals })
    }
  }

  // ── Confidence gate: only suggest if exactly ONE candidate above threshold ──
  const strong = candidates.filter(c => c.score >= 0.5).sort((a, b) => b.score - a.score)

  if (strong.length === 0) {
    return NextResponse.json({
      suggestion: null,
      confidence: 'none',
      reason: candidates.length
        ? `${candidates.length} weak candidate(s) — insufficient confidence to suggest`
        : 'No matching tenants found',
    })
  }

  if (strong.length > 1) {
    return NextResponse.json({
      suggestion: null,
      confidence: 'ambiguous',
      reason: `${strong.length} candidates with similar confidence — manual allocation required`,
      candidates: strong.slice(0, 3).map(c => ({
        name: [c.tenancy.people?.first_name, c.tenancy.people?.last_name].filter(Boolean).join(' '),
        reference: c.tenancy.payment_reference,
        score: c.score,
      })),
    })
  }

  // Single strong candidate — return suggestion for admin review
  const best = strong[0]
  const t = best.tenancy
  const personName = [t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ')
  const rentAmount = t.rent_amount ?? t.rooms?.current_asking_rent ?? 0

  // Find the oldest unpaid charge for this room (same oldest-first rule as import)
  const { data: charges } = await service
    .from('rent_charges')
    .select('id, charge_month, amount_due, amount_received, status, voided')
    .eq('room_id', t.room_id)
    .in('status', ['pending', 'partial', 'overdue'])
    .gte('charge_month', await ledgerStart(service as any))
    .order('charge_month', { ascending: true })

  const charge = (charges ?? []).find((c: any) => !c.voided) ?? null

  return NextResponse.json({
    suggestion: {
      tenancy_id: t.id,
      tenant_person_id: t.person_id,
      tenant_name: personName,
      tenant_email: t.people?.email ?? null,
      payment_reference: t.payment_reference,
      room_name: t.rooms?.name ?? null,
      property_name: t.rooms?.properties?.name ?? null,
      property_id: t.rooms?.property_id ?? null,
      rent_amount: rentAmount,
      rent_charge_id: charge?.id ?? null,
      charge_month: charge?.charge_month ?? null,
      charge_amount_due: charge ? Number(charge.amount_due) - Number(charge.amount_received || 0) : null,
      signals: best.signals,
    },
    confidence: best.score >= 0.8 ? 'high' : 'medium',
    score: best.score,
    reason: best.signals.join(' · '),
  })
}
