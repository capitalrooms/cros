'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import { useEffect } from 'react'

export default function SeedPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()
      if (!data) {
        router.push('/login')
        return
      }
      setUser(data.user)
    }
    checkAuth()
  }, [router])

  async function handleSeed() {
    setLoading(true)
    setMessage('Seeding statements...')

    try {
      const response = await fetch('/api/admin/seed-statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()
      if (response.ok) {
        setMessage(`✅ Success! ${data.message}`)
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage(`❌ Error: ${String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <button
            onClick={async () => {
              await signOut()
              router.push('/login')
            }}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-2xl px-lg py-2xl">
        <div className="rounded-2xl bg-white border-2 border-blue-500 p-lg">
          <h1 className="text-2xl font-bold text-neutral-900 mb-md">Seed Financial Statements</h1>
          <p className="text-neutral-600 mb-lg">
            This will populate your account with 15 sample statements (LS0793-LS1001) for testing and demonstration.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-md mb-lg">
            <p className="text-sm font-bold text-blue-900">📋 What will be seeded:</p>
            <ul className="text-sm text-blue-900 mt-xs space-y-xs ml-md">
              <li>✓ 15 complete statements with accurate financial data</li>
              <li>✓ Each statement shows Gross Rent, Fees, Charges, and Net amounts</li>
              <li>✓ Statements span from July 2025 to July 2026</li>
              <li>✓ All payments marked as completed</li>
            </ul>
          </div>

          <button
            onClick={handleSeed}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-md px-lg rounded-lg transition-colors w-full"
          >
            {loading ? 'Seeding...' : 'Seed Statements Now'}
          </button>

          {message && (
            <div className="mt-lg p-md bg-neutral-100 rounded-lg border border-neutral-300">
              <p className="text-sm font-mono">{message}</p>
            </div>
          )}

          <div className="mt-2xl pt-lg border-t border-neutral-200">
            <h2 className="font-bold text-neutral-900 mb-md">How this works as a template:</h2>
            <ol className="text-sm text-neutral-700 space-y-sm ml-md list-decimal">
              <li>For each property, create statements with your actual financial data</li>
              <li>Use the same statement structure: Reference, Date, Period, Gross Rent, Fees, Charges, Net</li>
              <li>Statements are associated with the landlord and property automatically</li>
              <li>The dashboard will automatically aggregate and filter by date range</li>
              <li>Multi-month summaries calculate totals for selected period</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  )
}
