'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import DocReview, { AIResult, TYPE_LABELS } from '@/app/components/DocReview'

const BLANK: AIResult = {
  doc_type: 'other', confidence: 0, summary: '', issue_date: '', expiry_date: '', provider: '',
  policy_number: '', property_address: '', person_name: '', person_phone: '', person_email: '',
  occupation: '', annual_income: '', previous_address: '', tenancy_start: '', tenancy_end: '', monthly_rent: '',
}

export default function InboxPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [tenancies, setTenancies] = useState<any[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [flash, setFlash] = useState('')

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
      await loadDocs()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadDocs() {
    const supabase = createClient()
    const { data } = await supabase
      .from('inbox_documents')
      .select('*')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
    setDocs(data || [])
  }

  function fileUrl(path: string) {
    const supabase = createClient()
    return supabase.storage.from('inbox-docs').getPublicUrl(path).data.publicUrl
  }

  async function markFiled(id: string, msg: string) {
    const supabase = createClient()
    await supabase.from('inbox_documents').update({ status: 'filed' }).eq('id', id)
    setOpenId(null)
    setFlash('✅ ' + msg)
    await loadDocs()
  }

  async function dismiss(id: string) {
    if (!confirm('Dismiss this document from the inbox?')) return
    const supabase = createClient()
    await supabase.from('inbox_documents').update({ status: 'dismissed' }).eq('id', id)
    setOpenId(null)
    await loadDocs()
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
            <h1 className="text-3xl font-bold text-neutral-900">Document inbox</h1>
            <p className="mt-sm text-sm text-neutral-600">
              Documents forwarded by email land here. Review the AI&apos;s suggestion and file each one, or
              assign it yourself. Nothing is filed until you confirm.
            </p>
          </div>
          <Link href="/admin/ai-upload" className="shrink-0 rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50">
            ⬆ Upload
          </Link>
        </div>

        {flash && <div className="mt-lg rounded-xl bg-green-600 p-md text-sm font-semibold text-white">{flash}</div>}

        {docs.length === 0 ? (
          <div className="mt-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">
            Inbox is empty. Forward a document to your inbox address and it&apos;ll appear here.
          </div>
        ) : (
          <div className="mt-lg space-y-md">
            {docs.map((d) => {
              const ai = (d.ai_result || null) as AIResult | null
              const label = ai ? TYPE_LABELS[ai.doc_type] || 'Document' : 'Unread document'
              const isOpen = openId === d.id
              return (
                <div key={d.id} className="rounded-2xl border border-neutral-200 bg-white">
                  <button
                    onClick={() => setOpenId(isOpen ? null : d.id)}
                    className="flex w-full items-center justify-between gap-md p-md text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-neutral-900">
                        {label}
                        {ai && ai.confidence ? (
                          <span className="ml-sm text-xs font-normal text-neutral-400">{Math.round(ai.confidence * 100)}%</span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {ai?.summary || d.subject || d.filename}
                        {d.from_email ? ` · from ${d.from_email}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-neutral-400">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-neutral-200 p-md">
                      <div className="mb-md flex items-center gap-md text-sm">
                        <a href={fileUrl(d.storage_path)} target="_blank" rel="noreferrer" className="font-semibold text-neutral-900 underline">
                          View original ({d.filename})
                        </a>
                        <button onClick={() => dismiss(d.id)} className="text-xs text-neutral-400 hover:text-red-600">
                          Dismiss
                        </button>
                      </div>
                      {d.ai_error && !ai && (
                        <p className="mb-md rounded-lg bg-amber-50 p-sm text-xs text-amber-800">
                          The AI couldn&apos;t read this ({d.ai_error}). Pick the type and fill the details in yourself below.
                        </p>
                      )}
                      <DocReview
                        initial={ai || BLANK}
                        properties={properties}
                        people={people}
                        tenancies={tenancies}
                        onApplied={(msg) => markFiled(d.id, msg)}
                        onCancel={() => setOpenId(null)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
