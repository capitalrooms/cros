'use client'
// DEV ONLY (never committed): Sent & saved list with sample rows.
import { useEffect, useState } from 'react'
import SavedDocuments from '@/app/admin/document-generator/SavedDocuments'
export default function Page() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const real = window.fetch
    window.fetch = (async (input: any, init?: any) => {
      if (!String(input).includes('documents/generated')) return real(input, init)
      return new Response(JSON.stringify({ documents: [
        { id: '1', kind: 'invoice', number: '20261101MR', title: 'Tenancy set-up — Room 3', recipient_name: 'Mr Mohammad Rislan', total: 175, created_at: '2026-11-01T19:12:06Z', created_by: 'h', emailed_at: '2026-11-06T20:36:33Z', emailed_to: ['m.rislan@example.com'], reminders: [] },
        { id: '2', kind: 'invoice', number: '20261002008CLH', title: 'Management — September 2026', recipient_name: 'Mr Christopher Gale', total: 1240.5, created_at: '2026-10-02T09:46:55Z', created_by: 'h', emailed_at: '2026-10-02T09:46:57Z', emailed_to: ['gale@example.com'], reminders: [{ at: '2026-10-20T09:00:00Z', to: ['gale@example.com'] }] },
        { id: '3', kind: 'letter', number: null, title: 'Our fees for let-only from 1 January 2027', recipient_name: 'Page Properties Ltd', total: null, created_at: '2026-11-04T09:39:35Z', created_by: 'h', emailed_at: '2026-11-04T09:39:36Z', emailed_to: ['office@pageproperties.example'] },
        { id: '4', kind: 'letter', number: null, title: 'Gas safety visit', recipient_name: 'Miss Eleanor Jones', total: null, created_at: '2026-11-08T10:00:00Z', created_by: 'h', emailed_at: null, emailed_to: null },
        { id: '5', kind: 'receipt', number: 'HOLD000011', title: 'Holding deposit', recipient_name: 'Suzuna Matsui', total: 219.23, created_at: '2026-11-06T11:22:12Z', created_by: 'h', emailed_at: '2026-11-06T11:22:14Z', emailed_to: ['suzuna@example.com'] },
      ] }), { headers: { 'content-type': 'application/json' } })
    }) as any
    setOk(true)
  }, [])
  return <div className="min-h-screen bg-neutral-100 p-lg"><div className="mx-auto max-w-6xl">{ok && <SavedDocuments refreshKey={0} onEdit={() => {}} />}</div></div>
}
