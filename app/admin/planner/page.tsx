'use client'

import { useState, useEffect, useRef } from 'react'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────
type Status = 'discuss' | 'discussed' | 'progress' | 'done' | 'parked'

interface Update {
  id: string
  author: string
  when: string
  body: string
  links?: string[]     // URLs attached to this note
  images?: string[]    // base64 data URIs
}

interface PlannerItem {
  id: string
  groupName: string
  groupColor: string
  title: string
  status: Status
  responsible: string
  date: string
  updates: Update[]
}

interface PlannerBoard {
  id: string
  title: string
  subtitle: string
  colorA: string
  colorB: string
  section: 'landlords' | 'workspace'
  items: PlannerItem[]
  /** headings added before they have any items */
  extraGroups?: { name: string; color: string }[]
}

// ── Saving: the planner lives in CROS (shared by phone and computer), with this browser's copy as a fallback ──
const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map(x => [x.id, x]))
/** Combine two copies without losing anything: boards, items and notes are joined by id. */
function mergeBoards(primary: PlannerBoard[], other: PlannerBoard[]): PlannerBoard[] {
  const out = new Map(primary.map(b => [b.id, b]))
  for (const ob of other) {
    const pb = out.get(ob.id)
    if (!pb) { out.set(ob.id, ob); continue }
    const items = byId(pb.items)
    for (const oi of ob.items) {
      const pi = items.get(oi.id)
      if (!pi) { items.set(oi.id, oi); continue }
      const ups = byId(pi.updates)
      for (const u of oi.updates) if (!ups.has(u.id)) ups.set(u.id, u)
      items.set(oi.id, { ...pi, updates: [...ups.values()] })
    }
    const groups = [...(pb.extraGroups ?? [])]
    for (const g of ob.extraGroups ?? []) if (!groups.some(x => x.name === g.name)) groups.push(g)
    out.set(ob.id, { ...pb, items: [...items.values()], extraGroups: groups })
  }
  return [...out.values()]
}
/** Photos are stored as files, not packed into the notes — keeps the planner small enough to sync. */
async function uploadPhoto(dataUrl: string): Promise<string> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const pres = await fetch('/api/storage/presign-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: `planner.${ext}`, mimeType: blob.type }) })
    if (!pres.ok) return dataUrl
    const { token, path, publicUrl } = await pres.json()
    const { createClient } = await import('@/lib/supabase')
    const { error } = await createClient().storage.from('property-documents').uploadToSignedUrl(path, token, blob, { contentType: blob.type })
    return error ? dataUrl : publicUrl
  } catch { return dataUrl }
}
async function withUploadedPhotos(boards: PlannerBoard[]): Promise<PlannerBoard[]> {
  const out: PlannerBoard[] = []
  for (const b of boards) {
    const items: PlannerItem[] = []
    for (const i of b.items) {
      const updates: Update[] = []
      for (const u of i.updates) {
        const images = u.images ? await Promise.all(u.images.map(x => x.startsWith('data:') ? uploadPhoto(x) : Promise.resolve(x))) : u.images
        updates.push({ ...u, images })
      }
      items.push({ ...i, updates })
    }
    out.push({ ...b, items })
  }
  return out
}

// ── Colour palettes ───────────────────────────────────────────────────────
const COLOR_PAIRS = [
  { a: '#ef4444', b: '#f97316' }, { a: '#f97316', b: '#fbbf24' },
  { a: '#eab308', b: '#84cc16' }, { a: '#22c55e', b: '#10b981' },
  { a: '#14b8a6', b: '#06b6d4' }, { a: '#3b82f6', b: '#6366f1' },
  { a: '#6366f1', b: '#8b5cf6' }, { a: '#8b5cf6', b: '#d946ef' },
  { a: '#ec4899', b: '#f43f5e' }, { a: '#0891b2', b: '#06b6d4' },
  { a: '#1c1917', b: '#44403c' }, { a: '#78716c', b: '#a8a29e' },
]
const GROUP_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e','#10b981',
  '#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6',
  '#d946ef','#ec4899','#78716c','#1c1917',
]

