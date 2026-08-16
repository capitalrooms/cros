'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function MaintenanceChoosePath() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200">
        <div className="mx-auto max-w-4xl px-lg py-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-neutral-900">Report a problem</h1>
            <Link
              href="/tenant"
              className="text-sm font-bold text-neutral-600 hover:text-neutral-900"
            >
              ← Back
            </Link>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-lg py-3xl">
        <div className="mb-lg">
          <h2 className="text-lg font-bold text-neutral-900 mb-sm">How would you like to report this?</h2>
          <p className="text-sm text-neutral-600">
            Choose the path that works best for you. You can switch anytime.
          </p>
        </div>

        {/* Two pathway cards */}
        <div className="grid gap-lg md:grid-cols-2">
          {/* Pathway 1: Direct Report */}
          <button
            onClick={() => router.push('/tenant/maintenance')}
            className="group block text-left rounded-2xl border-2 border-neutral-200 bg-white p-lg hover:border-neutral-900 hover:shadow-lg transition-all"
          >
            <div className="flex items-start justify-between gap-md">
              <div className="flex-1">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-blue-100 mb-md">
                  <span className="text-xl">📋</span>
                </div>
                <h3 className="text-lg font-bold text-neutral-900 mb-sm">Report Maintenance</h3>
                <p className="text-sm text-neutral-600 mb-md">
                  Directly report the issue and submit a ticket for professional help.
                </p>

                <div className="space-y-xs">
                  <div className="flex items-center gap-sm text-xs text-neutral-600">
                    <span>⏱️</span>
                    <span>30 seconds</span>
                  </div>
                  <div className="flex items-center gap-sm text-xs text-neutral-600">
                    <span>✓</span>
                    <span>Describe → Submit → Ticket created</span>
                  </div>
                  <div className="flex items-center gap-sm text-xs text-neutral-600">
                    <span>👥</span>
                    <span>For when you know you need a professional</span>
                  </div>
                </div>
              </div>
              <div className="text-2xl group-hover:translate-x-1 transition-transform">→</div>
            </div>
          </button>

          {/* Pathway 2: Smart Troubleshooting */}
          <button
            onClick={() => router.push('/tenant/maintenance-smart')}
            className="group block text-left rounded-2xl border-2 border-neutral-200 bg-white p-lg hover:border-neutral-900 hover:shadow-lg transition-all"
          >
            <div className="flex items-start justify-between gap-md">
              <div className="flex-1">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-green-100 mb-md">
                  <span className="text-xl">🧠</span>
                </div>
                <h3 className="text-lg font-bold text-neutral-900 mb-sm">Smart Troubleshooting</h3>
                <p className="text-sm text-neutral-600 mb-md">
                  Get AI-powered guidance with follow-up questions. Try a fix or escalate.
                </p>

                <div className="space-y-xs">
                  <div className="flex items-center gap-sm text-xs text-neutral-600">
                    <span>⏱️</span>
                    <span>2-3 minutes</span>
                  </div>
                  <div className="flex items-center gap-sm text-xs text-neutral-600">
                    <span>✓</span>
                    <span>Describe → Answer questions → Get diagnosis</span>
                  </div>
                  <div className="flex items-center gap-sm text-xs text-neutral-600">
                    <span>💡</span>
                    <span>DIY fix suggestions or professional advice</span>
                  </div>
                </div>
              </div>
              <div className="text-2xl group-hover:translate-x-1 transition-transform">→</div>
            </div>
          </button>
        </div>

        {/* Info footer */}
        <div className="mt-3xl rounded-2xl border-2 border-blue-200 bg-blue-50 p-lg">
          <p className="text-sm text-blue-900">
            <strong>💬 How it works:</strong> We're testing two approaches to see which helps you best.
            Both paths create a ticket if you need professional help. You can always report directly if you prefer.
          </p>
        </div>
      </main>
    </div>
  );
}
