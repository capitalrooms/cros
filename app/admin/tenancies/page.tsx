'use client';
import Link from 'next/link';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';
import { sortPropertiesNumerically, houseNumber } from '@/lib/sortProperties';
import { buildPaymentRef } from '@/lib/tenancy/paymentRef';

interface Property { id: string; name: string; address: string }
interface Room { id: string; name: string; property_id: string; status: string }

interface Tenancy {
  id: string;
  person_id: string;
  room_id: string;
  property_id: string;
  start_date: string;
  end_date: string | null;
  rent_amount: number;
  deposit_amount?: number | null;
  agreement_type?: string | null;
  notice_received_date?: string | null;
  communication_preference?: string;
  opt_in_maintenance?: boolean;
  opt_in_viewings?: boolean;
  opt_in_appointments?: boolean;
  opt_in_cleaning?: boolean;
  people?: { id: string; full_name: string; first_name: string; last_name: string; email: string; phone: string };
  rooms?: { id: string; name: string };
  properties?: Property;
}

interface PersonHit { id: string; full_name: string; first_name: string; last_name: string; email: string; phone: string }

const AGREEMENT_TYPES = [
  { value: 'assured_periodic', label: 'Assured Periodic Tenancy' },
  { value: 'fixed_term',       label: 'Fixed Term Assured Shorthold' },
  { value: 'company_let',      label: 'Company Let' },
  { value: 'licence',          label: 'Licence Agreement' },
  { value: 'room_licence',     label: 'Room Licence' },
];

