'use client'

import { NotificationBanner } from '@/app/components/NotificationBanner'

export default function TestNotificationsPage() {
  const testNotifications = [
    {
      id: '1',
      title: '🧹 Your cleaning is scheduled',
      message: 'A cleaning appointment has been scheduled for 123 Test Street tomorrow at 10:00 AM. Your cleaner will arrive at the scheduled time.',
      type: 'info' as const,
      link: '/tenant/maintenance',
      timestamp: new Date(),
    },
    {
      id: '2',
      title: '👀 Viewing scheduled on your property',
      message: 'A viewing appointment has been booked for your room. Please ensure the room is tidy and accessible. The viewing is scheduled for tomorrow at 2:00 PM.',
      type: 'alert' as const,
      link: '/tenant/viewings',
      timestamp: new Date(Date.now() - 1800000),
    },
    {
      id: '3',
      title: '✅ Previous cleaning completed',
      message: 'Your property has been cleaned this week. The cleaner has added notes and photos to the job report.',
      type: 'success' as const,
      link: '/tenant/maintenance',
      timestamp: new Date(Date.now() - 86400000),
    },
  ]

  return (
    <div className="min-h-screen bg-neutral-50 p-lg md:p-2xl">
      <div className="max-w-2xl mx-auto">
        <div className="mb-3xl">
          <h1 className="text-4xl font-bold text-neutral-900 mb-md">Notification System Test</h1>
          <p className="text-lg text-neutral-600">
            Testing the notification banner component with demo notifications
          </p>
        </div>

        <div className="bg-white rounded-2xl p-2xl shadow-sm border border-neutral-200">
          <h2 className="text-2xl font-bold text-neutral-900 mb-2xl">Dashboard Notifications</h2>

          <NotificationBanner notifications={testNotifications} />

          <div className="mt-3xl pt-3xl border-t border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-lg">System Status</h3>
            <div className="space-y-md">
              <div className="p-md bg-green-50 border border-green-200 rounded-xl">
                <p className="font-bold text-green-900 mb-xs">✅ Notification Component Working</p>
                <p className="text-sm text-green-800">The notification banner is rendering correctly with demo data.</p>
              </div>
              <div className="p-md bg-blue-50 border border-blue-200 rounded-xl">
                <p className="font-bold text-blue-900 mb-xs">ℹ️ Database Integration Pending</p>
                <p className="text-sm text-blue-800">Messages table needs to be created in Supabase. Run migration 021_create_messages_table.sql to enable persistent notifications.</p>
              </div>
              <div className="p-md bg-yellow-50 border border-yellow-200 rounded-xl">
                <p className="font-bold text-yellow-900 mb-xs">⚠️ Email Integration Pending</p>
                <p className="text-sm text-yellow-800">Email notifications will be sent when the workflow is connected to the email system.</p>
              </div>
            </div>
          </div>

          <div className="mt-3xl pt-3xl border-t border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-lg">Test Endpoints</h3>
            <div className="space-y-md text-sm font-mono bg-neutral-50 p-md rounded-lg">
              <p className="text-neutral-600">
                <span className="font-bold text-neutral-900">POST</span> /api/dev/send-test-notification
              </p>
              <p className="text-neutral-600">
                <span className="font-bold text-neutral-900">POST</span> /api/admin/setup-workflow
              </p>
              <p className="text-neutral-600">
                <span className="font-bold text-neutral-900">POST</span> /api/admin/auth-test-users
              </p>
              <p className="text-neutral-600 mt-md text-xs">
                Note: These endpoints are only available in development mode
              </p>
            </div>
          </div>

          <div className="mt-3xl text-center">
            <a
              href="/"
              className="inline-block px-lg py-md bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-colors"
            >
              Back to home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
