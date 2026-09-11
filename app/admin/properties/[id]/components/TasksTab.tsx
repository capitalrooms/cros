'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Task {
  id: string
  description: string
  notes: string | null
  responsible: string | null
  due_date: string | null
  completed: boolean
  completed_at: string | null
  status: string
  ticket_id: string | null
  created_at: string
  room_id: string | null
  rooms?: { name: string } | null
}

const RESPONSIBLE_OPTIONS = ['Me', 'Landlord', 'Ricky', 'Damien', 'Waqar', 'Waste Removal']

function fmtDate(iso: string) {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'text-red-600 font-bold' }
  if (diff === 0) return { label: 'Due today', cls: 'text-amber-600 font-bold' }
  if (diff === 1) return { label: 'Due tomorrow', cls: 'text-amber-500 font-semibold' }
  return {
    label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    cls:   diff <= 7 ? 'text-amber-500 font-semibold' : 'text-neutral-500',
  }
}

export default function TasksTab({ propertyId }: { propertyId: string }) {
  const [tasks, setTasks]         = useState<Task[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [converting, setConverting] = useState<string | null>(null)

  // Add task form state
  const [desc, setDesc]           = useState('')
  const [notes, setNotes]         = useState('')
  const [responsible, setResponsible] = useState('Me')
  const [customResponsible, setCustomResponsible] = useState('')
  const [dueDate, setDueDate]     = useState('')

  const supabase = createClient()

  useEffect(() => { load() }, [propertyId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('property_tasks')
      .select('*, rooms(name)')
      .eq('property_id', propertyId)
      .order('completed')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    setTasks(data || [])
    setLoading(false)
  }

  async function addTask() {
    if (!desc.trim()) return
    setSaving(true)
    const res = await fetch('/api/admin/property-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: propertyId,
        description: desc,
        notes:       notes || null,
        responsible: responsible === 'Other' ? customResponsible : responsible,
        due_date:    dueDate || null,
      }),
    })
    if (res.ok) {
      setDesc(''); setNotes(''); setResponsible('Me'); setCustomResponsible(''); setDueDate('')
      setShowAdd(false)
      await load()
    }
    setSaving(false)
  }

  async function toggleComplete(task: Task) {
    const completing = !task.completed
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, completed: completing, status: completing ? 'completed' : 'open' }
      : t
    ))
    await fetch(`/api/admin/property-tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: completing }),
    })
  }

  async function convertToTicket(task: Task) {
    if (!confirm(`Convert "${task.description}" to a maintenance ticket?`)) return
    setConverting(task.id)
    const res = await fetch(`/api/admin/property-tasks/${task.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 'medium', category: 'general' }),
    })
    const data = await res.json()
    if (res.ok) {
      await load()
      alert(`✅ Maintenance ticket raised. You can find it in the Maintenance tab.`)
    } else {
      alert(data.error || 'Could not convert task')
    }
    setConverting(null)
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    await fetch(`/api/admin/property-tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const open      = tasks.filter(t => !t.completed && t.status !== 'converted')
  const converted = tasks.filter(t => t.status === 'converted')
  const completed = tasks.filter(t => t.completed && t.status !== 'converted')

  if (loading) {
    return (
      <div className="p-lg space-y-sm">
        {[1,2,3].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-md animate-pulse h-16" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-lg space-y-md">

      {/* Header */}
      <div className="flex items-center gap-sm">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Property Tasks</h2>
          <p className="text-xs text-neutral-500 mt-xs">
            Internal notes & to-dos — admin only.
            {open.length > 0 && ` ${open.length} open.`}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="ml-auto bg-neutral-950 text-white text-sm font-semibold px-md py-sm rounded-xl hover:bg-neutral-800 transition"
        >
          {showAdd ? '✕ Cancel' : '+ Add task'}
        </button>
      </div>

      {/* Add task form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-md space-y-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">New task</p>

          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="What needs doing?"
            rows={2}
            className="w-full border border-neutral-200 rounded-xl p-sm text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-950"
          />

          <div className="grid grid-cols-2 gap-sm">
            <div>
              <label className="text-xs font-semibold text-neutral-500 block mb-xs">Responsible</label>
              <div className="flex flex-wrap gap-xs">
                {RESPONSIBLE_OPTIONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setResponsible(r)}
                    className={`text-xs font-semibold px-sm py-xs rounded-full border transition ${
                      responsible === r
                        ? 'bg-neutral-950 text-white border-neutral-950'
                        : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
                <button
                  onClick={() => setResponsible('Other')}
                  className={`text-xs font-semibold px-sm py-xs rounded-full border transition ${
                    responsible === 'Other'
                      ? 'bg-neutral-950 text-white border-neutral-950'
                      : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  + Other
                </button>
              </div>
              {responsible === 'Other' && (
                <input
                  value={customResponsible}
                  onChange={e => setCustomResponsible(e.target.value)}
                  placeholder="Who?"
                  className="mt-xs w-full border border-neutral-200 rounded-lg p-xs text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
                />
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-500 block mb-xs">Due date (optional)</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500 block mb-xs">Notes (optional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any extra detail..."
              className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          <button
            onClick={addTask}
            disabled={!desc.trim() || saving}
            className="w-full bg-neutral-950 text-white font-bold text-sm py-sm rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : 'Save task'}
          </button>
        </div>
      )}

      {/* Open tasks */}
      {open.length === 0 && !showAdd && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg text-center">
          <p className="text-2xl mb-sm">✅</p>
          <p className="font-semibold text-neutral-700">No open tasks</p>
          <p className="text-sm text-neutral-500 mt-xs">Add a task to track internal to-dos for this property.</p>
        </div>
      )}

      {open.length > 0 && (
        <div className="space-y-xs">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 px-xs">
            Open · {open.length}
          </p>
          {open.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={toggleComplete}
              onConvert={convertToTicket}
              onDelete={deleteTask}
              converting={converting === task.id}
            />
          ))}
        </div>
      )}

      {/* Converted tasks */}
      {converted.length > 0 && (
        <div className="space-y-xs">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 px-xs">
            Converted to maintenance · {converted.length}
          </p>
          {converted.map(task => (
            <div key={task.id} className="bg-white rounded-2xl border border-neutral-200 p-md flex items-start gap-sm opacity-60">
              <div className="w-5 h-5 rounded flex-shrink-0 mt-0.5 bg-blue-100 flex items-center justify-content-center text-center text-xs">
                🔧
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-600 line-through">{task.description}</p>
                <p className="text-xs text-neutral-400 mt-0.5">Converted to maintenance ticket</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed tasks */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-sm text-xs font-bold uppercase tracking-wide text-neutral-400 hover:text-neutral-600 transition w-full px-xs py-sm"
          >
            <span className="text-base">{showCompleted ? '▾' : '›'}</span>
            Completed · {completed.length}
          </button>
          {showCompleted && (
            <div className="space-y-xs mt-xs">
              {completed.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={toggleComplete}
                  onConvert={convertToTicket}
                  onDelete={deleteTask}
                  converting={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task, onToggle, onConvert, onDelete, converting,
}: {
  task: Task
  onToggle: (t: Task) => void
  onConvert: (t: Task) => void
  onDelete:  (id: string) => void
  converting: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const due = task.due_date ? fmtDate(task.due_date) : null

  return (
    <div
      className={`bg-white rounded-2xl border p-md transition-colors ${
        task.completed ? 'border-neutral-100 opacity-60' : 'border-neutral-200'
      }`}
    >
      <div className="flex items-start gap-sm">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(task)}
          className={`w-5 h-5 rounded-md border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition ${
            task.completed
              ? 'bg-neutral-900 border-neutral-900 text-white text-xs'
              : 'border-neutral-300 hover:border-neutral-500'
          }`}
        >
          {task.completed && '✓'}
        </button>

        {/* Main content */}
        <div className="flex-1 min-w-0" onClick={() => setExpanded(!expanded)}>
          <p className={`text-sm font-semibold leading-snug cursor-pointer ${task.completed ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
            {task.description}
          </p>
          <div className="flex items-center gap-xs mt-xs flex-wrap">
            {task.responsible && (
              <span className="text-xs font-semibold px-xs py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                {task.responsible}
              </span>
            )}
            {task.rooms && (
              <span className="text-xs text-neutral-400">{task.rooms.name}</span>
            )}
            {due && (
              <span className={`text-xs ${due.cls}`}>{due.label}</span>
            )}
            {task.notes && (
              <span className="text-xs text-neutral-400 truncate max-w-xs">{task.notes}</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded actions */}
      {expanded && (
        <div className="mt-sm pt-sm border-t border-neutral-100 flex items-center gap-xs flex-wrap">
          {task.notes && (
            <p className="text-xs text-neutral-500 flex-1 min-w-0">{task.notes}</p>
          )}
          <div className="flex gap-xs ml-auto">
            {/* Convert to ticket — Feature 4 */}
            {!task.completed && !task.ticket_id && (
              <button
                onClick={() => onConvert(task)}
                disabled={converting}
                className="text-xs font-semibold px-sm py-xs rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition"
              >
                {converting ? '…' : '🔧 Make ticket'}
              </button>
            )}
            {task.ticket_id && (
              <span className="text-xs font-semibold px-sm py-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                🔧 Ticket raised
              </span>
            )}
            {/* Placeholder for Feature 6: Request quote */}
            {!task.completed && (
              <button
                disabled
                title="Quoting coming soon"
                className="text-xs font-semibold px-sm py-xs rounded-lg border border-neutral-100 text-neutral-300 cursor-not-allowed"
              >
                📋 Request quote
              </button>
            )}
            <button
              onClick={() => onDelete(task.id)}
              className="text-xs font-semibold px-sm py-xs rounded-lg border border-neutral-200 text-red-500 hover:bg-red-50 transition"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
