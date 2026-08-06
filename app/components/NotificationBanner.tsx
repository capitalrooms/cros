'use client'

import { useState, useEffect } from 'react'

interface Notification {
  id: string
  title: string
  message: string
  type: 'success' | 'info' | 'warning' | 'alert'
  link?: string
  timestamp?: Date
  read?: boolean
}

export function NotificationBanner({ notifications: initialNotifications }: { notifications?: Notification[] }) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications || [])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Add demo notifications for testing
    if (initialNotifications === undefined) {
      const demoNotifications: Notification[] = [
        {
          id: '1',
          title: '🧹 Your cleaning is scheduled',
          message: 'A cleaning appointment has been scheduled for tomorrow at 10:00 AM.',
          type: 'info',
          link: '/tenant/maintenance',
          timestamp: new Date(),
        },
        {
          id: '2',
          title: '👀 Viewing scheduled',
          message: 'A property viewing has been booked for your room. Please ensure it\'s accessible.',
          type: 'alert',
          link: '/tenant/viewings',
          timestamp: new Date(Date.now() - 3600000),
        },
      ]
      setNotifications(demoNotifications)
    }
  }, [initialNotifications])

  const visibleNotifications = notifications.filter(n => !dismissed.has(n.id))

  if (visibleNotifications.length === 0) {
    return null
  }

  return (
    <div className="space-y-md mb-2xl">
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          className={`rounded-xl p-md border-l-4 flex items-start justify-between ${
            notification.type === 'success'
              ? 'bg-green-50 border-l-green-500 text-green-900'
              : notification.type === 'alert'
              ? 'bg-red-50 border-l-red-500 text-red-900'
              : notification.type === 'warning'
              ? 'bg-yellow-50 border-l-yellow-500 text-yellow-900'
              : 'bg-blue-50 border-l-blue-500 text-blue-900'
          }`}
        >
          <div className="flex-1">
            <h3 className="font-bold text-sm mb-xs">{notification.title}</h3>
            <p className="text-sm opacity-90">{notification.message}</p>
            {notification.link && (
              <a
                href={notification.link}
                className="text-sm font-medium underline mt-md inline-block opacity-75 hover:opacity-100"
              >
                View details →
              </a>
            )}
          </div>
          <button
            onClick={() => setDismissed(new Set([...dismissed, notification.id]))}
            className="ml-md text-lg opacity-50 hover:opacity-100 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
