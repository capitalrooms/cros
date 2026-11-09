// /api/lettings/listings — the listing record (migration 227) for the editor and the marketing board. Office staff.
//   GET                       → board: { listings: [...open, with room/house names, photo, missing], toList: [rooms free with no listing] }
//   GET ?roomId= | ?propertyId= (whole unit) → { listing | null, channels, photos, house, room, missing, shareUrl }
//   POST { roomId?, propertyId }             → start a draft (or return the one already open)
//   PATCH { id, fields }                     → save fields (only the editable ones) → { listing, missing }
//   POST { id, action: 'move', to }          → move on the board, with its checks
//   POST { id, action: 'channel', channel, enabled } → switch a channel on/off
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { draftFromRoom, depositsFor, missingForReady, EDITABLE, CHANNELS, CHANNEL_READY, CHANNEL_LABEL, type Channel, type ListingStatus } from '@/lib/listing/record'
import { listingPath } from '@/lib/listing/listing'
import { smartFill } from '@/lib/listing/smartFill'
import { fromRecord, blanksFrom } from '@/lib/listing/fromRecord'

export const dynamic = 'force-dynamic'
const OPEN = ['draft', 'ready', 'live', 'let_agreed']
const notSetUp = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /listings/.test(e.message ?? '') && /does not exist|schema cache/.test(e.message ?? ''))
const setup = () => NextResponse.json({ setupNeeded: true, error: 'Run migration 227 in Supabase first.' }, { status: 503 })
const photoUrl = (s: any, x: any) => x.file_url || s.storage.from('property-photos').getPublicUrl(String(x.file_path)).data.publicUrl
const base = () => process.env.NEXT_PUBLIC_APP_URL || 'https://capitalrooms.co.uk'