// ── Status config ─────────────────────────────────────────────────────────
const STATUSES: Record<Status, { label: string; pill: string }> = {
  discuss:   { label: 'To discuss',  pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  discussed: { label: 'Discussed',   pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  progress:  { label: 'In progress', pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  done:      { label: 'Done',        pill: 'bg-green-50 text-green-700 ring-1 ring-green-200' },
  parked:    { label: 'Parked',      pill: 'bg-stone-100 text-stone-500 ring-1 ring-stone-200' },
}

// ── Default seed ──────────────────────────────────────────────────────────
const SEED: PlannerBoard[] = [
  {
    id: 'richard', title: 'Richard', subtitle: 'Willis Rd · Alloa Rd · Crownfield Rd',
    colorA: '#ef4444', colorB: '#f97316', section: 'landlords',
    items: [
      { id: 'r1', groupName: 'Willis Road', groupColor: '#ef4444', title: 'External facade — paint it but does it need scaffolding?', status: 'discuss', responsible: 'Harry', date: '—', updates: [{ id: 'u1', author: 'Harry', when: '12 Sep', body: "Need Damian's quote before committing. Richard wants to know if scaffolding adds too much — confirm before next call." }] },
      { id: 'r2', groupName: 'Willis Road', groupColor: '#ef4444', title: 'Communal kitchen set-up (crockery, drainer, utensils)', status: 'progress', responsible: 'Harry', date: '5 Sep', updates: [{ id: 'u2', author: 'Harry', when: '9 Sep', body: 'Ordered from Amazon, arriving Thursday. Damian to drop round and set up. Budget was £120.' }] },
      { id: 'r3', groupName: 'Willis Road', groupColor: '#ef4444', title: 'Rear gutter — fit small trap to ensure drainage', status: 'discussed', responsible: 'Damian', date: '2 Sep', updates: [{ id: 'u3', author: 'Harry', when: '2 Sep', body: 'Discussed on Monday call. Damian visiting week of 9 Sep.' }] },
      { id: 'r4', groupName: 'Willis Road', groupColor: '#ef4444', title: 'Kitchen sockets above worktop — get quote', status: 'discuss', responsible: 'Harry', date: '—', updates: [] },
      { id: 'r5', groupName: 'Willis Road', groupColor: '#ef4444', title: 'Boiler winter programme', status: 'done', responsible: 'Damian', date: '1 Aug', updates: [{ id: 'u4', author: 'Harry', when: '1 Aug', body: 'All done. Winter programme set and boiler checked.' }] },
      { id: 'r6', groupName: 'Alloa Road', groupColor: '#f97316', title: 'Room 2 floor — carpet or painting?', status: 'discuss', responsible: 'Harry', date: '10 Sep', updates: [{ id: 'u5', author: 'Harry', when: '10 Sep', body: "Richard leaning toward carpet. Get Damian's quote first — don't commit either way." }] },
      { id: 'r7', groupName: 'Alloa Road', groupColor: '#f97316', title: 'Mould Room 3 — full redecoration', status: 'progress', responsible: 'Damian', date: '8 Sep', updates: [{ id: 'u6', author: 'Harry', when: '8 Sep', body: 'Sand, treat with mould primer, repaint. Damian quoted £380 inc materials.' }, { id: 'u6b', author: 'Harry', when: '11 Sep', body: "Richard approved on today's call. Booked Damian for w/c 16 Sep." }] },
      { id: 'r8', groupName: 'Alloa Road', groupColor: '#f97316', title: 'Propose £1,100 redecoration package to Don', status: 'discuss', responsible: 'Harry', date: '—', updates: [{ id: 'u7', author: 'Harry', when: '12 Sep', body: 'Don counter-proposed £1,075. Consider splitting difference at £1,088.' }] },
      { id: 'r9', groupName: 'Alloa Road', groupColor: '#f97316', title: 'Hallway laminate flooring upgrade', status: 'parked', responsible: 'Harry', date: 'Spring 26', updates: [{ id: 'u8', author: 'Harry', when: '3 Sep', body: 'Richard happy to park until spring. Revisit Feb 2026 when void likely.' }] },
      { id: 'r10', groupName: 'Crownfield Road', groupColor: '#d97706', title: "Nest thermostat — get Richard's login credentials", status: 'discuss', responsible: 'Harry', date: '13 Sep', updates: [] },
      { id: 'r11', groupName: 'Crownfield Road', groupColor: '#d97706', title: 'End of November inspection', status: 'parked', responsible: 'Harry', date: 'Nov', updates: [{ id: 'u9', author: 'Harry', when: '10 Sep', body: 'Book with tenants closer to the time. Calendar w/c 17 Nov.' }] },
    ],
  },
  {
    id: 'nigel', title: 'Nigel', subtitle: 'Redstart Close · Bermondsey St',
    colorA: '#7c3aed', colorB: '#a78bfa', section: 'landlords',
    items: [
      { id: 'n1', groupName: 'Redstart Close', groupColor: '#7c3aed', title: 'Roof tiles survey — get surveyor quote', status: 'discuss', responsible: 'Harry', date: '10 Sep', updates: [] },
      { id: 'n2', groupName: 'Redstart Close', groupColor: '#7c3aed', title: 'EPC renewal', status: 'progress', responsible: 'Harry', date: '18 Oct', updates: [{ id: 'nu1', author: 'Harry', when: '8 Sep', body: 'Assessor booked for 18 Oct. Nigel is aware.' }] },
      { id: 'n3', groupName: 'Bermondsey Street', groupColor: '#a78bfa', title: 'Tenant checkout Room 4', status: 'progress', responsible: 'Damian', date: '30 Sep', updates: [] },
    ],
  },
  {
    id: 'refurb', title: 'Refurb pipeline', subtitle: 'Planned works across all properties',
    colorA: '#d97706', colorB: '#fbbf24', section: 'workspace',
    items: [
      { id: 'rf1', groupName: '2026 — planned', groupColor: '#d97706', title: 'Alloa Rd — full kitchen refurb', status: 'parked', responsible: 'Harry', date: 'Summer 26', updates: [{ id: 'rf1u', author: 'Harry', when: 'Sep', body: 'Budget estimate £8–12k. Richard keen to do during summer void period. Get 3 quotes in January.' }] },
      { id: 'rf2', groupName: '2026 — planned', groupColor: '#d97706', title: 'Willis Rd — external repaint', status: 'parked', responsible: 'Harry', date: 'Spring 26', updates: [] },
    ],
  },
]

const STORAGE_KEY = 'cros_planner_v1'
const SYNC_KEY = 'cros_planner_synced'   // set once this browser's planner has been shared with CROS
const uid = () => Math.random().toString(36).slice(2, 10)

function normaliseUrl(raw: string) {
  const s = raw.trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

function domainOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export default function PlannerPage() {
  const router = useRouter()
  const [loading, setLoading]               = useState(true)
  const [boards, setBoards]                 = useState<PlannerBoard[]>([])
  const [activeBoardId, setActiveBoardId]   = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [collapsed, setCollapsed]           = useState<Record<string, boolean>>({})
  const [addingTo, setAddingTo]             = useState<string | null>(null)
  const [newItemTitle, setNewItemTitle]     = useState('')
  const [updateDraft, setUpdateDraft]       = useState('')
  const [draftLinks, setDraftLinks]         = useState<string[]>([])
  const [draftImages, setDraftImages]       = useState<string[]>([])
  const [linkInput, setLinkInput]           = useState('')
  const [showLinkInput, setShowLinkInput]   = useState(false)
  const [newBoardTitle, setNewBoardTitle]   = useState('')
  const [newBoardSection, setNewBoardSection] = useState<'landlords' | 'workspace'>('landlords')
  const [showNewBoard, setShowNewBoard]     = useState(false)
  // Colour pickers
  const [colorPickerBoardId, setColorPickerBoardId] = useState<string | null>(null)
  const [colorPickerGroup,   setColorPickerGroup]   = useState<string | null>(null)
  const [colorPickerPos,     setColorPickerPos]     = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [editingTitle, setEditingTitle]             = useState(false)
  const [titleDraft, setTitleDraft]                 = useState('')
  const [showMobileSidebar, setShowMobileSidebar]   = useState(false)
  // Compile & send
  const [showCompile, setShowCompile]       = useState(false)
  const [compileItemId, setCompileItemId]   = useState<string | null>(null)
  const [contractorName, setContractorName] = useState('')
  const [contractorEmail, setContractorEmail] = useState('')
  const [personalMsg, setPersonalMsg]       = useState('')
  const [sending, setSending]               = useState(false)
  const [sendResult, setSendResult]         = useState<{ ok: boolean; msg: string } | null>(null)

  const updateRef = useRef<HTMLDivElement>(null)
  const photoRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user) { router.push('/login'); return }
      let local: PlannerBoard[] | null = null
      try { const raw = localStorage.getItem(STORAGE_KEY); local = raw ? JSON.parse(raw) : null } catch {}
      let server: PlannerBoard[] | null = null
      try {
        const r = await fetch('/api/admin/planner')
        if (r.ok) server = (await r.json()).boards
        else setSyncState('error')
      } catch { setSyncState('error') }
      // A device that has never synced (its planner only ever lived in this browser) brings its copy in first — its
      // notes win. After that the shared copy wins, and anything only on this device is merged in, never lost.
      let synced = false
      try { synced = localStorage.getItem(SYNC_KEY) === '1' } catch {}
      const data = server
        ? (local ? (synced ? mergeBoards(server, local) : mergeBoards(local, server)) : server)
        : (local ?? SEED)
      setBoards(data)
      setActiveBoardId(data[0]?.id ?? null)
      setLoading(false)
      if (!server || (local && JSON.stringify(data) !== JSON.stringify(server))) pushToServer(data)
    }
    init()
  }, [])

  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'error'>('saved')
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  async function pushToServer(next: PlannerBoard[]) {
    setSyncState('saving')
    try {
      const clean = await withUploadedPhotos(next)
      const r = await fetch('/api/admin/planner', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boards: clean }) })
      if (!r.ok) throw new Error()
      if (JSON.stringify(clean) !== JSON.stringify(next)) { setBoards(clean); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)) } catch {} }
      try { localStorage.setItem(SYNC_KEY, '1') } catch {}
      setSyncState('saved')
    } catch { setSyncState('error') }
  }
  function save(next: PlannerBoard[]) {
    setBoards(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => pushToServer(next), 700)
  }
  // a new heading (group) — shown straight away, ready for its first item
  const [addingHeading, setAddingHeading] = useState(false)
  const [newHeading, setNewHeading] = useState('')
  function addHeading() {
    const name = newHeading.trim()
    if (!name || !activeBoardId) return
    const used = new Set((activeBoard?.items ?? []).map(i => i.groupColor))
    const color = GROUP_COLORS.find(c => !used.has(c)) ?? GROUP_COLORS[0]
    save(boards.map(b => b.id !== activeBoardId ? b : { ...b, extraGroups: [...(b.extraGroups ?? []).filter(g => g.name !== name), { name, color }] }))
    setNewHeading(''); setAddingHeading(false); setAddingTo(name); setNewItemTitle('')
  }

  const activeBoard   = boards.find(b => b.id === activeBoardId) ?? null
  const selectedItem  = activeBoard?.items.find(i => i.id === selectedItemId) ?? null
  const compileItem   = compileItemId ? activeBoard?.items.find(i => i.id === compileItemId) ?? null : null

  const groups = (() => {
    if (!activeBoard) return []
    const seen = new Map<string, { color: string; items: PlannerItem[] }>()
    for (const item of activeBoard.items) {
      if (!seen.has(item.groupName)) seen.set(item.groupName, { color: item.groupColor, items: [] })
      seen.get(item.groupName)!.items.push(item)
    }
    for (const g of activeBoard.extraGroups ?? []) if (!seen.has(g.name)) seen.set(g.name, { color: g.color, items: [] })
    return Array.from(seen.entries()).map(([name, v]) => ({ name, ...v }))
  })()

  function addLink() {
    const url = normaliseUrl(linkInput)
    if (!url) return
    setDraftLinks(prev => [...prev, url])
    setLinkInput('')
    setShowLinkInput(false)
  }

  function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2 MB'); return }
      const reader = new FileReader()
      reader.onload = ev => {
        const result = ev.target?.result as string
        setDraftImages(prev => [...prev, result])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function saveUpdate() {
    if (!updateDraft.trim() && draftLinks.length === 0 && draftImages.length === 0) return
    if (!selectedItemId || !activeBoardId) return
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const upd: Update = {
      id: uid(), author: 'Harry', when: today,
      body: updateDraft.trim(),
      links: draftLinks.length ? draftLinks : undefined,
      images: draftImages.length ? draftImages : undefined,
    }
    save(boards.map(b => b.id !== activeBoardId ? b : {
      ...b, items: b.items.map(i => i.id !== selectedItemId ? i : { ...i, updates: [...i.updates, upd] })
    }))
    setUpdateDraft('')
    setDraftLinks([])
    setDraftImages([])
    setShowLinkInput(false)
    setTimeout(() => updateRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  function setStatus(itemId: string, status: Status) {
    save(boards.map(b => b.id !== activeBoardId ? b : {
      ...b, items: b.items.map(i => i.id !== itemId ? i : { ...i, status })
    }))
  }

  function submitNewItem(groupName: string, groupColor: string) {
    if (!newItemTitle.trim() || !activeBoardId) return
    const item: PlannerItem = { id: uid(), groupName, groupColor, title: newItemTitle.trim(), status: 'discuss', responsible: 'Harry', date: '—', updates: [] }
    save(boards.map(b => b.id !== activeBoardId ? b : { ...b, items: [...b.items, item] }))
    setNewItemTitle('')
    setAddingTo(null)
  }

  function submitNewBoard() {
    if (!newBoardTitle.trim()) return
    const colors: Record<string, { a: string; b: string }> = {
      landlords: { a: '#6366f1', b: '#8b5cf6' },
      workspace: { a: '#0891b2', b: '#06b6d4' },
    }
    const c = colors[newBoardSection]
    const b: PlannerBoard = { id: uid(), title: newBoardTitle.trim(), subtitle: newBoardSection === 'landlords' ? 'New landlord board' : 'Personal list', colorA: c.a, colorB: c.b, section: newBoardSection, items: [] }
    save([...boards, b])
    setActiveBoardId(b.id)
    setNewBoardTitle('')
    setNewBoardSection('landlords')
    setShowNewBoard(false)
  }

  function setBoardColor(boardId: string, colorA: string, colorB: string) {
    save(boards.map(b => b.id !== boardId ? b : { ...b, colorA, colorB }))
    setColorPickerBoardId(null)
  }

  function setGroupColor(groupName: string, color: string) {
    if (!activeBoardId) return
    save(boards.map(b => b.id !== activeBoardId ? b : {
      ...b, items: b.items.map(i => i.groupName === groupName ? { ...i, groupColor: color } : i)
    }))
    setColorPickerGroup(null)
  }

  function openBoardColorPicker(e: React.MouseEvent, boardId: string) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setColorPickerPos({ x: rect.left, y: rect.bottom + 6 })
    setColorPickerBoardId(boardId)
    setColorPickerGroup(null)
  }

  function openGroupColorPicker(e: React.MouseEvent, groupName: string) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setColorPickerPos({ x: rect.left, y: rect.bottom + 6 })
    setColorPickerGroup(groupName)
    setColorPickerBoardId(null)
  }

  function renameItem(itemId: string, newTitle: string) {
    if (!newTitle.trim() || !activeBoardId) return
    save(boards.map(b => b.id !== activeBoardId ? b : {
      ...b, items: b.items.map(i => i.id !== itemId ? i : { ...i, title: newTitle.trim() })
    }))
    setEditingTitle(false)
  }

  function deleteItem(itemId: string) {
    if (!activeBoardId) return
    save(boards.map(b => b.id !== activeBoardId ? b : { ...b, items: b.items.filter(i => i.id !== itemId) }))
    setSelectedItemId(null)
  }

  function openCompile(itemId: string) {
    setCompileItemId(itemId)
    setSendResult(null)
    setContractorName('')
    setContractorEmail('')
    setPersonalMsg('')
    setShowCompile(true)
  }

  async function sendBrief() {
    if (!contractorEmail.trim() || !compileItem || !activeBoard) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/planner/send-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorName: contractorName.trim(),
          contractorEmail: contractorEmail.trim(),
          personalMsg: personalMsg.trim(),
          boardTitle: activeBoard.title,
          itemTitle: compileItem.title,
          groupName: compileItem.groupName,
          status: STATUSES[compileItem.status].label,
          responsible: compileItem.responsible,
          updates: compileItem.updates,
        }),
      })
      const data = await res.json()
      setSendResult({ ok: res.ok, msg: res.ok ? `Brief sent to ${contractorEmail}` : (data.error || 'Failed to send') })
    } catch {
      setSendResult({ ok: false, msg: 'Network error — please try again' })
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#faf9f7' }}>
        <AppBar left={<BackButton href="/admin" />} />
        <div className="flex items-center justify-center h-48">
          <p className="text-sm" style={{ color: '#a8a29e' }}>Loading planner…</p>
        </div>
      </div>
    )
  }

  const landlordBoards  = boards.filter(b => b.section === 'landlords')
  const workspaceBoards = boards.filter(b => b.section === 'workspace')

  return (
    <div className="flex flex-col" style={{ height: '100vh', background: '#faf9f7', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AppBar left={<BackButton href="/admin" />} />

      <div className="flex-shrink-0">
        <PageHero title="Planner" subtitle="Your boards — landlords and the workspace"
          actions={<HeroButton href="/admin/planner/shared" primary>🤝 Shared planner</HeroButton>} />
      </div>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b" style={{ background: '#f2f0ec', borderColor: '#e5e2db' }}>
        <button onClick={() => setShowMobileSidebar(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, background: '#fff', border: '1px solid #e5e2db', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          {activeBoard && <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg,${activeBoard.colorA},${activeBoard.colorB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>{activeBoard.title[0]}</div>}
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1c1917', flex: 1 }}>{activeBoard?.title ?? 'Select board'}</span>
          <span style={{ fontSize: 10, color: '#b5b0a8' }}>▼</span>
        </button>
      </div>

      {/* ── Mobile board picker overlay ── */}
      {showMobileSidebar && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.4)' }} onClick={() => setShowMobileSidebar(false)}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#f2f0ec', borderRadius: '16px 16px 0 0', maxHeight: '70vh', overflowY: 'auto', padding: '16px 0 32px' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#b5b0a8', padding: '0 16px 8px' }}>Landlords</p>
            {landlordBoards.map(b => (
              <button key={b.id} onClick={() => { setActiveBoardId(b.id); setSelectedItemId(null); setShowMobileSidebar(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: b.id === activeBoardId ? '#fff' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${b.colorA},${b.colorB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{b.title[0]}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1c1917', margin: 0 }}>{b.title}</p>
                  <p style={{ fontSize: 11, color: '#a8a29e', margin: 0 }}>{b.items.length} items</p>
                </div>
              </button>
            ))}
            {workspaceBoards.length > 0 && <>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#b5b0a8', padding: '12px 16px 8px', borderTop: '1px solid #e5e2db', marginTop: 8 }}>Personal</p>
              {workspaceBoards.map(b => (
                <button key={b.id} onClick={() => { setActiveBoardId(b.id); setSelectedItemId(null); setShowMobileSidebar(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: b.id === activeBoardId ? '#fff' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${b.colorA},${b.colorB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{b.title[0]}</div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1c1917', margin: 0 }}>{b.title}</p>
                </button>
              ))}
            </>}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Board list sidebar — desktop only ── */}
        <div className="hidden md:flex flex-col flex-shrink-0 overflow-y-auto" style={{ width: 210, background: '#f2f0ec', borderRight: '1px solid #e5e2db' }}>
          <div style={{ padding: '16px 14px 6px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#b5b0a8' }}>Landlords</p>
          </div>
          {landlordBoards.map(b => {
            const active = b.id === activeBoardId
            const toDisc = b.items.filter(i => i.status === 'discuss').length
            return (
              <button key={b.id} onClick={() => { setActiveBoardId(b.id); setSelectedItemId(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '1px 8px', padding: '8px 10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', background: active ? '#fff' : 'transparent', border: active ? '1px solid #e0dbd2' : '1px solid transparent', boxShadow: active ? '0 1px 4px rgba(0,0,0,.06)' : 'none', transition: 'all .12s' }}>
                <div title="Change colour" onClick={e => openBoardColorPicker(e, b.id)} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg,${b.colorA},${b.colorB})`, cursor: 'pointer' }}>{b.title[0]}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: active ? '#1c1917' : '#6b6460', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</p>
                  <p style={{ fontSize: 10, color: '#b5b0a8', margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.items.length} items{toDisc ? ` · ${toDisc} to discuss` : ''}</p>
                </div>
                {toDisc > 0 && <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fef3c7', color: '#d97706', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{toDisc}</div>}
              </button>
            )
          })}

          {workspaceBoards.length > 0 && (
            <div style={{ padding: '14px 14px 6px', marginTop: 6, borderTop: '1px solid #e5e2db' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#b5b0a8' }}>Personal</p>
            </div>
          )}
          {workspaceBoards.map(b => {
            const active = b.id === activeBoardId
            return (
              <button key={b.id} onClick={() => { setActiveBoardId(b.id); setSelectedItemId(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '1px 8px', padding: '8px 10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', background: active ? '#fff' : 'transparent', border: active ? '1px solid #e0dbd2' : '1px solid transparent', boxShadow: active ? '0 1px 4px rgba(0,0,0,.06)' : 'none', transition: 'all .12s' }}>
                <div title="Change colour" onClick={e => openBoardColorPicker(e, b.id)} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg,${b.colorA},${b.colorB})`, cursor: 'pointer' }}>{b.title[0]}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: active ? '#1c1917' : '#6b6460', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</p>
                  <p style={{ fontSize: 10, color: '#b5b0a8', margin: '1px 0 0' }}>{b.items.length} items</p>
                </div>
              </button>
            )
          })}

          <div style={{ marginTop: 'auto', padding: 10, borderTop: '1px solid #e5e2db' }}>
            {showNewBoard ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input autoFocus value={newBoardTitle} onChange={e => setNewBoardTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitNewBoard(); if (e.key === 'Escape') { setShowNewBoard(false); setNewBoardSection('landlords') } }}
                  placeholder="Board name…"
                  style={{ fontSize: 12, border: '1px solid #d6d3cb', borderRadius: 6, padding: '6px 10px', outline: 'none', background: '#fff', color: '#1c1917', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['landlords', 'workspace'] as const).map(s => (
                    <button key={s} onClick={() => setNewBoardSection(s)}
                      style={{ flex: 1, fontSize: 10, fontWeight: 600, padding: '4px 0', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .1s', background: newBoardSection === s ? '#1c1917' : '#e5e2db', color: newBoardSection === s ? '#fff' : '#78716c' }}>
                      {s === 'landlords' ? 'Landlord' : 'Personal'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={submitNewBoard} style={{ flex: 1, fontSize: 11, background: '#1c1917', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 0', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                  <button onClick={() => { setShowNewBoard(false); setNewBoardSection('landlords') }} style={{ fontSize: 11, color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowNewBoard(true)}
                style={{ width: '100%', fontSize: 12, color: '#a8a29e', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New board
              </button>
            )}
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeBoard ? (
            <>
              {/* Board header */}
              <div style={{ background: '#fff', borderBottom: '1px solid #e5e2db', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                <div title="Change colour" onClick={e => openBoardColorPicker(e, activeBoard.id)} style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${activeBoard.colorA},${activeBoard.colorB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0, cursor: 'pointer' }}>{activeBoard.title[0]}</div>
                <div>
                  <h1 style={{ fontSize: 16, fontWeight: 600, color: '#1c1917', margin: 0, letterSpacing: '-.02em' }}>{activeBoard.title}</h1>
                  <p style={{ fontSize: 11, color: '#a8a29e', margin: '2px 0 0' }}>{activeBoard.subtitle}</p>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(Object.entries(STATUSES) as [Status, typeof STATUSES[Status]][]).map(([s, cfg]) => {
                    const n = activeBoard.items.filter(i => i.status === s).length
                    if (!n) return null
                    return <span key={s} className={`text-[10.5px] font-medium px-2.5 py-1 rounded-full ${cfg.pill}`}>{n} {cfg.label.toLowerCase()}</span>
                  })}
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Table */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e2db', background: '#f7f5f2' }}>
                        <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#b5b0a8', padding: '8px 12px 8px 20px', width: '46%' }}>Item</th>
                        <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#b5b0a8', padding: '8px 12px', width: 110 }}>Status</th>
                        <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#b5b0a8', padding: '8px 12px', width: 90 }}>Person</th>
                        <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#b5b0a8', padding: '8px 12px', width: 80 }}>Date</th>
                        <th style={{ width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.flatMap(group => {
                        const activeItems = group.items.filter(i => i.status !== 'done')
                        const doneItems   = group.items.filter(i => i.status === 'done')
                        const doneKey     = `done-${group.name}`
                        const doneOpen    = !!collapsed[doneKey] // reuse collapsed map, inverted: true = open
                        return [
                          // ── Group header ──
                          <tr key={`gh-${group.name}`}>
                            <td colSpan={5} style={{ padding: 0 }}>
                              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: '#f2f0ec', borderBottom: '1px solid #e5e2db' }}>
                                <button title="Change group colour" onClick={e => openGroupColorPicker(e, group.name)}
                                  style={{ width: 10, height: 10, borderRadius: '50%', background: group.color, flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(0,0,0,.08)', padding: 0, outline: 'none' }} />
                                <button onClick={() => setCollapsed(c => ({ ...c, [group.name]: !c[group.name] }))}
                                  style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>
                                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6b6460' }}>{group.name}</span>
                                  <span style={{ fontSize: 10, color: '#b5b0a8', background: '#e5e2db', borderRadius: 10, padding: '1px 7px' }}>{activeItems.length}</span>
                                  {doneItems.length > 0 && <span style={{ fontSize: 10, color: '#b5b0a8' }}>· {doneItems.length} done</span>}
                                  <span style={{ marginLeft: 'auto', fontSize: 9, color: '#c8c4be', transform: collapsed[group.name] ? 'rotate(-90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}>▼</span>
                                </button>
                              </div>
                            </td>
                          </tr>,

                          // ── Active item rows ──
                          ...(!collapsed[group.name] ? activeItems.map(item => {
                            const st = STATUSES[item.status]
                            const sel = selectedItemId === item.id
                            const hasAttachments = item.updates.some(u => u.links?.length || u.images?.length)
                            return (
                              <tr key={item.id} onClick={() => { setSelectedItemId(sel ? null : item.id); setEditingTitle(false) }}
                                style={{ borderBottom: '1px solid #eeebe6', cursor: 'pointer', background: sel ? 'rgba(251,191,36,.06)' : '#fff', transition: 'background .1s' }}
                                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLTableRowElement).style.background = '#f9f7f4' }}
                                onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLTableRowElement).style.background = '#fff' }}>
                                <td style={{ padding: '9px 12px 9px 24px' }}>
                                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1c1917', margin: 0, lineHeight: 1.35 }}>{item.title}</p>
                                  {item.updates.length > 0 && (
                                    <p style={{ fontSize: 11, color: '#a8a29e', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>{item.updates[item.updates.length - 1].body}</p>
                                  )}
                                </td>
                                <td style={{ padding: '9px 12px' }}>
                                  <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-md ${st.pill}`}>{st.label}</span>
                                </td>
                                <td style={{ padding: '9px 12px', fontSize: 12, color: '#78716c' }}>{item.responsible}</td>
                                <td style={{ padding: '9px 12px', fontSize: 11, color: '#b5b0a8' }}>{item.date}</td>
                                <td style={{ padding: '9px 8px', textAlign: 'center', fontSize: 11, color: '#d6d3cb', whiteSpace: 'nowrap' }}>
                                  {item.updates.length > 0 && <span title="Has notes">💬</span>}
                                  {hasAttachments && <span title="Has attachments" style={{ marginLeft: 2 }}>📎</span>}
                                </td>
                              </tr>
                            )
                          }) : []),

                          // ── Add item row ──
                          ...(!collapsed[group.name] ? [
                            <tr key={`add-${group.name}`} style={{ borderBottom: '1px solid #eeebe6', background: '#fff' }}>
                              <td colSpan={5} style={{ padding: '6px 12px 6px 24px' }}>
                                {addingTo === group.name ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input autoFocus value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') submitNewItem(group.name, group.color); if (e.key === 'Escape') setAddingTo(null) }}
                                      placeholder="Item title…"
                                      style={{ flex: 1, fontSize: 12.5, border: '1px solid #d6d3cb', borderRadius: 6, padding: '6px 10px', outline: 'none', background: '#fff', color: '#1c1917', fontFamily: 'inherit' }}
                                    />
                                    <button onClick={() => submitNewItem(group.name, group.color)} style={{ fontSize: 11, background: '#1c1917', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                                    <button onClick={() => setAddingTo(null)} style={{ fontSize: 11, color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setAddingTo(group.name); setNewItemTitle('') }}
                                    style={{ fontSize: 11.5, color: '#c8c4be', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', padding: 0 }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#c4873a')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#c8c4be')}>
                                    ＋ Add item
                                  </button>
                                )}
                              </td>
                            </tr>
                          ] : []),

                          // ── Completed accordion ──
                          ...(!collapsed[group.name] && doneItems.length > 0 ? [
                            // Accordion toggle row
                            <tr key={`done-toggle-${group.name}`}>
                              <td colSpan={5} style={{ padding: 0 }}>
                                <button onClick={() => setCollapsed(c => ({ ...c, [doneKey]: !c[doneKey] }))}
                                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px 6px 24px', background: '#fafaf9', borderBottom: '1px solid #eeebe6', borderTop: '1px solid #eeebe6', cursor: 'pointer', border: 'none', borderTopWidth: 1, borderBottomWidth: 1, borderStyle: 'solid', borderColor: '#eeebe6', fontFamily: 'inherit', textAlign: 'left' }}>
                                  <span style={{ fontSize: 10, color: '#b5b0a8', transform: doneOpen ? 'none' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform .15s' }}>▾</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#b5b0a8', letterSpacing: '.01em' }}>✓ {doneItems.length} completed</span>
                                  <span style={{ fontSize: 10, color: '#c8c4be' }}>— click to {doneOpen ? 'hide' : 'show'}</span>
                                </button>
                              </td>
                            </tr>,
                            // Done item rows (when accordion open)
                            ...(doneOpen ? doneItems.map(item => {
                              const sel = selectedItemId === item.id
                              return (
                                <tr key={item.id} onClick={() => { setSelectedItemId(sel ? null : item.id); setEditingTitle(false) }}
                                  style={{ borderBottom: '1px solid #eeebe6', cursor: 'pointer', background: sel ? 'rgba(251,191,36,.04)' : '#fafaf9', transition: 'background .1s', opacity: 0.75 }}
                                  onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLTableRowElement).style.background = '#f5f3f0' }}
                                  onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLTableRowElement).style.background = '#fafaf9' }}>
                                  <td style={{ padding: '8px 12px 8px 32px' }}>
                                    <p style={{ fontSize: 12.5, fontWeight: 400, color: '#78716c', margin: 0, lineHeight: 1.3, textDecoration: 'line-through', textDecorationColor: '#d6d3cb' }}>{item.title}</p>
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-green-50 text-green-700 ring-1 ring-green-200">Done</span>
                                  </td>
                                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#a8a29e' }}>{item.responsible}</td>
                                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#c8c4be' }}>{item.date}</td>
                                  <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                    <button
                                      title="Reopen this item"
                                      onClick={e => { e.stopPropagation(); setStatus(item.id, 'discuss') }}
                                      style={{ fontSize: 9.5, color: '#a8a29e', background: '#f2f0ec', border: '1px solid #e5e2db', borderRadius: 5, padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                                      onMouseEnter={e => (e.currentTarget.style.background = '#e5e2db')}
                                      onMouseLeave={e => (e.currentTarget.style.background = '#f2f0ec')}>
                                      ↩ Reopen
                                    </button>
                                  </td>
                                </tr>
                              )
                            }) : [])
                          ] : [])
                        ]
                      })}
                    </tbody>
                  </table>
                  {/* New heading — e.g. another property on this landlord's board */}
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #eeebe6', background: '#fff', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {addingHeading ? (
                      <>
                        <input autoFocus value={newHeading} onChange={e => setNewHeading(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addHeading(); if (e.key === 'Escape') setAddingHeading(false) }}
                          placeholder="Heading, e.g. Willis Road"
                          style={{ flex: '1 1 180px', fontSize: 13, border: '1px solid #d6d3cb', borderRadius: 6, padding: '8px 10px', outline: 'none', background: '#fff', color: '#1c1917', fontFamily: 'inherit' }} />
                        <button onClick={addHeading} style={{ fontSize: 12, background: '#1c1917', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Add heading</button>
                        <button onClick={() => setAddingHeading(false)} style={{ fontSize: 12, color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => { setAddingHeading(true); setNewHeading('') }}
                        style={{ fontSize: 12.5, fontWeight: 600, color: '#6b6460', background: '#f5f4f2', border: '1px dashed #d6d3cb', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        ＋ New heading
                      </button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: syncState === 'error' ? '#b91c1c' : '#a8a29e' }}>
                      {syncState === 'saving' ? 'Saving…' : syncState === 'error' ? 'Not saved to CROS — check your connection' : 'Saved — same on phone and computer'}
                    </span>
                  </div>
                </div>

                {/* ── Detail panel — side panel on desktop, bottom sheet on mobile ── */}
                {selectedItem && (
                  <>
                  {/* Mobile backdrop */}
                  <div className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,.4)' }} onClick={() => setSelectedItemId(null)} />
                  <div className="fixed bottom-0 left-0 right-0 z-50 md:static md:z-auto md:bottom-auto md:h-full" style={{ maxHeight: '90vh', background: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid #e5e2db', flexShrink: 0, width: 300 }}
                    // desktop overrides via inline - Tailwind md: only handles display not exact style
                  >
                  {/* Drag handle for mobile */}
                  <div className="md:hidden w-12 h-1.5 rounded-full bg-neutral-200 mx-auto mt-2.5 mb-1 flex-shrink-0" />
                    <div style={{ height: 3, background: `linear-gradient(90deg,${activeBoard.colorA},${activeBoard.colorB})`, flexShrink: 0 }} />

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {/* Title + actions */}
                      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #eeebe6' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          {editingTitle ? (
                            <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') renameItem(selectedItem.id, titleDraft); if (e.key === 'Escape') setEditingTitle(false) }}
                              onBlur={() => renameItem(selectedItem.id, titleDraft)}
                              style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#1c1917', border: '1px solid #d4b483', borderRadius: 6, padding: '3px 7px', outline: 'none', fontFamily: 'inherit', lineHeight: 1.35 }}
                            />
                          ) : (
                            <h2 onClick={() => { setTitleDraft(selectedItem.title); setEditingTitle(true) }}
                              title="Click to edit title"
                              style={{ fontSize: 13.5, fontWeight: 600, color: '#1c1917', margin: 0, lineHeight: 1.35, flex: 1, cursor: 'text', borderRadius: 4, padding: '2px 4px', marginLeft: -4 }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f7f5f2')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              {selectedItem.title} <span style={{ fontSize: 10, color: '#c8c4be', fontWeight: 400 }}>✏</span>
                            </h2>
                          )}
                          <button onClick={() => setSelectedItemId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b5b0a8', fontSize: 14, lineHeight: 1, flexShrink: 0, padding: 2, marginTop: 1 }}>✕</button>
                        </div>
                        <p style={{ fontSize: 11, color: '#a8a29e', margin: '4px 0 10px' }}>{selectedItem.groupName} · {activeBoard.title}</p>
                        {/* Compile button */}
                        <button onClick={() => openCompile(selectedItem.id)}
                          style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: `linear-gradient(135deg,${activeBoard.colorA},${activeBoard.colorB})`, border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span>📋</span> Compile & Send Brief
                        </button>
                      </div>

                      {/* Meta grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #eeebe6' }}>
                        {[
                          { label: 'Status', content: (
                            <select value={selectedItem.status} onChange={e => setStatus(selectedItem.id, e.target.value as Status)}
                              className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-md border-0 cursor-pointer w-full ${STATUSES[selectedItem.status].pill}`}
                              style={{ outline: 'none', fontFamily: 'inherit' }}>
                              {(Object.entries(STATUSES) as [Status, typeof STATUSES[Status]][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          )},
                          { label: 'Responsible', content: <span style={{ fontSize: 12, color: '#57534e' }}>{selectedItem.responsible}</span> },
                          { label: 'Property', content: <span style={{ fontSize: 12, color: '#57534e' }}>{selectedItem.groupName}</span> },
                          { label: 'Date', content: <span style={{ fontSize: 12, color: '#57534e' }}>{selectedItem.date}</span> },
                        ].map((field, i) => (
                          <div key={i} style={{ padding: '10px 14px', borderRight: i % 2 === 0 ? '1px solid #eeebe6' : 'none', borderTop: i >= 2 ? '1px solid #eeebe6' : 'none' }}>
                            <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#b5b0a8', margin: '0 0 5px' }}>{field.label}</p>
                            {field.content}
                          </div>
                        ))}
                      </div>

                      {/* Updates thread */}
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#b5b0a8', margin: 0 }}>Notes & updates</p>
                          {selectedItem.updates.length > 0 && <span style={{ fontSize: 10, color: '#b5b0a8' }}>{selectedItem.updates.length}</span>}
                        </div>
                        {selectedItem.updates.length === 0 ? (
                          <p style={{ fontSize: 12, color: '#b5b0a8', fontStyle: 'italic' }}>No notes yet — add one below</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {selectedItem.updates.map(u => (
                              <div key={u.id}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#1c1917', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{u.author[0]}</div>
                                  <span style={{ fontSize: 10, color: '#a8a29e' }}>{u.author} · {u.when}</span>
                                </div>
                                <div style={{ background: '#f7f5f2', border: '1px solid #e5e2db', borderRadius: '0 8px 8px 8px', padding: '8px 11px' }}>
                                  {u.body && <p style={{ fontSize: 12.5, color: '#57534e', lineHeight: 1.55, margin: 0 }}>{u.body}</p>}
                                  {/* Attached links */}
                                  {u.links && u.links.length > 0 && (
                                    <div style={{ marginTop: u.body ? 8 : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {u.links.map((link, li) => (
                                        <a key={li} href={link} target="_blank" rel="noreferrer"
                                          style={{ fontSize: 11, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                                          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                                          🔗 {domainOf(link)}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  {/* Attached images */}
                                  {u.images && u.images.length > 0 && (
                                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                                      {u.images.map((img, ii) => (
                                        <a key={ii} href={img} target="_blank" rel="noreferrer">
                                          <img src={img} alt={`Photo ${ii + 1}`} style={{ width: '100%', borderRadius: 5, objectFit: 'cover', aspectRatio: '4/3', border: '1px solid #e5e2db' }} />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div ref={updateRef} />
                      </div>

                      {/* Delete */}
                      <div style={{ padding: '0 16px 14px', borderTop: '1px solid #eeebe6', paddingTop: 12, marginTop: 4 }}>
                        <button onClick={() => { if (confirm('Delete this item?')) deleteItem(selectedItem.id) }}
                          style={{ fontSize: 11, color: '#e57373', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                          Delete item
                        </button>
                      </div>
                    </div>

                    {/* ── Note composer ── */}
                    <div style={{ borderTop: '1px solid #e5e2db', padding: '10px 12px 12px', flexShrink: 0, background: '#faf9f7' }}>
                      {/* Draft attachments preview */}
                      {(draftLinks.length > 0 || draftImages.length > 0) && (
                        <div style={{ marginBottom: 8, padding: '7px 10px', background: '#f2f0ec', borderRadius: 8, border: '1px solid #e5e2db' }}>
                          {draftLinks.map((l, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 11, color: '#2563eb' }}>🔗 {domainOf(l)}</span>
                              <button onClick={() => setDraftLinks(p => p.filter((_, j) => j !== i))} style={{ fontSize: 10, color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>✕</button>
                            </div>
                          ))}
                          {draftImages.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, marginTop: draftLinks.length ? 4 : 0 }}>
                              {draftImages.map((img, i) => (
                                <div key={i} style={{ position: 'relative' }}>
                                  <img src={img} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 5, border: '1px solid #d6d3cb' }} />
                                  <button onClick={() => setDraftImages(p => p.filter((_, j) => j !== i))}
                                    style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: '#1c1917', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Link input */}
                      {showLinkInput && (
                        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                          <input autoFocus value={linkInput} onChange={e => setLinkInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addLink(); if (e.key === 'Escape') setShowLinkInput(false) }}
                            placeholder="Paste a URL…"
                            style={{ flex: 1, fontSize: 12, border: '1px solid #d6d3cb', borderRadius: 6, padding: '5px 9px', outline: 'none', background: '#fff', color: '#1c1917', fontFamily: 'inherit' }}
                          />
                          <button onClick={addLink} style={{ fontSize: 11, background: '#1c1917', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Add</button>
                          <button onClick={() => setShowLinkInput(false)} style={{ fontSize: 11, color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                        </div>
                      )}

                      <textarea value={updateDraft} onChange={e => setUpdateDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) saveUpdate() }}
                        placeholder="Add a note… (⌘↵ to save)"
                        rows={2}
                        style={{ width: '100%', fontSize: 12, border: '1px solid #e5e2db', borderRadius: 8, padding: '7px 10px', outline: 'none', background: '#fff', color: '#1c1917', fontFamily: 'inherit', resize: 'none', lineHeight: 1.45, boxSizing: 'border-box' }}
                        onFocus={e => (e.target.style.borderColor = '#d4b483')}
                        onBlur={e => (e.target.style.borderColor = '#e5e2db')}
                      />

                      {/* Toolbar row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <button onClick={() => setShowLinkInput(v => !v)} title="Attach link"
                          style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 5, color: showLinkInput ? '#2563eb' : '#b5b0a8', transition: 'color .1s' }}>
                          🔗
                        </button>
                        <button onClick={() => photoRef.current?.click()} title="Attach photo"
                          style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 5, color: '#b5b0a8' }}>
                          📷
                        </button>
                        <input ref={photoRef} type="file" accept="image/*" multiple onChange={addPhoto} style={{ display: 'none' }} />
                        <button onClick={saveUpdate}
                          style={{ marginLeft: 'auto', padding: '6px 14px', background: '#1c1917', color: '#fff', border: 'none', borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#44403c')}
                          onMouseLeave={e => (e.currentTarget.style.background = '#1c1917')}>
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 13, color: '#a8a29e' }}>Select a board to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Colour picker — board ── */}
      {colorPickerBoardId && (
        <div onClick={() => setColorPickerBoardId(null)} style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', left: Math.min(colorPickerPos.x, window.innerWidth - 196), top: colorPickerPos.y, zIndex: 61, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: 12, border: '1px solid #e5e2db', width: 184 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#b5b0a8', margin: '0 0 8px' }}>Board colour</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {COLOR_PAIRS.map((pair, i) => {
                const board = boards.find(b => b.id === colorPickerBoardId)
                const active = board?.colorA === pair.a && board?.colorB === pair.b
                return (
                  <button key={i} onClick={() => setBoardColor(colorPickerBoardId, pair.a, pair.b)}
                    style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${pair.a},${pair.b})`, border: active ? '2px solid #1c1917' : '2px solid transparent', cursor: 'pointer', boxShadow: active ? '0 0 0 1px #fff inset' : 'none', outline: 'none', transition: 'transform .1s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.12)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Colour picker — group dot ── */}
      {colorPickerGroup && (
        <div onClick={() => setColorPickerGroup(null)} style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', left: Math.min(colorPickerPos.x, window.innerWidth - 196), top: colorPickerPos.y, zIndex: 61, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: 12, border: '1px solid #e5e2db', width: 184 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#b5b0a8', margin: '0 0 8px' }}>Group colour</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {GROUP_COLORS.map((color, i) => {
                const currentColor = activeBoard?.items.find(it => it.groupName === colorPickerGroup)?.groupColor
                const active = currentColor === color
                return (
                  <button key={i} onClick={() => setGroupColor(colorPickerGroup, color)}
                    style={{ width: 20, height: 20, borderRadius: '50%', background: color, border: active ? '2px solid #1c1917' : '2px solid transparent', cursor: 'pointer', boxShadow: active ? '0 0 0 1px #fff inset' : 'none', outline: 'none', transition: 'transform .1s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Compile & Send modal ── */}
      {showCompile && compileItem && activeBoard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCompile(false) }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            {/* Modal header */}
            <div style={{ height: 3, background: `linear-gradient(90deg,${activeBoard.colorA},${activeBoard.colorB})`, flexShrink: 0 }} />
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #eeebe6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1c1917', margin: 0 }}>Compile & Send Brief</h3>
                <p style={{ fontSize: 11, color: '#a8a29e', margin: '3px 0 0' }}>{compileItem.title}</p>
              </div>
              <button onClick={() => setShowCompile(false)} style={{ background: 'none', border: 'none', fontSize: 16, color: '#b5b0a8', cursor: 'pointer', padding: 4 }}>✕</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Brief preview */}
              <div style={{ margin: '16px 20px', background: '#f7f5f2', borderRadius: 10, border: '1px solid #e5e2db', padding: '14px 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#b5b0a8', margin: '0 0 10px' }}>Brief contents</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1c1917', margin: '0 0 4px' }}>{compileItem.title}</p>
                <p style={{ fontSize: 11, color: '#78716c', margin: '0 0 10px' }}>{compileItem.groupName} · {activeBoard.title} · {STATUSES[compileItem.status].label}</p>
                {compileItem.updates.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#b5b0a8', fontStyle: 'italic', margin: 0 }}>No notes yet</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {compileItem.updates.map(u => (
                      <div key={u.id} style={{ borderLeft: '2px solid #e5e2db', paddingLeft: 10 }}>
                        <p style={{ fontSize: 10, color: '#a8a29e', margin: '0 0 2px' }}>{u.author} · {u.when}</p>
                        {u.body && <p style={{ fontSize: 12, color: '#57534e', margin: 0, lineHeight: 1.5 }}>{u.body}</p>}
                        {u.links?.map((l, i) => <p key={i} style={{ fontSize: 11, color: '#2563eb', margin: '3px 0 0' }}>🔗 {l}</p>)}
                        {u.images && u.images.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                            {u.images.map((img, i) => <img key={i} src={img} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid #d6d3cb' }} />)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* Count photos / links */}
                {(() => {
                  const links = compileItem.updates.flatMap(u => u.links || [])
                  const photos = compileItem.updates.flatMap(u => u.images || [])
                  if (!links.length && !photos.length) return null
                  return <p style={{ fontSize: 10, color: '#b5b0a8', margin: '10px 0 0' }}>{[links.length && `${links.length} link${links.length > 1 ? 's' : ''}`, photos.length && `${photos.length} photo${photos.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')} will be included</p>
                })()}
              </div>

              {/* Contractor details */}
              <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#b5b0a8', margin: 0 }}>Send to</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#78716c', display: 'block', marginBottom: 4 }}>Name</label>
                    <input value={contractorName} onChange={e => setContractorName(e.target.value)} placeholder="Damian"
                      style={{ width: '100%', fontSize: 12.5, border: '1px solid #d6d3cb', borderRadius: 7, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', color: '#1c1917', boxSizing: 'border-box' }}
                      onFocus={e => (e.target.style.borderColor = '#d4b483')} onBlur={e => (e.target.style.borderColor = '#d6d3cb')}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#78716c', display: 'block', marginBottom: 4 }}>Email <span style={{ color: '#e57373' }}>*</span></label>
                    <input type="email" value={contractorEmail} onChange={e => setContractorEmail(e.target.value)} placeholder="contractor@email.com"
                      style={{ width: '100%', fontSize: 12.5, border: '1px solid #d6d3cb', borderRadius: 7, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', color: '#1c1917', boxSizing: 'border-box' }}
                      onFocus={e => (e.target.style.borderColor = '#d4b483')} onBlur={e => (e.target.style.borderColor = '#d6d3cb')}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#78716c', display: 'block', marginBottom: 4 }}>Personal note (optional)</label>
                  <textarea value={personalMsg} onChange={e => setPersonalMsg(e.target.value)} rows={2}
                    placeholder="Hey Damian — here's the brief for the bathroom project…"
                    style={{ width: '100%', fontSize: 12.5, border: '1px solid #d6d3cb', borderRadius: 7, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', color: '#1c1917', resize: 'none', lineHeight: 1.45, boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = '#d4b483')} onBlur={e => (e.target.style.borderColor = '#d6d3cb')}
                  />
                </div>

                {sendResult && (
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: sendResult.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${sendResult.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 12.5, color: sendResult.ok ? '#15803d' : '#dc2626' }}>
                    {sendResult.msg}
                  </div>
                )}

                <button onClick={sendBrief} disabled={sending || !contractorEmail.trim()}
                  style={{ width: '100%', padding: '10px 0', background: sending || !contractorEmail.trim() ? '#d6d3cb' : `linear-gradient(135deg,${activeBoard.colorA},${activeBoard.colorB})`, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: sending || !contractorEmail.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}>
                  {sending ? 'Sending…' : '📋 Send brief'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
