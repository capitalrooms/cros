'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getActiveTenancy } from '@/lib/tenancy'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const CATEGORIES = [
  { id: 'cleaning_supplies', label: 'Cleaning supplies', icon: '🧹' },
  { id: 'food', label: 'Shared food / drinks', icon: '🍳' },
  { id: 'household', label: 'Household items', icon: '🏠' },
  { id: 'repair', label: 'Minor repair / fix', icon: '🔧' },
  { id: 'garden', label: 'Garden', icon: '🌳' },
  { id: 'other', label: 'Something else', icon: '📌' },
]

interface Contribution {
  id: string
  description: string
  amount: number | null
  category: string
  created_at: string
  person_id: string
  people?: { first_name: string | null; last_name: string | null; full_name: string | null }
}

function personName(c: Contribution, myPersonId: string | null): string {
  if (c.person_id === myPersonId) return 'You'
  const p = c.people
  if (!p) return 'A housemate'
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'A housemate'
}

export default function ContributionsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [personId, setPersonId] = useState<string | null>(null)
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [myTotal, setMyTotal] = useState(0)

  // Form state
  const [step, setStep] = useState<'list' | 'form' | 'celebrate'>('list')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('household')
  const [submitting, setSubmitting] = useState(false)
  const [newEntry, setNewEntry] = useState<Contribution | null>(null)

  useEffect(() => {
    async function load() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'tenant') { router.push('/login'); return }
      const pid = (data.assignment as any)?.id
      setPersonId(pid)

      const tenancy = await getActiveTenancy(pid)
      if (!tenancy?.property_id) { setLoading(false); return }
      setPropertyId(tenancy.property_id)

      const supabase = createClient()
      const { data: rows } = await supabase
        .from('house_contributions')
        .select('*, people(first_name, last_name, full_name)')
        .eq('property_id', tenancy.property_id)
        .order('created_at', { ascending: false })
        .limit(50)

      const list = (rows || []) as Contribution[]
      setContributions(list)
      const mine = list.filter(c => c.person_id === pid)
      setMyTotal(mine.reduce((sum, c) => sum + (c.amount || 0), 0))
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSubmit() {
    if (!desc.trim() || !propertyId || !personId) return
    setSubmitting(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('house_contributions')
      .insert({
        property_id: propertyId,
        person_id: personId,
        description: desc.trim(),
        amount: amount ? parseFloat(amount) : null,
        category,
      })
      .select('*, people(first_name, last_name, full_name)')
      .single()

    if (!error && data) {
      setNewEntry(data as Contribution)
      setContributions(prev => [data as Contribution, ...prev])
      if (data.amount) setMyTotal(t => t + Number(data.amount))
      setStep('celebrate')
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/tenant" />} />
        <div className="flex items-center justify-center py-3xl">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900" />
        </div>
      </div>
    )
  }

  if (step === 'celebrate') {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/tenant/contributions" />} />
        <div className="mx-auto max-w-lg px-lg py-3xl text-center">
          <div className="text-6xl mb-lg animate-bounce">🎉</div>
          <h1 className="text-2xl font-bold text-neutral-900">Thanks for contributing!</h1>
          <p className="mt-sm text-neutral-600">Every little bit makes the house a nicer place to live.</p>
          {newEntry && (
            <div className="mt-xl rounded-2xl border border-neutral-200 bg-white p-lg text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">Logged</p>
              <p className="font-semibold text-neutral-900">
                {CATEGORIES.find(c => c.id === newEntry.category)?.icon ?? '📌'}{' '}
                {newEntry.description}
              </p>
              {newEntry.amount && (
                <p className="text-2xl font-extrabold text-green-600 mt-xs">£{Number(newEntry.amount).toFixed(2)}</p>
              )}
            </div>
          )}
          {myTotal > 0 && (
            <p className="mt-lg text-sm text-neutral-500">
              Your personal total (for your own records): <strong>£{myTotal.toFixed(2)}</strong>
            </p>
          )}
          <div className="mt-xl space-y-sm">
            <button
              onClick={() => { setDesc(''); setAmount(''); setCategory('household'); setStep('list') }}
              className="w-full rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white"
            >
              See house history
            </button>
            <button
              onClick={() => { setDesc(''); setAmount(''); setCategory('household'); setStep('form') }}
              className="w-full rounded-2xl border border-neutral-200 bg-white py-md text-sm font-semibold text-neutral-700"
            >
              Log another
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'form') {
    return (
      <div className="min-h-screen bg-neutral-100 pb-3xl">
        <AppBar left={<BackButton href="/tenant/contributions" onClick={() => setStep('list')} />} />
        <div className="mx-auto max-w-lg px-lg pt-xl">
          <h1 className="text-2xl font-bold text-neutral-900 mb-xs">Log a contribution</h1>
          <p className="text-sm text-neutral-500 mb-xl">Bought something for the house? Spent time on a shared job? Log it here.</p>

          {/* Category */}
          <div className="mb-lg">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">Category</p>
            <div className="grid grid-cols-3 gap-xs">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`rounded-2xl border-2 p-md text-center transition-all ${
                    category === cat.id
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white text-neutral-700'
                  }`}
                >
                  <span className="text-xl block mb-xs">{cat.icon}</span>
                  <span className="text-xs font-semibold leading-tight">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="mb-md">
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">What did you get / do?</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="e.g. Bought washing-up liquid and sponges for the kitchen"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Amount */}
          <div className="mb-xl">
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Amount spent (optional)</label>
            <div className="relative">
              <span className="absolute left-md top-1/2 -translate-y-1/2 text-neutral-400 font-semibold">£</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-2xl border border-neutral-200 bg-white pl-xl pr-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!desc.trim() || submitting}
            className="w-full rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40"
          >
            {submitting ? 'Logging…' : 'Log contribution'}
          </button>
        </div>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  const myCount = contributions.filter(c => c.person_id === personId).length

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/tenant" />} />
      <div className="mx-auto max-w-lg px-lg pt-xl">
        <div className="flex items-start justify-between mb-xl">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">House contributions</h1>
            <p className="text-sm text-neutral-500 mt-xs">Things your household has bought or done for the house.</p>
          </div>
          <button
            onClick={() => setStep('form')}
            className="shrink-0 rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white"
          >
            + Log one
          </button>
        </div>

        {/* My tally */}
        {myCount > 0 && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-md mb-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-green-700">Your contributions</p>
              <p className="text-xl font-extrabold text-green-900">{myCount} logged{myTotal > 0 ? ` · £${myTotal.toFixed(2)}` : ''}</p>
            </div>
            <span className="text-3xl">⭐</span>
          </div>
        )}

        {/* House history */}
        {contributions.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-xl text-center">
            <p className="text-3xl mb-md">🏠</p>
            <p className="font-bold text-neutral-900">Nothing logged yet</p>
            <p className="text-sm text-neutral-500 mt-xs">Be the first to log something for the house.</p>
          </div>
        ) : (
          <div className="space-y-xs">
            {contributions.map(c => {
              const cat = CATEGORIES.find(x => x.id === c.category)
              const isMe = c.person_id === personId
              return (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-md flex items-start gap-md ${isMe ? 'border-green-200 bg-green-50' : 'border-neutral-100 bg-white'}`}
                >
                  <span className="text-xl shrink-0 mt-0.5">{cat?.icon ?? '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-sm">
                      <p className="font-semibold text-neutral-900 text-sm leading-snug">{c.description}</p>
                      {c.amount && <p className="shrink-0 font-bold text-green-700 text-sm">£{Number(c.amount).toFixed(2)}</p>}
                    </div>
                    <p className="text-xs text-neutral-400 mt-xs">
                      {isMe ? 'You' : personName(c, personId)} · {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
