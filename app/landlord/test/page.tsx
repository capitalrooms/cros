'use client'

import { useState } from 'react'
import AppBar from '@/components/AppBar'

export default function TestPage() {
  const [clicked, setClicked] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar />

      <main className="mx-auto max-w-2xl px-lg py-2xl">
        <h1 className="text-3xl font-bold mb-lg">Button Click Test</h1>

        <div className="bg-white rounded-lg p-lg border-2 border-blue-500 mb-lg">
          <p className="text-neutral-600 mb-lg">Test: Can you click buttons without timeout?</p>

          <button
            onClick={() => setClicked(!clicked)}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-md px-lg rounded mb-md"
          >
            Test Button 1 - Simple Click
          </button>
          {clicked && <p className="text-green-600">✓ Button 1 clicked! State updated.</p>}

          <hr className="my-lg" />

          <button
            onClick={() => setDateOpen(!dateOpen)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-md px-lg rounded mb-md"
          >
            📅 Test Button 2 - Date Toggle
          </button>
          {dateOpen && (
            <div className="bg-neutral-100 p-md rounded">
              <p>Date picker opened!</p>
              <input type="date" className="p-sm border rounded" defaultValue="2026-07-03" />
            </div>
          )}

          <hr className="my-lg" />

          <select
            onChange={(e) => console.log('Selected:', e.target.value)}
            className="w-full p-md border rounded mb-md bg-white text-neutral-900"
          >
            <option value="">-- Select Option --</option>
            <option value="prop1">Property 1</option>
            <option value="prop2">Property 2</option>
          </select>
          <p className="text-neutral-600 text-sm">Test selecting from dropdown</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-lg">
          <p className="text-blue-900 font-bold">Results:</p>
          <ul className="text-blue-900 text-sm mt-md space-y-sm">
            <li>✓ If you can click buttons without timeout: The issue is elsewhere</li>
            <li>✗ If you get timeout on any click: The issue is in this component structure</li>
            <li>✓ If dropdown works but buttons don't: The issue is specific to onClick handlers</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