async function full(s: any, listing: any) {
  const [{ data: photos }, { data: channels }, { data: house }, { data: room }] = await Promise.all([
    s.from('property_photos').select('*').eq('property_id', listing.property_id),   // * so the newer area column is read once it exists
    s.from('listing_channels').select('channel, enabled, status, external_ref, last_sent_at, last_result').eq('listing_id', listing.id),
    s.from('properties').select('id, name, address, postcode, property_type').eq('id', listing.property_id).maybeSingle(),
    listing.room_id ? s.from('rooms').select('id, name').eq('id', listing.room_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  // for the links under the header: this room's live applicants and upcoming viewings (9 Nov 2026)
  const todayLdn = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const [{ count: applicants }, { count: viewings }] = listing.room_id ? await Promise.all([
    s.from('applicants').select('id', { count: 'exact', head: true }).eq('room_id', listing.room_id).is('archived_at', null).neq('pipeline_stage', 'converted'),
    s.from('viewings').select('id', { count: 'exact', head: true }).eq('room_id', listing.room_id).gte('viewing_date', todayLdn),
  ]) : [{ count: 0 }, { count: 0 }]
  const ph = ((photos ?? []) as any[]).map(x => ({ id: x.id, url: photoUrl(s, x), video: String(x.file_type ?? '').startsWith('video'), caption: x.caption, area: x.area ?? (x.room_id ? 'room' : null), ofRoom: !!listing.room_id && x.room_id === listing.room_id, otherRoom: !!x.room_id && x.room_id !== listing.room_id }))
  const inOrder = (listing.media_order ?? []).filter((id: string) => ph.some(p => p.id === id))
  return {
    listing, house, room, photos: ph, mediaCount: inOrder.length, counts: { applicants: applicants ?? 0, viewings: viewings ?? 0 },
    channels: CHANNELS.map(c => ({ channel: c, label: CHANNEL_LABEL[c], available: CHANNEL_READY[c], ...(((channels ?? []) as any[]).find(x => x.channel === c) ?? { enabled: false }) })),
    missing: missingForReady(listing, inOrder.length),
    shareUrl: listing.room_id ? `https://capitalrooms.co.uk${listingPath(listing.room_id)}` : null,   // listings live on the website
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient() as any
  const roomId = req.nextUrl.searchParams.get('roomId'), propertyId = req.nextUrl.searchParams.get('propertyId')
  if (roomId || propertyId) {
    let q = s.from('listings').select('*').in('status', OPEN).order('created_at', { ascending: false }).limit(1)
    q = roomId ? q.eq('room_id', roomId) : q.eq('property_id', propertyId).is('room_id', null)
    const { data, error } = await q
    if (notSetUp(error)) return setup()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ listing: null })
    return NextResponse.json(await full(s, data[0]))
  }
  // the board
  const { data: openAll, error } = await s.from('listings').select('*, properties(name, address, is_demo), rooms(name)').in('status', OPEN).order('updated_at', { ascending: false })
  const open = ((openAll ?? []) as any[]).filter(l => !l.properties?.is_demo)   // practice houses stay off the board
  if (notSetUp(error)) return setup()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = ((open ?? []) as any[]).flatMap(l => (l.media_order ?? []).slice(0, 1))
  const { data: firsts } = ids.length ? await s.from('property_photos').select('id, file_path, file_url').in('id', ids) : { data: [] }
  const { data: chans } = (open ?? []).length ? await s.from('listing_channels').select('listing_id, channel').eq('enabled', true).in('listing_id', (open as any[]).map(l => l.id)) : { data: [] }
  const listings = ((open ?? []) as any[]).map(l => {
    const f = ((firsts ?? []) as any[]).find(x => x.id === (l.media_order ?? [])[0])
    return { id: l.id, status: l.status as ListingStatus, room_id: l.room_id, property_id: l.property_id, headline: l.headline, rent: l.rent, available_from: l.available_from,
      house: String(l.properties?.name || l.properties?.address || '').split('\n')[0], room: l.rooms?.name ?? null, photo: f ? photoUrl(s, f) : null,
      channels: ((chans ?? []) as any[]).filter(c => c.listing_id === l.id).map(c => CHANNEL_LABEL[c.channel as Channel]),
      missing: missingForReady(l, (l.media_order ?? []).length), updated_at: l.updated_at }
  })
  // rooms free (or coming free) with no open listing — to start one
  const listed = new Set(listings.map(l => l.room_id).filter(Boolean))
  const { data: free } = await s.from('rooms').select('id, name, property_id, status, available_date, current_asking_rent, properties(name, address, is_demo)').in('status', ['available', 'on_notice']).order('available_date', { ascending: true })
  const toList = ((free ?? []) as any[]).filter(r => !listed.has(r.id) && !r.properties?.is_demo)
    .map(r => ({ room_id: r.id, property_id: r.property_id, room: r.name, house: String(r.properties?.name || r.properties?.address || '').split('\n')[0], status: r.status, available_date: r.available_date, rent: r.current_asking_rent }))
  return NextResponse.json({ listings, toList })
}

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient() as any
  const b = await req.json().catch(() => ({}))

  if (!b.action) {   // start a draft
    const roomId = b.roomId ? String(b.roomId) : null
    let propertyId = b.propertyId ? String(b.propertyId) : null
    if (roomId && !propertyId) propertyId = (await s.from('rooms').select('property_id').eq('id', roomId).maybeSingle()).data?.property_id ?? null
    if (!propertyId) return NextResponse.json({ error: 'Choose the room or the property' }, { status: 400 })
    let q = s.from('listings').select('*').in('status', OPEN).limit(1)
    q = roomId ? q.eq('room_id', roomId) : q.eq('property_id', propertyId).is('room_id', null)
    const { data: have, error: e0 } = await q
    if (notSetUp(e0)) return setup()
    if (have?.length) return NextResponse.json(await full(s, have[0]))
    const draft = await draftFromRoom(s, roomId, propertyId, me.personId)
    const { data, error } = await s.from('listings').insert(draft).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await s.from('listing_channels').insert({ listing_id: data.id, channel: 'share', enabled: false })
    return NextResponse.json(await full(s, data))
  }

  const { data: l, error: e1 } = await s.from('listings').select('*').eq('id', String(b.id ?? '')).maybeSingle()
  if (notSetUp(e1)) return setup()
  if (!l) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

  if (b.action === 'channel') {
    const c = String(b.channel) as Channel
    if (!CHANNELS.includes(c)) return NextResponse.json({ error: 'Unknown channel' }, { status: 400 })
    if (b.enabled && !CHANNEL_READY[c]) return NextResponse.json({ error: `${CHANNEL_LABEL[c]} needs its feed set up first — it's ready in the listing, but can't be sent yet.` }, { status: 409 })
    // the Website switch and the room's "Show on website" tick are one thing (9 Nov 2026)
    if (c === 'website' && l.room_id) await s.from('rooms').update({ show_on_website: !!b.enabled }).eq('id', l.room_id)
    await s.from('listing_channels').upsert({ listing_id: l.id, channel: c, enabled: !!b.enabled, status: b.enabled ? (l.status === 'live' ? 'live' : 'waiting') : 'off', updated_at: new Date().toISOString() }, { onConflict: 'listing_id,channel' })
    return NextResponse.json(await full(s, l))
  }

  // { action: 'smart-fill' } → the empty fields filled from the advert's own words, and anything that disagrees flagged
  if (b.action === 'smart-fill') {
    const [{ data: house }, { data: room }] = await Promise.all([
      s.from('properties').select('name, address, postcode, property_type').eq('id', l.property_id).maybeSingle(),
      l.room_id ? s.from('rooms').select('name').eq('id', l.room_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    // first what CROS already holds about the room and house, then the advert's own words for what's still blank
    const rec = blanksFrom(l, await fromRecord(s, l.room_id, l.property_id))
    const merged = { ...l, ...rec }
    let got: { fields: Record<string, unknown>; checks: string[] } = { fields: {}, checks: [] }
    if (merged.description) { try { got = await smartFill(merged, house, room?.name ?? null) } catch (e: any) { if (!Object.keys(rec).length) return NextResponse.json({ error: e?.message ?? 'Couldn’t read the advert' }, { status: 502 }) } }
    got = { ...got, fields: { ...rec, ...got.fields } }
    let row = l
    if (Object.keys(got.fields).length) {
      const { data, error } = await s.from('listings').update({ ...got.fields, updated_at: new Date().toISOString() }).eq('id', l.id).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      row = data
    }
    return NextResponse.json({ ...(await full(s, row)), filled: Object.keys(got.fields), checks: got.checks })
  }

  if (b.action === 'move') {
    const to = String(b.to) as ListingStatus
    const now = new Date().toISOString()
    const { data: chans } = await s.from('listing_channels').select('channel, enabled').eq('listing_id', l.id)
    const on = ((chans ?? []) as any[]).filter(c => c.enabled)
    const missing = missingForReady(l, (l.media_order ?? []).length)
    if ((to === 'ready' || to === 'live') && missing.length) return NextResponse.json({ error: `Not ready yet — still needed: ${missing.join(', ')}.` }, { status: 409 })
    if (to === 'live' && !on.length) return NextResponse.json({ error: 'Switch on at least one place for it to go — the share link or the website.' }, { status: 409 })
    const patch: Record<string, unknown> = { status: to, updated_at: now }
    if (to === 'live') { patch.published_at = l.published_at ?? now; await s.from('listing_channels').update({ status: 'live', last_sent_at: now }).eq('listing_id', l.id).eq('enabled', true) }
    if (to === 'let_agreed' || to === 'let' || to === 'withdrawn') {
      // taken down everywhere at once
      await s.from('listing_channels').update({ enabled: false, status: 'withdrawn', last_sent_at: now }).eq('listing_id', l.id).eq('enabled', true)
      if (to === 'let_agreed') patch.let_agreed_at = now
      if (to === 'withdrawn') patch.withdrawn_at = now
    }
    const { data, error } = await s.from('listings').update(patch).eq('id', l.id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(await full(s, data))
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient() as any
  const b = await req.json().catch(() => ({}))
  const f = b.fields ?? {}
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE) if (k in f) patch[k] = f[k] === '' ? null : f[k]
  if (Array.isArray(patch.features)) patch.features = (patch.features as unknown[]).map(x => String(x).trim()).filter(Boolean).slice(0, 10)
  for (const k of ['rent', 'deposit', 'holding_deposit', 'room_size_sqm']) if (patch[k] != null) { const n = Number(patch[k]); if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: `${k.replace(/_/g, ' ')} must be a number` }, { status: 400 }); patch[k] = n }
  for (const k of ['bedrooms', 'bathrooms', 'min_term_months', 'max_term_months', 'housemates']) if (patch[k] != null) patch[k] = Math.max(0, Math.round(Number(patch[k]) || 0))
  // rent added or changed: fill in the deposits if they're still blank (5 weeks' and 1 week's rent)
  if (patch.rent != null) {
    const { data: cur } = await s.from('listings').select('deposit, holding_deposit, rent_frequency').eq('id', String(b.id ?? '')).maybeSingle()
    const d = depositsFor(Number(patch.rent), ((patch.rent_frequency as string) || cur?.rent_frequency || 'pcm') as 'pcm' | 'pw')
    if (cur && cur.deposit == null && !('deposit' in patch)) patch.deposit = d.deposit
    if (cur && cur.holding_deposit == null && !('holding_deposit' in patch)) patch.holding_deposit = d.holding_deposit
  }
  const { data, error } = await s.from('listings').update(patch).eq('id', String(b.id ?? '')).select('*').single()
  if (notSetUp(error)) return setup()
  if (error && /housemates/.test(error.message)) return NextResponse.json({ error: 'Saving who lives there needs migration 274 running in Supabase first.' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(await full(s, data))
}
