'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';
import LettingsViewingNotifyModal from '@/app/components/LettingsViewingNotifyModal';

interface Viewing {
  id: string;
  room_id: string;
  property_id: string;
  viewing_date: string;
  viewing_slot: string | null;
  viewing_status: string | null;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  feedback: string | null;
  rooms?: { name: string } | null;
}

interface DayInfo {
  iso: string;
  date: Date;
  viewingCount: number;
}

const statusStyle = (status: string | null) => {
  switch (status) {
    case 'scheduled':
    case 'pending':
      return 'bg-blue-100 text-blue-700';
    case 'interested':
    case 'completed':
      return 'bg-green-100 text-green-700';
    case 'not_interested':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-neutral-200 text-neutral-700';
  }
};

// Helper to generate next 7 days
function getNextSevenDays(): DayInfo[] {
  const days: DayInfo[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    days.push({
      iso: date.toISOString().split('T')[0],
      date: new Date(date),
      viewingCount: 0
    });
  }
  return days;
}

export default function ViewingsDiary() {
  const router = useRouter();
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Viewing | null>(null);
  const [notifying, setNotifying] = useState<Viewing | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [form, setForm] = useState({
    viewing_date: '',
    viewing_slot: '',
    visitor_name: '',
    visitor_email: '',
    visitor_phone: '',
    feedback: '',
  });
  const [banner, setBanner] = useState<string | null>(null);
  const [days, setDays] = useState<DayInfo[]>(getNextSevenDays());

  async function loadViewings() {
    const supabase = createClient();
    const { data: viewingsData } = await supabase
      .from('viewings')
      .select('*, rooms(name)')
      .order('viewing_date');
    setViewings(viewingsData || []);

    // Count viewings per day
    const updatedDays = getNextSevenDays();
    if (viewingsData) {
      updatedDays.forEach(day => {
        day.viewingCount = viewingsData.filter(v => v.viewing_date === day.iso).length;
      });
    }
    setDays(updatedDays);
  }

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      const role = data?.assignment?.role;
      if (!data || !['lettings', 'administrator', 'admin'].includes(role)) {
        router.push('/login');
        return;
      }
      await loadViewings();
      setLoading(false);
    }
    init();
  }, [router]);

  function openEdit(v: Viewing) {
    setEditing(v);
    setForm({
      viewing_date: v.viewing_date ?? '',
      viewing_slot: v.viewing_slot ?? '',
      visitor_name: v.visitor_name ?? '',
      visitor_email: v.visitor_email ?? '',
      visitor_phone: v.visitor_phone ?? '',
      feedback: v.feedback ?? '',
    });
  }

  async function handleSave() {
    if (!editing) return;
    if (!form.viewing_date) {
      setBanner('A date is required');
      return;
    }
    setSaving(true);
    try {
      // Mutate via the browser Supabase client so the logged-in session
      // satisfies RLS (the anon client in an API route has no session).
      const supabase = createClient();
      const { error } = await supabase
        .from('viewings')
        .update({
          viewing_date: form.viewing_date,
          viewing_slot: form.viewing_slot || null,
          visitor_name: form.visitor_name || null,
          visitor_email: form.visitor_email || null,
          visitor_phone: form.visitor_phone || null,
          feedback: form.feedback || null,
        })
        .eq('id', editing.id);
      if (error) throw new Error(error.message);

      const dateChanged = editing.viewing_date !== form.viewing_date;
      const timeChanged = (editing.viewing_slot ?? '') !== form.viewing_slot;
      setEditing(null);
      await loadViewings();
      setBanner(
        dateChanged || timeChanged
          ? 'Viewing updated — remember to let the applicant know the new time.'
          : 'Viewing updated.'
      );
      setTimeout(() => setBanner(null), 5000);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <GenericPageSkeleton />;

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={<BackButton href="/lettings" />}
      />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Viewing Diary</h1>
          <p className="mt-sm text-neutral-600">Manage all property viewings — click a day to see that day's viewings, then tap one to amend the date, time or visitor.</p>
        </div>

        {banner && (
          <div className="mb-lg rounded-xl border border-blue-200 bg-blue-50 px-lg py-md text-sm font-medium text-blue-800">
            {banner}
          </div>
        )}

        {/* Week view strip */}
        <div className="mb-3xl grid grid-cols-7 gap-sm">
          {days.map((day) => (
            <button
              key={day.iso}
              onClick={() => setExpandedDay(expandedDay === day.iso ? null : day.iso)}
              className={`p-md rounded-lg text-center transition ${
                expandedDay === day.iso
                  ? 'bg-neutral-900 text-white border-2 border-neutral-900'
                  : day.viewingCount > 0
                  ? 'bg-blue-50 border-2 border-blue-200 text-blue-900'
                  : 'bg-neutral-50 border-2 border-neutral-200 text-neutral-600'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wide">
                {day.date.toLocaleDateString('en-GB', { weekday: 'short' })}
              </p>
              <p className="text-lg font-bold mt-xs">
                {day.date.getDate()}
              </p>
              {day.viewingCount > 0 && (
                <p className="text-xs mt-sm font-semibold">
                  {day.viewingCount} {day.viewingCount === 1 ? 'viewing' : 'viewings'}
                </p>
              )}
            </button>
          ))}
        </div>

        {viewings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No viewings scheduled</p>
          </div>
        ) : (
          <div className="space-y-md">
            {(expandedDay ? viewings.filter(v => v.viewing_date === expandedDay) : viewings).map((viewing) => (
              <div
                key={viewing.id}
                role="button"
                tabIndex={0}
                onClick={() => openEdit(viewing)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(viewing); } }}
                className="w-full cursor-pointer text-left rounded-2xl border-2 border-neutral-950 bg-neutral-900 p-lg text-white hover:border-blue-500 transition"
              >
                <div className="flex items-start justify-between gap-md">
                  <div>
                    <p className="font-bold text-white">
                      {new Date(viewing.viewing_date).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                    {viewing.viewing_slot && (
                      <p className="text-sm text-white/60 mt-xs">{viewing.viewing_slot}</p>
                    )}
                    <p className="font-semibold text-white mt-md">{viewing.rooms?.name || 'Whole property'}</p>
                    {viewing.visitor_name && (
                      <p className="text-sm text-white/70 mt-sm">👤 {viewing.visitor_name}</p>
                    )}
                    {viewing.visitor_email && (
                      <p className="text-sm text-white/70">✉️ {viewing.visitor_email}</p>
                    )}
                    {viewing.visitor_phone && (
                      <p className="text-sm text-white/70">📞 {viewing.visitor_phone}</p>
                    )}
                    {viewing.feedback && (
                      <p className="text-sm text-white/60 mt-sm italic">&ldquo;{viewing.feedback}&rdquo;</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-sm">
                    <span className={`px-md py-xs text-xs font-semibold rounded-full text-center ${statusStyle(viewing.viewing_status)}`}>
                      {viewing.viewing_status || 'scheduled'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setNotifying(viewing); }}
                      className="rounded-full border border-white/30 px-md py-xs text-xs font-semibold text-white hover:bg-white/10 whitespace-nowrap"
                    >
                      🔔 Notify house
                    </button>
                    <span className="text-xs font-semibold text-white/50">Edit ›</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Notify-the-house modal */}
      {notifying && (
        <LettingsViewingNotifyModal
          viewing={{
            id: notifying.id,
            property_id: notifying.property_id,
            viewing_date: notifying.viewing_date,
            viewing_slot: notifying.viewing_slot,
          }}
          onClose={() => setNotifying(null)}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-lg" onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-xl font-bold text-neutral-900">Amend viewing</h2>
              <button onClick={() => !saving && setEditing(null)} className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none">×</button>
            </div>

            <div className="space-y-md">
              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs">Date</label>
                  <input
                    type="date"
                    value={form.viewing_date}
                    onChange={(e) => setForm({ ...form, viewing_date: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs">Time / slot</label>
                  <input
                    type="text"
                    value={form.viewing_slot}
                    placeholder="e.g. 10:00 or 12-15"
                    onChange={(e) => setForm({ ...form, viewing_slot: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-xs">Visitor name</label>
                <input
                  type="text"
                  value={form.visitor_name}
                  onChange={(e) => setForm({ ...form, visitor_name: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs">Email</label>
                  <input
                    type="email"
                    value={form.visitor_email}
                    onChange={(e) => setForm({ ...form, visitor_email: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-xs">Phone</label>
                  <input
                    type="tel"
                    value={form.visitor_phone}
                    onChange={(e) => setForm({ ...form, visitor_phone: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-xs">Notes / feedback</label>
                <textarea
                  value={form.feedback}
                  rows={2}
                  onChange={(e) => setForm({ ...form, feedback: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div className="mt-lg flex gap-md">
              <button
                onClick={() => setEditing(null)}
                disabled={saving}
                className="flex-1 rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
