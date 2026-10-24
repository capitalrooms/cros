'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';
import { repairTarget, canReopen, REOPEN_REASONS, REOPEN_DAYS, type ReopenReason } from '@/lib/repairs/targets';

interface Request {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  priority: string;
  status: string;
  booked_date: string | null;
  booked_slot: string | null;
  created_at: string;
  completed_at: string | null;
  rooms: { name: string } | null;
}

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  reported: { badge: 'bg-amber-100 text-amber-700', label: 'Awaiting review' },
  assigned: { badge: 'bg-blue-100 text-blue-700', label: 'Approved & scheduled' },
  in_progress: { badge: 'bg-indigo-100 text-indigo-700', label: 'Work in progress' },
  completed: { badge: 'bg-green-100 text-green-700', label: 'Completed' },
};

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(slot: string | null) {
  if (!slot) return null;
  // Assuming slot format is something like "9-12" or similar from TIME_SLOTS
  return slot;
}

export default function TenantRequests() {
  const router = useRouter();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'scheduled' | 'completed'>('all');
  // reopening a finished repair (21 Oct 2026)
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState<ReopenReason | ''>('');
  const [reopenNote, setReopenNote] = useState('');
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenMsg, setReopenMsg] = useState<Record<string, string>>({});

  async function sendReopen(id: string) {
    if (!reopenReason) return;
    setReopenBusy(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/tenant/reopen-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ ticketId: id, reason: reopenReason, note: reopenNote }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setReopenMsg(m => ({ ...m, [id]: j.error || 'That didn’t go through — please try again' })); return; }
      setRequests(rs => rs.map(r => r.id === id ? { ...r, status: j.backToContractor ? 'assigned' : 'reported', completed_at: null, booked_date: null, reopened_at: new Date().toISOString(), reopen_reason: reopenReason } as any : r));
      setReopenMsg(m => ({ ...m, [id]: j.backToContractor ? 'Reopened — it’s gone straight back to the contractor, who’ll be in touch to arrange a time.' : 'Reopened — we’ll arrange someone and let you know.' }));
      setReopenId(null); setReopenReason(''); setReopenNote('');
    } finally { setReopenBusy(false); }
  }

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login');
        return;
      }

      const supabase = createClient();
      const { data: reqs } = await supabase
        .from('maintenance_tickets')
        .select('*, rooms(name)')
        .eq('reporter_id', data.user.id)
        .order('created_at', { ascending: false });

      setRequests(reqs || []);
      setLoading(false);
    }
    init();
  }, [router]);

  const filtered = requests.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return r.status === 'reported';
    if (filter === 'scheduled') return (r.status === 'assigned' || r.status === 'in_progress') && r.booked_date;
    if (filter === 'completed') return r.status === 'completed';
    return true;
  });

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === 'reported').length,
    scheduled: requests.filter((r) => (r.status === 'assigned' || r.status === 'in_progress') && r.booked_date).length,
    completed: requests.filter((r) => r.status === 'completed').length,
  };

  if (loading) {
    return <GenericPageSkeleton />
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        left={<BackButton href="/tenant" label="Home" />}
      />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        {/* Header */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Your requests</h1>
          <p className="mt-sm text-neutral-600">Track all maintenance requests you've submitted</p>
        </div>

        {/* Filter Buttons */}
        <div className="mb-lg flex gap-sm overflow-x-auto pb-sm">
          {(['all', 'pending', 'scheduled', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-xl px-md py-sm text-sm font-semibold transition-all ${
                filter === f
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-700 hover:border-neutral-400'
              }`}
            >
              {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : f === 'scheduled' ? 'Scheduled' : 'Completed'} ({counts[f]})
            </button>
          ))}
        </div>

        {/* Requests List */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">
              {filter === 'all'
                ? 'No requests yet. Report an issue to get started!'
                : `No ${filter} requests`}
            </p>
            {filter === 'all' && (
              <Link
                href="/tenant/maintenance"
                className="mt-md inline-block rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
              >
                Report an issue
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-md">
            {filtered.map((request) => {
              const statusStyle = STATUS_STYLES[request.status] || STATUS_STYLES.reported;
              const isUpcoming =
                request.booked_date &&
                request.booked_date >= todayISO() &&
                (request.status === 'assigned' || request.status === 'in_progress');
              // a visit date that has gone by without the job being finished isn't "scheduled" any more
              const visitPassed = !!request.booked_date && request.booked_date < todayISO() && !request.completed_at && ['assigned', 'in_progress', 'booked'].includes(request.status);

              return (
                <div
                  key={request.id}
                  className={`rounded-2xl border-2 p-lg transition-all ${
                    isUpcoming
                      ? 'border-neutral-900 bg-white shadow-md'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-md">
                    <div className="flex-1">
                      <div className="flex items-center gap-md">
                        <h3 className="text-lg font-bold text-neutral-900">{request.title}</h3>
                        <span className={`text-xs font-semibold px-md py-xs rounded-full ${visitPassed ? 'bg-amber-100 text-amber-800' : statusStyle.badge}`}>
                          {visitPassed ? 'Visit date passed' : statusStyle.label}
                        </span>
                      </div>

                      {(() => { const stem = String(request.title ?? '').replace(/(\.\.\.|…)$/, '').trim(); const d = String(request.description ?? '');
                        return d && !(stem && d.startsWith(stem) && d.length <= stem.length + 3) ? <p className="mt-sm text-sm text-neutral-600">{d}</p> : null })()}

                      <div className="mt-md space-y-xs text-sm text-neutral-600">
                        <p>
                          <span className="font-semibold">Category:</span> {String(request.category).replace(/-/g, ' ')}
                        </p>
                        <p>
                          <span className="font-semibold">Location:</span> {/* where the problem is — the kitchen, a bathroom — not always their own room (21 Oct 2026) */}{request.location && !/my room|bedroom/i.test(request.location) ? request.location : request.rooms?.name || request.location || '—'}
                        </p>
                        <p>
                          <span className="font-semibold">Reported:</span> {formatDate(request.created_at)}
                        </p>
                      </div>

                      {/* Booking Info */}
                      {request.booked_date && (
                        <div className="mt-md rounded-xl bg-neutral-50 p-md border border-neutral-200">
                          <p className="text-xs font-semibold uppercase text-neutral-500 mb-xs">{visitPassed ? 'Was booked for' : 'Scheduled for'}</p>
                          <p className="text-base font-bold text-neutral-900">
                            {formatDate(request.booked_date)}
                            {request.booked_slot && ` · ${formatTime(request.booked_slot)}`}
                          </p>
                          {visitPassed && <p className="mt-xs text-xs text-neutral-500">We&apos;re checking whether the visit went ahead and will let you know what happens next.</p>}
                        </div>
                      )}

                      {/* how long we've said it can take (lib/repairs/targets) */}
                      {request.status !== 'completed' && request.status !== 'cancelled' && (() => {
                        const target = repairTarget(request as any);
                        // a target that has gone by is said plainly — not "we aim to have it fixed by" a date in the past
                        const late = target.by < todayISO();
                        return target.tier !== 'emergency' && (
                          <p className={`mt-md text-xs ${late ? 'font-semibold text-amber-800' : 'text-neutral-600'}`}><span className="font-semibold text-neutral-800">{target.label} repair</span> · {late ? `overdue — we aimed to have it fixed by ${target.byText}. Tell us in the inbox if it’s still a problem.` : `we aim to have it fixed by ${target.byText}`}</p>
                        );
                      })()}
                      {(request as any).reopened_at && request.status !== 'completed' && (
                        <p className="mt-sm inline-block rounded-full bg-amber-100 px-md py-xs text-xs font-semibold text-amber-800">Reopened — back with the contractor</p>
                      )}
                      {reopenMsg[request.id] && <p className="mt-sm text-sm font-semibold text-neutral-800">{reopenMsg[request.id]}</p>}

                      {/* Completed Info — and reopen it if it isn't sorted */}
                      {request.completed_at && (
                        <div className="mt-md rounded-xl bg-green-50 p-md border border-green-200">
                          <p className="text-xs font-semibold uppercase text-green-700 mb-xs">Completed</p>
                          <p className="text-base font-bold text-green-900">{formatDate(request.completed_at)}</p>
                          {canReopen(request as any) && reopenId !== request.id && (
                            <button type="button" onClick={() => { setReopenId(request.id); setReopenReason(''); setReopenNote('') }}
                              className="mt-sm text-sm font-semibold text-green-900 underline">Not sorted? Reopen it</button>
                          )}
                          {reopenId === request.id && (
                            <div className="mt-md space-y-sm rounded-xl bg-white p-md">
                              <p className="text-sm font-bold text-neutral-900">Why does it need looking at again?</p>
                              {(Object.entries(REOPEN_REASONS) as [ReopenReason, string][]).map(([k, label]) => (
                                <label key={k} className={`flex cursor-pointer items-center gap-sm rounded-lg border px-md py-sm text-sm ${reopenReason === k ? 'border-neutral-900 bg-neutral-50 font-semibold' : 'border-neutral-200'}`}>
                                  <input type="radio" name={`reopen-${request.id}`} checked={reopenReason === k} onChange={() => setReopenReason(k)} className="accent-neutral-900" /> {label}
                                </label>
                              ))}
                              <textarea rows={2} value={reopenNote} onChange={e => setReopenNote(e.target.value)}
                                placeholder={reopenReason === 'more_needed' ? 'What else needs doing?' : 'Anything that helps the contractor (optional)'}
                                className="w-full resize-none rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                              <div className="flex gap-sm">
                                <button type="button" disabled={!reopenReason || reopenBusy || (reopenReason === 'more_needed' && !reopenNote.trim())} onClick={() => sendReopen(request.id)}
                                  className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{reopenBusy ? 'Sending…' : 'Reopen and send back'}</button>
                                <button type="button" onClick={() => setReopenId(null)} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-700">Cancel</button>
                              </div>
                              <p className="text-xs text-neutral-500">It goes straight back to the contractor who did it, and we&apos;re told too. You can reopen a repair for {REOPEN_DAYS} days after it&apos;s finished.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action Button */}
        <div className="mt-3xl text-center">
          <Link
            href="/tenant/maintenance"
            className="inline-block rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
          >
            Report new issue
          </Link>
        </div>
      </main>
    </div>
  );
}
