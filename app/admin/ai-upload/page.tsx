'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import DocReview, { AIResult } from '@/app/components/DocReview'

export default function AIUploadPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [tenancies, setTenancies] = useState<any[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AIResult | null>(null)
  const [applied, setApplied] = useState('')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login')
        return
      }
      const supabase = createClient()
      const { data: props } = await supabase.from('properties').select('id, name, address').order('name')
      const { data: ppl } = await supabase.from('people').select('id, full_name, email').eq('role', 'tenant').order('full_name')
      const { data: tens } = await supabase
        .from('tenancies')
        .select('id, start_date, end_date, people(full_name), rooms(name), properties(name)')
        .order('start_date', { ascending: false })
      setProperties(props || [])
      setPeople(ppl || [])
      setTenancies((tens as any) || [])
      setLoading(false)
    }
    init()
  }, [router])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setResult(null)
    setApplied('')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/ai/classify-document', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to read the document')
      setResult(json.result as AIResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">AI document upload</h1>
            <p className="mt-sm text-sm text-neutral-600">
              Drop in a certificate, tenancy or reference. The AI reads it, tells you what it is, and files
              the details once you confirm.
            </p>
          </div>
          <Link href="/admin/inbox" className="shrink-0 rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50">
            📥 Inbox
          </Link>
        </div>

        {error && (
          <div className="mt-lg rounded-xl border-2 border-neutral-900 bg-white p-md text-sm text-neutral-900">{error}</div>
        )}
        {applied && (
          <div className="mt-lg rounded-xl bg-green-600 p-md text-sm font-semibold text-white">✅ {applied}</div>
        )}

        {!result && (
          <label className="mt-lg block cursor-pointer rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-xl text-center hover:border-neutral-900">
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} disabled={busy} />
            <p className="text-3xl">📄</p>
            <p className="mt-sm font-bold text-neutral-900">{busy ? 'Reading the document…' : 'Click to upload a document'}</p>
            <p className="mt-xs text-xs text-neutral-500">PDF, or a photo/scan (JPG, PNG)</p>
          </label>
        )}

        {result && (
          <div className="mt-lg">
            <DocReview
              initial={result}
              properties={properties}
              people={people}
              tenancies={tenancies}
              onApplied={(msg) => { setApplied(msg); setResult(null) }}
              onCancel={() => setResult(null)}
            />
          </div>
        )}
      </main>
    </div>
  )
}