export default function TenanciesManagementPage() {
  const router = useRouter();
  const [properties, setProperties]   = useState<Property[]>([]);
  const [rooms, setRooms]             = useState<Room[]>([]);
  const [tenancies, setTenancies]     = useState<Tenancy[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [toast, setToast]             = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [noticeTenancy, setNoticeTenancy] = useState<Tenancy | null>(null);
  const [noticeDate, setNoticeDate]   = useState('');
  const [savingNotice, setSavingNotice] = useState(false);
  const [view, setView] = useState<'all' | 'let_agreed' | 'live' | 'notice' | 'ended'>('all');   // All current · Let agreed · Live · On notice · Ended
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<string | null>(null);   // the row whose ⋯ menu is open
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-row-menu]')) setMenu(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  // ── Add form state ──────────────────────────────────────────────────────────
  const [selProp, setSelProp]         = useState('');
  const [selRoom, setSelRoom]         = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [personHits, setPersonHits]   = useState<PersonHit[]>([]);
  const [linkedPerson, setLinkedPerson] = useState<PersonHit | null>(null);
  const [firstName, setFirstName]     = useState('');
  const [lastName, setLastName]       = useState('');
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [startDate, setStartDate]     = useState(new Date().toISOString().split('T')[0]);
  const [rent, setRent]               = useState('');
  const [deposit, setDeposit]         = useState('');
  const [agreementType, setAgreementType] = useState('assured_periodic');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || !['administrator', 'admin', 'lettings'].includes(data.assignment?.role ?? '')) {
        router.push('/login'); return;
      }
      await loadData();
    }
    init();
  }, [router]);

  async function loadData() {
    const supabase = createClient();
    const [{ data: propsData }, { data: roomsData }, { data: tenData }] = await Promise.all([
      supabase.from('properties').select('id, name, address').order('name'),
      supabase.from('rooms').select('id, name, property_id, status').order('name'),
      supabase.from('tenancies').select(
        '*, people!person_id(id, full_name, first_name, last_name, email, phone), rooms(id, name, status), properties(id, name, address)'
      ).order('start_date', { ascending: false }),
    ]);
    setProperties(sortPropertiesNumerically(propsData || []));
    setRooms(roomsData || []);
    setTenancies((tenData as Tenancy[]) || []);
    setLoading(false);
  }

  // ── Existing-person search ──────────────────────────────────────────────────
  function onPersonSearch(q: string) {
    setPersonSearch(q);
    setLinkedPerson(null);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (q.length < 2) { setPersonHits([]); return; }
    searchRef.current = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.from('people')
        .select('id, full_name, first_name, last_name, email, phone')
        .or(`full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .in('role', ['tenant', 'applicant'])
        .limit(6);
      setPersonHits(data || []);
    }, 300);
  }

  function pickPerson(p: PersonHit) {
    setLinkedPerson(p);
    setFirstName(p.first_name || '');
    setLastName(p.last_name || '');
    setEmail(p.email || '');
    setPhone(p.phone || '');
    setPersonSearch('');
    setPersonHits([]);
  }

  function resetForm() {
    setSelProp(''); setSelRoom(''); setPersonSearch(''); setPersonHits([]);
    setLinkedPerson(null); setFirstName(''); setLastName(''); setEmail('');
    setPhone(''); setStartDate(new Date().toISOString().split('T')[0]);
    setRent(''); setDeposit(''); setAgreementType('assured_periodic');
  }

  async function handleCreate() {
    if (!selRoom || !firstName || !email) {
      showToast('Room, first name and email are required', 'error'); return;
    }
    try {
      const supabase = createClient();
      let personId = linkedPerson?.id || '';

      if (!personId) {
        const { data: existing } = await supabase.from('people')
          .select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
        if (existing) {
          personId = existing.id;
          await supabase.from('people').update({
            first_name: firstName, last_name: lastName, phone,
            full_name: [firstName, lastName].filter(Boolean).join(' '),
          }).eq('id', personId);
        } else {
          const { data: newP, error: pErr } = await supabase.from('people').insert([{
            first_name: firstName, last_name: lastName, email: email.trim().toLowerCase(),
            phone, role: 'tenant',
            full_name: [firstName, lastName].filter(Boolean).join(' '),
          }]).select().single();
          if (pErr) throw pErr;
          personId = newP.id;
        }
      }

      const { error } = await supabase.from('tenancies').insert([{
        person_id: personId, room_id: selRoom,
        property_id: rooms.find(r => r.id === selRoom)?.property_id ?? selProp,
        // the bank import matches rent on this reference, so every new tenancy gets one
        payment_reference: (() => { const rm = rooms.find(r => r.id === selRoom); const pr = properties.find(p => p.id === (rm?.property_id ?? selProp)); return pr?.name && rm ? buildPaymentRef(pr.name, rm.name) : null })(),
        start_date: startDate,
        rent_amount: rent ? Number(rent) : 0,
        deposit_amount: deposit ? Number(deposit) : null,
        agreement_type: agreementType,
      }]);
      if (error) throw error;

      await loadData();
      setShowAdd(false); resetForm();
      showToast('Tenancy created');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create tenancy', 'error');
    }
  }

  async function handleSetNotice() {
    if (!noticeTenancy || !noticeDate) return;
    setSavingNotice(true);
    try {
      const supabase = createClient();
      await supabase.from('tenancies').update({ end_date: noticeDate, notice_received_date: new Date().toISOString().split('T')[0] }).eq('id', noticeTenancy.id);
      // the room shows as on notice (and appears in Available Rooms) only once notice is recorded
      if (noticeTenancy.room_id) await supabase.from('rooms').update({ status: 'on_notice' }).eq('id', noticeTenancy.room_id);
      setNoticeTenancy(null); setNoticeDate('');
      await loadData();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Could not save', 'error'); }
    finally { setSavingNotice(false); }
  }

  async function handleCancelNotice(t: Tenancy) {
    const supabase = createClient();
    await supabase.from('tenancies').update({ end_date: null, notice_received_date: null }).eq('id', t.id);
    if (t.room_id) await supabase.from('rooms').update({ status: 'occupied' }).eq('id', t.room_id);
    await loadData(); showToast('Notice cancelled');
  }

  // Soft-end: set end_date to today (keeps record for history)
  async function handleEndTenancy(t: Tenancy) {
    if (!confirm(`End tenancy for ${displayName(t)}? The record is kept for history.`)) return;
    const supabase = createClient();
    const endDate = new Date().toISOString().split('T')[0];
    await supabase.from('tenancies').update({ end_date: endDate }).eq('id', t.id);
    await loadData(); showToast('Tenancy ended — record kept in history');
  }

  async function downloadBalanceDemand(tenancyId: string, mode: 'full' | 'prorata') {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string,string> = {};
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/lettings/check-in-balance/${tenancyId}?mode=${mode}`, { headers });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'Check-In-Balance.pdf'; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Could not generate — check rent and deposit are set', 'error'); }
  }

  // on notice = notice recorded (or the room marked on notice by the notice workflow) — never just an end date
  function isOnNotice(t: Tenancy) {
    return !!t.notice_received_date || (t as any).rooms?.status === 'on_notice'
  }

  function displayName(t: Tenancy) {
    const p = t.people;
    if (!p) return 'Unknown tenant';
    return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown';
  }

  if (loading) return <GenericPageSkeleton />;

  const today = new Date().toISOString().slice(0, 10);
  const current = tenancies.filter(t => !t.end_date || t.end_date >= today);
  const letAgreed = current.filter(t => t.start_date > today);
  const onNoticeList = current.filter(t => t.start_date <= today && isOnNotice(t));
  const liveList = current.filter(t => t.start_date <= today && !isOnNotice(t));
  const past   = tenancies.filter(t => !!t.end_date && t.end_date < today);
  const active = view === 'notice' ? onNoticeList : view === 'let_agreed' ? letAgreed : view === 'live' ? liveList : view === 'ended' ? past : current;
  const stageOf = (t: Tenancy) =>
    t.end_date && t.end_date < today ? ((t as any).let_cancelled_at ? { key: 'ended', label: 'Fell through', cls: 'bg-red-50 text-red-700' } : { key: 'ended', label: 'Ended', cls: 'bg-neutral-100 text-neutral-500' })
    : t.start_date > today ? { key: 'let_agreed', label: 'Let agreed', cls: 'bg-blue-50 text-blue-800' }
    : isOnNotice(t) ? { key: 'notice', label: 'On notice', cls: 'bg-amber-50 text-amber-800' }
    : { key: 'live', label: 'Live', cls: 'bg-green-50 text-green-800' };
  const needle = q.trim().toLowerCase();
  // ascending by house number, then room — the same order as All Units; ended ones newest first
  const byAddress = (a: Tenancy, b: Tenancy) => {
    const pa = { name: a.properties?.name, address: a.properties?.address }, pb = { name: b.properties?.name, address: b.properties?.address };
    const ha = houseNumber(pa), hb = houseNumber(pb);
    if (ha != null && hb != null && ha !== hb) return ha - hb;
    return String(pa.name ?? '').localeCompare(String(pb.name ?? ''), undefined, { numeric: true }) || String(a.rooms?.name ?? '').localeCompare(String(b.rooms?.name ?? ''), undefined, { numeric: true });
  };
  const shown = active
    .filter(t => !needle || [displayName(t), t.people?.email, t.rooms?.name, t.properties?.name, t.properties?.address].some(v => String(v ?? '').toLowerCase().includes(needle)))
    .sort(view === 'ended' ? (a, b) => String(b.end_date).localeCompare(String(a.end_date)) : byAddress);
  const shortDay = (iso: string | null | undefined) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—';
  const fileHref = (t: Tenancy) => `/admin/lettings/${t.id}?from=/admin/tenancies`;
  const filteredRooms = selProp ? rooms.filter(r => r.property_id === selProp) : [];

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-[200] px-4 py-3 rounded-xl text-sm font-semibold shadow-lg ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-neutral-900 text-white'
        }`}>{toast.msg}</div>
      )}
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero
        eyebrow="Lettings"
        title="Tenancies"
        subtitle="Every tenancy, from let agreed to moved out. Each row opens its letting file."
        stats={[
          { label: 'Live', value: liveList.length },
          { label: 'Let agreed', value: letAgreed.length, tone: 'info' },
          { label: 'On notice', value: onNoticeList.length, tone: 'warn' },
          { label: 'Ended', value: past.length },
        ]}
        actions={<HeroButton primary onClick={() => setShowAdd(true)}>+ New tenancy</HeroButton>}
        tabs={([['all', `All current · ${current.length}`], ['let_agreed', `Let agreed · ${letAgreed.length}`], ['live', `Live · ${liveList.length}`], ['notice', `On notice · ${onNoticeList.length}`], ['ended', `Ended · ${past.length}`]] as const)
          .map(([k, label]) => ({ key: k, label, active: view === k, onClick: () => { setView(k); setMenu(null) } }))}
      />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-md">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by tenant, email, room or property…"
            className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm" />
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">{q ? 'Nothing matches that search.' : view === 'let_agreed' ? 'No lets agreed right now. Recording a holding deposit in Applicants creates one.' : 'No tenancies here.'}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white">
            <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_120px_100px_120px_88px] gap-md border-b border-neutral-200 px-lg py-sm text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
              <span>Tenant</span><span>Room</span><span>Dates</span><span className="text-right">Rent</span><span>Stage</span><span />
            </div>
            <ul className="divide-y divide-neutral-100">
              {shown.map(t => {
                const st = stageOf(t)
                const ended = view === 'ended'
                return (
                  <li key={t.id} className={`relative grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_120px_100px_120px_88px] items-center gap-x-md gap-y-0.5 px-lg py-sm hover:bg-neutral-50 ${ended ? 'text-neutral-500' : ''}`}>
                    <Link href={fileHref(t)} className="min-w-0 after:absolute after:inset-0 after:content-['']">
                      <span className="block truncate text-sm font-semibold text-neutral-900">{displayName(t)}</span>
                      <span className="block truncate text-xs text-neutral-500">{t.people?.email}</span>
                    </Link>
                    <span className="hidden md:block min-w-0 text-sm">
                      <span className="block truncate font-medium text-neutral-800">{t.rooms?.name}</span>
                      <span className="block truncate text-xs text-neutral-500">{String(t.properties?.name ?? '').split('\n')[0]}</span>
                    </span>
                    <span className="hidden md:block text-xs text-neutral-600 tabular-nums">
                      {st.key === 'let_agreed' ? `From ${shortDay(t.start_date)}` : `Since ${shortDay(t.start_date)}`}
                      {t.end_date && <span className="block">{st.key === 'ended' ? 'Ended' : 'Out'} {shortDay(t.end_date)}</span>}
                    </span>
                    <span className="hidden md:block text-right text-sm tabular-nums text-neutral-800">£{Number(t.rent_amount || 0).toLocaleString('en-GB')}</span>
                    <span className="hidden md:block"><span className={`inline-block rounded-full px-sm py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span></span>
                    <span data-row-menu className="relative z-10 flex items-center justify-end gap-xs">
                      <span className={`md:hidden rounded-full px-sm py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                      <button type="button" aria-label="More actions" onClick={() => setMenu(menu === t.id ? null : t.id)}
                        className="rounded-lg px-sm py-xs text-lg leading-none text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900">⋯</button>
                      {menu === t.id && (
                        <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white py-xs text-sm shadow-lg">
                          <Link href={fileHref(t)} className="block px-md py-xs font-semibold text-neutral-900 hover:bg-neutral-50">Open letting file</Link>
                          {!ended && <>
                            <Link href={`/admin/move-in/${t.id}`} className="block px-md py-xs hover:bg-neutral-50">Move-in pack</Link>
                            <button type="button" onClick={() => { setMenu(null); downloadBalanceDemand(t.id, 'full') }} className="block w-full px-md py-xs text-left hover:bg-neutral-50">Balance demand · full month</button>
                            <button type="button" onClick={() => { setMenu(null); downloadBalanceDemand(t.id, 'prorata') }} className="block w-full px-md py-xs text-left hover:bg-neutral-50">Balance demand · pro-rata</button>
                            {isOnNotice(t)
                              ? <button type="button" onClick={() => { setMenu(null); handleCancelNotice(t) }} className="block w-full px-md py-xs text-left hover:bg-neutral-50">Cancel notice</button>
                              : st.key !== 'let_agreed' && <Link href={`/admin/properties/${t.property_id}?tab=units&room=${t.room_id}`} className="block px-md py-xs hover:bg-neutral-50">Record notice (opens the room)</Link>}
                            {st.key !== 'let_agreed' && <Link href={`/admin/rent-increase/${t.id}`} className="block px-md py-xs hover:bg-neutral-50">Rent review</Link>}
                            <button type="button" onClick={() => { setMenu(null); handleEndTenancy(t) }} className="block w-full border-t border-neutral-100 px-md py-xs text-left text-red-700 hover:bg-red-50">End tenancy</button>
                          </>}
                        </div>
                      )}
                    </span>
                    <span className="col-span-2 md:hidden text-xs text-neutral-500 truncate">{t.rooms?.name} · {String(t.properties?.name ?? '').split('\n')[0]} · £{Number(t.rent_amount || 0).toLocaleString('en-GB')} · {st.key === 'let_agreed' ? 'from' : 'since'} {shortDay(t.start_date)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </main>

      {/* ── Add Tenancy Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
          <div className="rounded-2xl bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 pt-5 pb-4 z-10">
              <h2 className="text-lg font-bold text-neutral-900">New Tenancy</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Link a room, tenant, and agreement details</p>
            </div>
            <div className="px-6 py-5 space-y-5">

              {/* 1. Room */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">1 — Room</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Property *</label>
                    <select value={selProp} onChange={e => { setSelProp(e.target.value); setSelRoom(''); }}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm">
                      <option value="">Choose…</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Room *</label>
                    <select value={selRoom} onChange={e => setSelRoom(e.target.value)}
                      disabled={!selProp}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-40">
                      <option value="">Choose…</option>
                      {filteredRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Tenant */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">2 — Tenant</p>
                {/* Existing person search */}
                <div className="relative mb-3">
                  <input type="text" placeholder="Search existing people by name or email…"
                    value={linkedPerson ? `${linkedPerson.first_name} ${linkedPerson.last_name} (${linkedPerson.email})` : personSearch}
                    onChange={e => { if (linkedPerson) setLinkedPerson(null); onPersonSearch(e.target.value); }}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                  {linkedPerson && (
                    <button onClick={() => { setLinkedPerson(null); setPersonSearch(''); setFirstName(''); setLastName(''); setEmail(''); setPhone(''); }}
                      className="absolute right-2 top-2 text-neutral-400 hover:text-red-500 text-xs">✕ clear</button>
                  )}
                  {personHits.length > 0 && !linkedPerson && (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden">
                      {personHits.map(p => (
                        <button key={p.id} onClick={() => pickPerson(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b border-neutral-100 last:border-0">
                          <span className="font-medium">{p.first_name} {p.last_name}</span>
                          <span className="text-neutral-400 text-xs ml-2">{p.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">First name *</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Last name</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Email *</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Phone</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              {/* 3. Tenancy details */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">3 — Tenancy Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Start date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Agreement type</label>
                    <select value={agreementType} onChange={e => setAgreementType(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm">
                      {AGREEMENT_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Rent (£pcm)</label>
                    <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="0"
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Deposit (£)</label>
                    <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="0"
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-neutral-100">
                <button onClick={handleCreate}
                  className="flex-1 rounded-xl bg-neutral-900 py-3 font-bold text-white text-sm hover:bg-neutral-800">
                  Create Tenancy
                </button>
                <button onClick={() => { setShowAdd(false); resetForm(); }}
                  className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold text-sm hover:bg-neutral-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Set move-out date dialog ── */}
      {noticeTenancy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-lg font-bold text-neutral-900">Set move-out date</h2>
            <p className="mt-1 text-sm text-neutral-500">{displayName(noticeTenancy)} · {noticeTenancy.rooms?.name}</p>
            <p className="mt-3 text-sm text-neutral-600">
              Once set, the room is marketed as available from this date. The tenancy shows as "On notice" until the tenant leaves.
            </p>
            <label className="mt-4 block text-sm font-medium text-neutral-700">Move-out date</label>
            <input type="date" value={noticeDate} min={new Date().toISOString().split('T')[0]}
              onChange={e => setNoticeDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-300 px-md py-md text-base" />
            <div className="mt-4 flex gap-3">
              <button onClick={handleSetNotice} disabled={savingNotice || !noticeDate}
                className="flex-1 rounded-xl bg-neutral-900 py-3 font-bold text-white hover:bg-neutral-800 disabled:opacity-50">
                {savingNotice ? 'Saving…' : 'Confirm'}
              </button>
              <button onClick={() => setNoticeTenancy(null)}
                className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold hover:bg-neutral-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
