'use client'

// ⚡ AutoLedger — admin info page.
// Shows the BCC email address, webhook status, recent auto-imports,
// and the exact Resend inbound DNS steps needed to go fully live.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

const BCC_ADDRESS = 'statements@capitalrooms.co.uk'
const DOCS_ADDRESS = 'docs@capitalrooms.co.uk'
const WEBHOOK_URL = 'https://cros-sigma.vercel.app/api/webhooks/autoledger'
const DOCS_WEBHOOK_URL = 'https://cros-sigma.vercel.app/api/webhooks/docs-inbound'

interface RecentImport {
  id: string
  source: string
  description: string
  amount: number
  statement_date: string
  created_at: string
  properties?: { name: string; address: string }
}

export default function AutoLedgerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [recent, setRecent] = useState<RecentImport[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin'].includes(data.assignment?.role ?? '')) {
        router.push('/login')
        return
      }
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('statement_line_items')
        .select('id, source, description, amount, statement_date, created_at, properties(name, address)')
        .eq('source', 'autoledger')
        .order('created_at', { ascending: false })
        .limit(20)
      setRecent(rows || [])
      setLoading(false)
    }
    load()
  }, [router])

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton />} />
      <main className="mx-auto max-w-3xl px-lg py-2xl">
        <div className="animate-pulse h-8 w-64 bg-neutral-300 rounded-lg" />
      </main>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton />} />
      <main className="mx-auto max-w-3xl px-lg py-2xl space-y-xl">

        {/* Header */}
        <div>
          <div className="flex items-center gap-md mb-xs">
            <span className="text-3xl">⚡</span>
            <h1 className="text-2xl font-bold text-neutral-900">AutoLedger</h1>
          </div>
          <p className="text-sm text-neutral-500">
            BCC any statement or expense email to <strong>{BCC_ADDRESS}</strong> and CROS automatically imports and categorises every line item — no manual entry needed.
          </p>
        </div>

        {/* Status banner */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-xl">
          <div className="flex items-start gap-sm">
            <span className="text-lg shrink-0 mt-0.5">🔧</span>
            <div className="space-y-xs">
              <p className="text-sm font-semibold text-amber-900">One step away from being live</p>
              <p className="text-sm text-amber-800">
                The webhook is built and deployed. Resend email sending is live. The only remaining step is enabling <strong>Resend inbound routing</strong> so emails to <code className="font-mono text-xs bg-amber-100 border border-amber-200 px-1 py-0.5 rounded">statements@</code> and <code className="font-mono text-xs bg-amber-100 border border-amber-200 px-1 py-0.5 rounded">docs@</code> get forwarded to the webhooks. See setup steps below.
              </p>
            </div>
          </div>
        </div>

        {/* Email addresses */}
        <div className="rounded-2xl bg-white p-xl space-y-lg">
          <h2 className="text-base font-bold text-neutral-900">Email addresses</h2>

          <div className="space-y-md">
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">⚡ AutoLedger — expenses &amp; statements</p>
              <div className="flex items-center gap-sm rounded-xl bg-neutral-50 border border-neutral-200 px-md py-sm">
                <code className="flex-1 text-sm font-mono text-neutral-900">{BCC_ADDRESS}</code>
                <button
                  onClick={() => copy(BCC_ADDRESS, 'bcc')}
                  className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors shrink-0"
                >
                  {copied === 'bcc' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-neutral-400 mt-xs">BCC or forward any statement/invoice email here. Parses CSV attachments or extracts lines from the email body via AI.</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">📄 Document inbox — certs, licences, photos</p>
              <div className="flex items-center gap-sm rounded-xl bg-neutral-50 border border-neutral-200 px-md py-sm">
                <code className="flex-1 text-sm font-mono text-neutral-900">{DOCS_ADDRESS}</code>
                <button
                  onClick={() => copy(DOCS_ADDRESS, 'docs')}
                  className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors shrink-0"
                >
                  {copied === 'docs' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-neutral-400 mt-xs">Email any document (PDF, image) here — AI extracts the data and queues it for review in the document inbox.</p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-2xl bg-white p-xl space-y-md">
          <h2 className="text-base font-bold text-neutral-900">How it works</h2>
          <ol className="space-y-sm text-sm text-neutral-700">
            {[
              '10ninety sends a monthly landlord statement → you BCC statements@capitalrooms.co.uk',
              'Resend receives the email and posts it to the AutoLedger webhook instantly',
              'CROS identifies the landlord from the sender email address',
              'AI reads the email body or CSV attachment and extracts every expense line',
              'Each line is AI-categorised automatically (boiler, plumbing, management fee, etc.)',
              'Items appear in Expense Review — you confirm or adjust categories',
              'You get an email summary of what was imported with a one-click link to review',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-100 text-xs font-bold text-neutral-500 flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Setup steps */}
        <div className="rounded-2xl bg-white p-xl space-y-lg">
          <h2 className="text-base font-bold text-neutral-900">Resend inbound setup</h2>
          <p className="text-sm text-neutral-500">Complete these steps in Resend to activate the pipeline:</p>

          <div className="space-y-md">

            {/* Step 1 */}
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-md">
              <div className="flex items-start gap-sm mb-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-200 text-xs font-bold text-neutral-600 flex items-center justify-center">1</span>
                <p className="text-sm font-semibold text-neutral-900">Enable Inbound Email in Resend</p>
              </div>
              <p className="text-xs text-neutral-500 ml-7">
                Go to <a href="https://resend.com/inbound" target="_blank" rel="noreferrer" className="text-neutral-700 underline">resend.com → Inbound</a> and add the domain <code className="font-mono bg-white border border-neutral-200 px-1 py-0.5 rounded">capitalrooms.co.uk</code>. Resend will give you an MX record to add to DNS.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-md">
              <div className="flex items-start gap-sm mb-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-200 text-xs font-bold text-neutral-600 flex items-center justify-center">2</span>
                <p className="text-sm font-semibold text-neutral-900">Add the MX record to DNS</p>
              </div>
              <p className="text-xs text-neutral-500 ml-7">
                In your DNS provider (e.g. Cloudflare), add Resend&apos;s MX record to <code className="font-mono bg-white border border-neutral-200 px-1 py-0.5 rounded">capitalrooms.co.uk</code>. This routes inbound mail to Resend.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-md">
              <div className="flex items-start gap-sm mb-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-200 text-xs font-bold text-neutral-600 flex items-center justify-center">3</span>
                <p className="text-sm font-semibold text-neutral-900">Add two inbound routes in Resend</p>
              </div>
              <div className="ml-7 space-y-sm">
                <div>
                  <p className="text-xs font-semibold text-neutral-600 mb-xs">Route 1 — AutoLedger</p>
                  <div className="space-y-xs">
                    <div className="flex items-center gap-sm rounded-lg bg-white border border-neutral-200 px-sm py-xs">
                      <span className="text-xs text-neutral-400 w-16 shrink-0">Recipient</span>
                      <code className="text-xs font-mono text-neutral-700 flex-1">{BCC_ADDRESS}</code>
                      <button onClick={() => copy(BCC_ADDRESS, 's1')} className="text-xs text-neutral-400 hover:text-neutral-600 shrink-0">
                        {copied === 's1' ? '✓' : 'Copy'}
                      </button>
                    </div>
                    <div className="flex items-center gap-sm rounded-lg bg-white border border-neutral-200 px-sm py-xs">
                      <span className="text-xs text-neutral-400 w-16 shrink-0">Webhook</span>
                      <code className="text-xs font-mono text-neutral-700 flex-1 truncate">{WEBHOOK_URL}</code>
                      <button onClick={() => copy(WEBHOOK_URL, 'w1')} className="text-xs text-neutral-400 hover:text-neutral-600 shrink-0">
                        {copied === 'w1' ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-600 mb-xs">Route 2 — Document Inbox</p>
                  <div className="space-y-xs">
                    <div className="flex items-center gap-sm rounded-lg bg-white border border-neutral-200 px-sm py-xs">
                      <span className="text-xs text-neutral-400 w-16 shrink-0">Recipient</span>
                      <code className="text-xs font-mono text-neutral-700 flex-1">{DOCS_ADDRESS}</code>
                      <button onClick={() => copy(DOCS_ADDRESS, 's2')} className="text-xs text-neutral-400 hover:text-neutral-600 shrink-0">
                        {copied === 's2' ? '✓' : 'Copy'}
                      </button>
                    </div>
                    <div className="flex items-center gap-sm rounded-lg bg-white border border-neutral-200 px-sm py-xs">
                      <span className="text-xs text-neutral-400 w-16 shrink-0">Webhook</span>
                      <code className="text-xs font-mono text-neutral-700 flex-1 truncate">{DOCS_WEBHOOK_URL}</code>
                      <button onClick={() => copy(DOCS_WEBHOOK_URL, 'w2')} className="text-xs text-neutral-400 hover:text-neutral-600 shrink-0">
                        {copied === 'w2' ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-md">
              <div className="flex items-start gap-sm mb-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-200 text-xs font-bold text-neutral-600 flex items-center justify-center">4</span>
                <p className="text-sm font-semibold text-neutral-900">Test with a forwarded email</p>
              </div>
              <p className="text-xs text-neutral-500 ml-7">
                Forward any statement email to <code className="font-mono bg-white border border-neutral-200 px-1 py-0.5 rounded">{BCC_ADDRESS}</code>. Within seconds it should appear below in Recent AutoLedger Imports, and you&apos;ll get a notification email.
              </p>
            </div>

          </div>

          {/* Env var note */}
          <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-md text-xs text-neutral-500">
            <p className="font-semibold text-neutral-700 mb-xs">Optional: webhook secret</p>
            <p>Add <code className="font-mono bg-white border border-neutral-100 px-1 rounded">AUTOLEDGER_WEBHOOK_SECRET</code> to Vercel environment variables and set the same value as a custom header in Resend to prevent spoofed requests. Not required for basic operation.</p>
          </div>
        </div>

        {/* What's already live */}
        <div className="rounded-2xl bg-white p-xl">
          <h2 className="text-base font-bold text-neutral-900 mb-md">What&apos;s already live</h2>
          <div className="space-y-xs">
            {[
              { label: 'AutoLedger webhook', url: WEBHOOK_URL, status: 'live' },
              { label: 'Document inbox webhook', url: DOCS_WEBHOOK_URL, status: 'live' },
              { label: 'Resend email sending (outbound)', status: 'live' },
              { label: 'AI extraction & categorisation', status: 'live' },
              { label: 'Expense Review page', status: 'live' },
              { label: 'Resend inbound routing (MX)', status: 'pending' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-sm border-b border-neutral-100 last:border-0">
                <div>
                  <p className="text-sm text-neutral-900">{item.label}</p>
                  {item.url && (
                    <p className="text-xs text-neutral-400 font-mono truncate max-w-xs">{item.url}</p>
                  )}
                </div>
                <span className={`text-xs font-semibold px-sm py-xs rounded-full ${
                  item.status === 'live'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-amber-50 text-amber-700'
                }`}>
                  {item.status === 'live' ? '✓ Live' : '⏳ Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent imports */}
        <div className="rounded-2xl bg-white p-xl space-y-md">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-neutral-900">Recent AutoLedger imports</h2>
            <Link href="/admin/expense-review" className="text-xs text-neutral-500 hover:text-neutral-900 underline">
              Review all →
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-xl text-center">
              <p className="text-sm text-neutral-400">No imports yet — complete the Resend setup above, then BCC your first statement.</p>
              <p className="text-xs text-neutral-400 mt-xs">
                <code className="font-mono">{BCC_ADDRESS}</code>
              </p>
            </div>
          ) : (
            <div className="space-y-xs">
              {recent.map(item => (
                <div key={item.id} className="flex items-center justify-between py-sm border-b border-neutral-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-900 truncate">{item.description}</p>
                    <p className="text-xs text-neutral-400">
                      {(item.properties as any)?.name || 'Unknown property'} ·{' '}
                      {new Date(item.statement_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-neutral-900 ml-md shrink-0">
                    £{Number(item.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
