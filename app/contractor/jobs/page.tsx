'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TIME_SLOTS, formatBooking, slotLabel, earliestBookableDate, bookingLeadTimeNote } from '@/lib/booking';
import AppBar from '@/components/AppBar';
import JobMap, { type MapPin } from '@/components/JobMap';

interface Attachment {
  id: string;
  storage_url: string;
  file_name: string;
}

interface Job {
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
  updated_at: string;
  properties: { name: string; address: string; lat: number | null; lng: number | null } | null;
  rooms: { name: string } | null;
}

interface CompletionFormData {
  price: string;
  fixQuality: 'long-term' | 'temporary';
  returnVisitNeeded: boolean;
  returnVisitDate: string;
  returnVisitReason: string;
  aftercareNotes: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-neutral-100 text-neutral-500',
  medium: 'bg-neutral-200 text-neutral-700',
  high: 'bg-neutral-900 text-white',
};

const todayISO = () => new Date().toISOString().split('T')[0];

function dayLabel(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  const isToday = iso === todayISO();
  const tomorrow = new Date(t.getTime() + 86400000).toISOString().split('T')[0];
  if (isToday) return 'Today';
  if (iso === tomorrow) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function ContractorJobs() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [proposedDate, setProposedDate] = useState('');
  const [proposedSlot, setProposedSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<Attachment[]>([]);
  const [rescheduling, setRescheduling] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [completionData, setCompletionData] = useState<CompletionFormData>({
    price: '',
    fixQuality: 'long-term',
    returnVisitNeeded: false,
    returnVisitDate: '',
    returnVisitReason: '',
    aftercareNotes: '',
  });
  const [submittingCompletion, setSubmittingCompletion] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'contractor') router.push('/login');
    }
    checkAuth();
  }, [router]);

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (!selectedJob) {
      setPhotos([]);
      return;
    }
    async function fetchPhotos() {
      const supabase = createClient();
      const { data } = await supabase
        .from('attachments')
        .select('id, storage_url, file_name')
        .eq('ticket_id', selectedJob!.id);
      setPhotos(data || []);
    }
    fetchPhotos();
  }, [selectedJob]);

  async function fetchJobs() {
    try {
      const userData = await getCurrentUser();
      if (!userData) {
        setError('Not authenticated');
        return;
      }
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('maintenance_tickets')
        .select('*, properties(name, address, lat, lng), rooms(name)')
        // Unapproved or held work must never reach a contractor — admin gates
        // every job first. `approved` is a view-level flag, not a status.
        .or(
          `contractor_id.eq.${(userData.assignment as any)?.id},` +
            `and(status.eq.reported,approved_at.not.is.null,on_hold.is.false)`
        )
        .order('booked_date', { ascending: true, nullsFirst: false });

      if (err) throw err;
      setJobs(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  async function acceptJob() {
    if (!selectedJob) return;
    if (!proposedDate || !proposedSlot) {
      setError('Choose a date and a time slot before accepting.');
      return;
    }
    let shortNotice = false;
    // Bedrooms normally need 24h so the tenant can arrange access. Allow an
    // override — a tenant may well say "come today, I'm in" — but make the
    // person booking state that they have that authorisation.
    const earliest = earliestBookableDate(
      selectedJob.rooms?.name ?? selectedJob.location,
      selectedJob.priority
    );
    if (proposedDate < earliest) {
      const authorised = window.confirm(
        `This job is in a bedroom and you're booking less than 24 hours ahead.\n\n` +
          `You must have the tenant's authorisation to attend at this notice.\n\n` +
          `Confirm you have their agreement? The tenant will be asked to approve in writing.`
      );
      if (!authorised) return;
      shortNotice = true;
    }
    const confirmed = window.confirm(
      `Confirm you are definitely free on ${formatBooking(proposedDate, proposedSlot)}.\n\n` +
        `The tenants will be notified of this time.`
    );
    if (!confirmed) return;

    try {
      const userData = await getCurrentUser();
      const supabase = createClient();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({
          contractor_id: (userData?.assignment as any)?.id,
          // Setting a time on work already underway must not knock it back to
          // 'assigned' — only a brand-new job transitions.
          ...(selectedJob.status === 'reported' && { status: 'assigned' }),
          booked_date: proposedDate,
          booked_slot: proposedSlot,
          ...(notes && { notes }),
          // Audit trail: who claimed authorisation, and when. The tenant is
          // then asked to confirm in writing on their dashboard.
          ...(shortNotice && {
            short_notice: true,
            short_notice_asserted_by: (userData?.assignment as any)?.id,
            short_notice_asserted_at: new Date().toISOString(),
          }),
        })
        .eq('id', selectedJob.id);

      if (err) throw err;

      fetch('/api/notify-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: selectedJob.id }),
      }).catch((e) => console.error('Booking notification failed:', e));

      fetchJobs();
      setShowDetails(false);
      setRescheduling(false);
      setProposedDate('');
      setProposedSlot('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept job');
    }
  }

  async function setStatus(status: string) {
    if (!selectedJob) return;
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({ status, ...(status === 'completed' && { completed_at: new Date().toISOString() }) })
        .eq('id', selectedJob.id);
      if (err) throw err;
      fetchJobs();
      if (status === 'completed') setShowDetails(false);
      else setSelectedJob({ ...selectedJob, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    }
  }

  async function handleCompleteJob() {
    if (!selectedJob || !completionData.price) {
      setError('Price is required to complete the job');
      return;
    }

    setSubmittingCompletion(true);
    try {
      const supabase = createClient();

      // Determine final status: if return visit needed, stay in_progress; otherwise completed
      const finalStatus = completionData.returnVisitNeeded ? 'in_progress' : 'completed';

      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({
          status: finalStatus,
          completion_price: parseFloat(completionData.price),
          fix_quality: completionData.fixQuality,
          return_needed: completionData.returnVisitNeeded,
          return_visit_date: completionData.returnVisitNeeded ? completionData.returnVisitDate : null,
          return_visit_reason: completionData.returnVisitNeeded ? completionData.returnVisitReason : null,
          contractor_notes: completionData.aftercareNotes,
          completed_at: finalStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', selectedJob.id);

      if (err) throw err;

      setError('');
      setShowCompleteForm(false);
      setCompletionData({
        price: '',
        fixQuality: 'long-term',
        returnVisitNeeded: false,
        returnVisitDate: '',
        returnVisitReason: '',
        aftercareNotes: '',
      });
      fetchJobs();
      setShowDetails(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete job');
    } finally {
      setSubmittingCompletion(false);
    }
  }

  const available = jobs.filter((j) => j.status === 'reported');
  const mine = jobs.filter((j) => j.status !== 'reported' && j.status !== 'completed');
  const booked = mine.filter((j) => j.booked_date).sort((a, b) => a.booked_date!.localeCompare(b.booked_date!));
  const unscheduled = mine.filter((j) => !j.booked_date);
  const done = jobs
    .filter((j) => j.status === 'completed')
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  const nextJob = booked.find((j) => j.booked_date! >= todayISO()) ?? booked[0];
  const todayCount = booked.filter((j) => j.booked_date === todayISO()).length;

  // Week strip — which of the next 7 days have work on them.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    return { iso, d, count: booked.filter((j) => j.booked_date === iso).length };
  });

  // Group scheduled work by day so dates are structural, not a footnote.
  const byDay = booked.reduce<Record<string, Job[]>>((acc, j) => {
    (acc[j.booked_date!] ||= []).push(j);
    return acc;
  }, {});

  // Only jobs with real coordinates can be pinned.
  const mapPins: MapPin[] = [...booked, ...available]
    .filter((j) => j.properties?.lat != null && j.properties?.lng != null)
    .map((j) => ({
      id: j.id,
      lat: Number(j.properties!.lat),
      lng: Number(j.properties!.lng),
      label: j.properties!.name,
      sublabel: j.booked_date ? slotLabel(j.booked_slot) : 'Available',
      primary: j.id === nextJob?.id,
    }));

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {/* Top bar */}
      <AppBar
        right={
          <Link href="/contractor" className="min-w-0 truncate text-sm font-semibold text-white hover:text-white/80">
            Dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl px-lg">
        {error && (
          <div className="mt-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-900">
            {error}
          </div>
        )}

        {/* Hero — next job, unmissable */}
        <section className="-mb-3xl bg-neutral-900 pb-3xl text-white" style={{ marginInline: '-16px', paddingInline: '16px' }}>
          <p className="pt-lg text-xl font-bold leading-tight text-white">
            {todayCount > 0
              ? `You have ${todayCount} job${todayCount > 1 ? 's' : ''} today`
              : booked.length > 0
                ? 'Nothing today'
                : 'No jobs booked yet'}
          </p>
          {todayCount === 0 && booked.length > 0 && (
            <p className="text-xl font-bold leading-tight text-white/40">Next job below</p>
          )}

          {nextJob ? (
            <div className="mt-md rounded-2xl bg-white p-lg text-neutral-900 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Next job</p>
              <p className="mt-sm text-3xl font-bold leading-tight">
                {dayLabel(nextJob.booked_date!)}
              </p>
              <p className="text-base font-semibold text-neutral-700">
                {slotLabel(nextJob.booked_slot)}
              </p>

              <div className="mt-lg border-t border-neutral-200 pt-md">
                <p className="font-semibold">{nextJob.properties?.name}</p>
                <p className="text-sm text-neutral-600">
                  {nextJob.properties?.address} · {nextJob.rooms?.name || nextJob.location}
                </p>
                <p className="mt-sm text-sm text-neutral-500">{nextJob.title}</p>
              </div>

              <div className="mt-lg flex gap-sm">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${nextJob.properties?.name}, ${nextJob.properties?.address}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-xl bg-neutral-900 py-md text-center text-sm font-semibold text-white"
                >
                  Directions
                </a>
                <button
                  onClick={() => {
                    setSelectedJob(nextJob);
                    setShowDetails(true);
                  }}
                  className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-semibold"
                >
                  View job
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-md rounded-2xl border border-white/15 p-lg text-white/60">
              Accept a job below and it will appear here.
            </div>
          )}

          {/* Week strip */}
          <div className="mt-lg flex gap-xs overflow-x-auto pb-sm">
            {week.map((d) => {
              const isToday = d.iso === todayISO();
              const isOpen = openDay === d.iso;
              return (
                <button
                  key={d.iso}
                  onClick={() => {
                    setOpenDay(isOpen ? null : d.iso);
                    if (!isOpen) {
                      document
                        .getElementById(`day-${d.iso}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className={`min-w-[62px] flex-1 rounded-xl px-sm py-md text-center transition-all ${
                    isOpen
                      ? 'bg-white text-neutral-900 ring-2 ring-white'
                      : isToday
                        ? 'bg-white text-neutral-900'
                        : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <p className="text-xs uppercase tracking-wide opacity-60">
                    {d.d.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </p>
                  <p className="text-base font-bold leading-tight">{d.d.getDate()}</p>
                  <div className="mt-xs flex h-1.5 justify-center gap-0.5">
                    {d.count > 0 ? (
                      Array.from({ length: Math.min(d.count, 3) }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${
                            isToday ? 'bg-neutral-900' : 'bg-neutral-900'
                          }`}
                        />
                      ))
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Available work — framed as opportunity */}
        <section className="mt-3xl pt-lg">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-neutral-900">Available work</h2>
            {available.length > 0 && (
              <span className="rounded-full bg-neutral-900 px-md py-xs text-xs font-bold text-white">
                {available.length} up for grabs
              </span>
            )}
          </div>

          {loading ? (
            <p className="mt-md text-neutral-500">Loading…</p>
          ) : available.length === 0 ? (
            <p className="mt-md rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">
              No new jobs right now. We&apos;ll notify you when something comes in.
            </p>
          ) : (
            <div className="mt-md grid gap-md sm:grid-cols-2">
              {available.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col rounded-2xl border-2 border-neutral-900 bg-white p-lg shadow-sm"
                >
                  <div className="flex items-start justify-between gap-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {job.category}
                    </span>
                    <span
                      className={`rounded-full px-sm py-xs text-xs font-bold uppercase ${PRIORITY_STYLES[job.priority]}`}
                    >
                      {job.priority}
                    </span>
                  </div>

                  <h3 className="mt-sm text-base font-bold leading-snug">{job.title}</h3>
                  <p className="mt-xs text-sm font-medium text-neutral-700">
                    {job.properties?.name}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {job.properties?.address} · {job.rooms?.name || job.location}
                  </p>

                  <button
                    onClick={() => {
                      setSelectedJob(job);
                      setShowDetails(true);
                    }}
                    className="mt-lg w-full rounded-xl bg-neutral-900 py-md text-sm font-bold text-white transition-transform active:scale-[0.98]"
                  >
                    View &amp; accept
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Schedule grouped by day */}
        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Your schedule</h2>

          {booked.length === 0 && unscheduled.length === 0 ? (
            <p className="mt-md rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">
              Nothing booked in yet.
            </p>
          ) : (
            <div className="mt-md space-y-lg">
              {Object.entries(byDay).map(([date, items]) => (
                <div
                  key={date}
                  id={`day-${date}`}
                  className={`rounded-2xl transition-all ${
                    openDay === date ? 'bg-white p-md shadow-md ring-2 ring-neutral-900' : ''
                  }`}
                >
                  <button
                    onClick={() => setOpenDay(openDay === date ? null : date)}
                    className="mb-sm flex w-full items-baseline gap-sm text-left"
                  >
                    <h3 className="text-base font-bold text-neutral-900">{dayLabel(date)}</h3>
                    <span className="text-sm text-neutral-400">
                      {items.length} job{items.length > 1 ? 's' : ''}
                    </span>
                    <span className="ml-auto text-xs text-neutral-400">
                      {openDay === date ? 'Hide' : 'Show day'}
                    </span>
                  </button>

                  {/* Day-at-a-glance: which slots are taken, which are free. */}
                  {openDay === date && (
                    <div className="mb-md grid grid-cols-3 gap-sm">
                      {TIME_SLOTS.map((slot) => {
                        const inSlot = items.filter((j) => j.booked_slot === slot.value);
                        return (
                          <div
                            key={slot.value}
                            className={`rounded-xl border p-sm text-center ${
                              inSlot.length
                                ? 'border-neutral-900 bg-neutral-900 text-white'
                                : 'border-dashed border-neutral-300 text-neutral-400'
                            }`}
                          >
                            <p className="text-xs font-semibold">{slot.label}</p>
                            <p className="mt-xs text-xs opacity-70">
                              {inSlot.length
                                ? inSlot.map((j) => j.properties?.name).join(', ')
                                : 'Free'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-sm">
                    {items.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => {
                          setSelectedJob(job);
                          setShowDetails(true);
                        }}
                        className="flex w-full items-center gap-md rounded-2xl border border-neutral-200 bg-white p-md text-left hover:border-neutral-400"
                      >
                        <div className="w-[92px] shrink-0 border-r border-neutral-200 pr-md">
                          <p className="text-sm font-bold leading-tight text-neutral-900">
                            {slotLabel(job.booked_slot)}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-neutral-900">{job.title}</p>
                          <p className="truncate text-sm text-neutral-500">
                            {job.properties?.name} · {job.rooms?.name || job.location}
                          </p>
                        </div>
                        {job.status === 'in_progress' && (
                          <span className="shrink-0 rounded-full bg-neutral-900 px-sm py-xs text-xs font-bold uppercase text-white">
                            Started
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {unscheduled.length > 0 && (
                <div>
                  <h3 className="mb-sm text-base font-bold text-neutral-900">Needs a time</h3>
                  <div className="space-y-sm">
                    {unscheduled.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => {
                          setSelectedJob(job);
                          setShowDetails(true);
                        }}
                        className="w-full rounded-2xl border-2 border-dashed border-neutral-400 bg-white p-md text-left"
                      >
                        <p className="font-semibold">{job.title}</p>
                        <p className="text-sm text-neutral-600">
                          {job.properties?.name} · {job.rooms?.name || job.location}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Completed — reviewable after the fact */}
        {done.length > 0 && (
          <section className="mt-3xl">
            <h2 className="text-xl font-bold text-neutral-900">Completed</h2>
            <div className="mt-md space-y-sm">
              {done.map((job) => (
                <button
                  key={job.id}
                  onClick={() => {
                    setSelectedJob(job);
                    setShowDetails(true);
                  }}
                  className="flex w-full items-center gap-md rounded-2xl border border-neutral-200 bg-white p-md text-left hover:border-neutral-400"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-900">{job.title}</p>
                    <p className="truncate text-sm text-neutral-500">
                      {job.properties?.name} · {job.rooms?.name || job.location}
                      {job.completed_at ? ` · ${new Date(job.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-green-100 px-sm py-xs text-xs font-bold text-green-800">
                    Done
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Where the work is */}
        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900">Where your jobs are</h2>
          <div className="mt-md">
            <JobMap pins={mapPins} height={300} />
            <p className="mt-sm text-xs text-neutral-500">
              {mapPins.length > 0
                ? `${mapPins.length} location${mapPins.length > 1 ? 's' : ''} · filled pin is your next job`
                : 'Locations appear here once jobs have addresses on file.'}
            </p>
          </div>
        </section>
      </main>

      {/* Detail sheet */}
      {showDetails && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-lg sm:rounded-3xl">
            <div className="mb-md flex items-start justify-between gap-md">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {selectedJob.category}
                </p>
                <h2 className="mt-xs text-xl font-bold leading-tight">{selectedJob.title}</h2>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="shrink-0 rounded-full bg-neutral-100 px-md py-sm text-sm"
              >
                Close
              </button>
            </div>

            {selectedJob.booked_date && (
              <div className="mb-md rounded-2xl bg-neutral-900 p-lg text-white">
                <p className="text-xs uppercase tracking-widest text-white/50">Booked for</p>
                <p className="mt-xs text-xl font-bold">{dayLabel(selectedJob.booked_date)}</p>
                <p className="text-base text-white/80">{slotLabel(selectedJob.booked_slot)}</p>
              </div>
            )}

            <div className="rounded-2xl bg-neutral-50 p-md">
              <p className="font-semibold">{selectedJob.properties?.name}</p>
              <p className="text-sm text-neutral-600">{selectedJob.properties?.address}</p>
              <p className="text-sm text-neutral-600">
                {selectedJob.rooms?.name || selectedJob.location}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${selectedJob.properties?.name}, ${selectedJob.properties?.address}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-sm inline-block text-sm font-semibold text-neutral-900 underline"
              >
                Open in Maps →
              </a>
            </div>

            <p className="mt-md text-sm leading-relaxed text-neutral-700">
              {selectedJob.description}
            </p>

            {photos.length > 0 && (
              <div className="mt-md">
                <p className="text-sm font-semibold">Photos from tenant ({photos.length})</p>
                <div className="mt-sm grid grid-cols-3 gap-sm">
                  {photos.map((p) => (
                    <a key={p.id} href={p.storage_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={p.storage_url}
                        alt={p.file_name}
                        className="h-24 w-full rounded-xl border border-neutral-200 object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/*
              Show the slot picker whenever there is no confirmed time — not just
              for new jobs. Otherwise an already-accepted job with no date is
              stuck: it shows "needs a time" but offers no way to set one.
              Doubles as the reschedule path via "Change time" below.
            */}
            {(selectedJob.status === 'reported' || !selectedJob.booked_date || rescheduling) && (
              <div className="mt-lg border-t border-neutral-200 pt-lg">
                <h3 className="font-bold">
                  {selectedJob.booked_date ? 'Change the time' : 'Pick your slot'}
                </h3>
                {selectedJob.status !== 'reported' && !selectedJob.booked_date && (
                  <p className="mt-xs text-sm text-neutral-600">
                    This job has no confirmed time yet — set one so the tenants know
                    when you&apos;re coming.
                  </p>
                )}

                <label className="mt-md block text-sm font-medium text-neutral-700">
                  Date <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={proposedDate}
                  min={todayISO()}
                  onChange={(e) => setProposedDate(e.target.value)}
                  className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                />

                <p className="mt-xs text-xs text-neutral-500">
                  {bookingLeadTimeNote(selectedJob.rooms?.name ?? selectedJob.location, selectedJob.priority)}
                </p>

                <label className="mt-md block text-sm font-medium text-neutral-700">
                  Arrival window <span className="text-red-600">*</span>
                </label>
                <div className="mt-xs grid grid-cols-3 gap-sm">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setProposedSlot(slot.value)}
                      className={`rounded-xl border-2 py-md text-sm font-semibold transition-colors ${
                        proposedSlot === slot.value
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-200 bg-white text-neutral-700'
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="mt-md w-full rounded-xl border border-neutral-300 p-md text-sm"
                  rows={2}
                />

                <button
                  onClick={acceptJob}
                  className="mt-md w-full rounded-xl bg-neutral-900 py-lg text-sm font-bold text-white active:scale-[0.99]"
                >
                  {selectedJob.status === 'reported' ? 'Accept this job' : 'Confirm this time'}
                </button>
              </div>
            )}

            {/* Work can only progress once a time is confirmed. */}
            {selectedJob.status === 'assigned' && selectedJob.booked_date && !rescheduling && (
              <div className="mt-lg space-y-sm">
                <button
                  onClick={() => setStatus('in_progress')}
                  className="w-full rounded-xl bg-neutral-900 py-lg font-bold text-white"
                >
                  Start work
                </button>
                <button
                  onClick={() => {
                    setProposedDate(selectedJob.booked_date ?? '');
                    setProposedSlot(selectedJob.booked_slot ?? '');
                    setRescheduling(true);
                  }}
                  className="w-full rounded-xl border border-neutral-300 py-md text-sm font-semibold text-neutral-700"
                >
                  Running late? Change the time
                </button>
              </div>
            )}

            {selectedJob.status === 'in_progress' && selectedJob.booked_date && !rescheduling && (
              <button
                onClick={() => setShowCompleteForm(true)}
                className="mt-lg w-full rounded-xl bg-neutral-900 py-lg font-bold text-white"
              >
                Complete job
              </button>
            )}

            {/* Completed jobs stay reviewable after the fact. */}
            {selectedJob.status === 'completed' && (
              <div className="mt-lg rounded-2xl border-2 border-green-300 bg-green-50 p-lg">
                <p className="font-bold text-green-800">
                  ✅ Completed{selectedJob.completed_at ? ` · ${new Date(selectedJob.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </p>
                <div className="mt-md space-y-xs text-sm text-green-900">
                  {selectedJob.completion_price != null && (
                    <div className="flex justify-between"><span>Price</span><span className="font-bold">£{Number(selectedJob.completion_price).toFixed(2)}</span></div>
                  )}
                  {selectedJob.fix_quality && (
                    <div className="flex justify-between"><span>Fix quality</span><span className="font-semibold capitalize">{String(selectedJob.fix_quality).replace('-', ' ')}</span></div>
                  )}
                  {selectedJob.return_needed && (
                    <div className="flex justify-between"><span>Return visit</span><span className="font-semibold">{selectedJob.return_visit_date ? new Date(selectedJob.return_visit_date).toLocaleDateString('en-GB') : 'yes'}</span></div>
                  )}
                </div>
                {selectedJob.contractor_notes && (
                  <p className="mt-md whitespace-pre-wrap text-sm text-green-900"><span className="font-semibold">Notes:</span> {selectedJob.contractor_notes}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Job Completion Form Modal */}
      {showCompleteForm && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-lg sm:rounded-3xl">
            <div className="mb-lg flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">Complete this job</h2>
              <button
                onClick={() => setShowCompleteForm(false)}
                className="shrink-0 rounded-full bg-neutral-100 px-md py-sm text-sm"
              >
                Close
              </button>
            </div>

            {error && (
              <div className="mb-lg rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-900">
                {error}
              </div>
            )}

            <div className="space-y-lg">
              {/* Price */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-md">
                  Job price <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center gap-sm">
                  <span className="text-lg font-semibold text-neutral-600">£</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={completionData.price}
                    onChange={(e) => setCompletionData({ ...completionData, price: e.target.value })}
                    className="flex-1 rounded-xl border border-neutral-300 px-md py-md text-base"
                  />
                </div>
              </div>

              {/* Fix Quality */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-md">
                  Fix quality <span className="text-red-600">*</span>
                </label>
                <div className="space-y-sm">
                  <label className="flex items-center gap-md p-md border-2 border-neutral-200 rounded-xl cursor-pointer hover:bg-neutral-50"
                    style={{
                      borderColor: completionData.fixQuality === 'long-term' ? '#171717' : undefined,
                      backgroundColor: completionData.fixQuality === 'long-term' ? '#f5f5f5' : undefined,
                    }}
                  >
                    <input
                      type="radio"
                      name="fixQuality"
                      value="long-term"
                      checked={completionData.fixQuality === 'long-term'}
                      onChange={(e) => setCompletionData({ ...completionData, fixQuality: e.target.value as 'long-term' | 'temporary' })}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="font-semibold text-neutral-900">Long-term fix</p>
                      <p className="text-xs text-neutral-600">Problem is permanently resolved</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-md p-md border-2 border-neutral-200 rounded-xl cursor-pointer hover:bg-neutral-50"
                    style={{
                      borderColor: completionData.fixQuality === 'temporary' ? '#171717' : undefined,
                      backgroundColor: completionData.fixQuality === 'temporary' ? '#f5f5f5' : undefined,
                    }}
                  >
                    <input
                      type="radio"
                      name="fixQuality"
                      value="temporary"
                      checked={completionData.fixQuality === 'temporary'}
                      onChange={(e) => setCompletionData({ ...completionData, fixQuality: e.target.value as 'long-term' | 'temporary' })}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="font-semibold text-neutral-900">Temporary fix</p>
                      <p className="text-xs text-neutral-600">Needs a proper repair later</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Return Visit Needed */}
              <div>
                <label className="flex items-center gap-md p-md border border-neutral-200 rounded-xl cursor-pointer hover:bg-neutral-50">
                  <input
                    type="checkbox"
                    checked={completionData.returnVisitNeeded}
                    onChange={(e) => setCompletionData({ ...completionData, returnVisitNeeded: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-semibold text-neutral-900">Return visit needed</p>
                    <p className="text-xs text-neutral-600">Another appointment is required</p>
                  </div>
                </label>
              </div>

              {/* Return Visit Date (conditional) */}
              {completionData.returnVisitNeeded && (
                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-md">
                    Return visit date <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={completionData.returnVisitDate}
                    onChange={(e) => setCompletionData({ ...completionData, returnVisitDate: e.target.value })}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  />
                </div>
              )}

              {/* Return Visit Reason (conditional) */}
              {completionData.returnVisitNeeded && (
                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-md">
                    Why is another visit needed? <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    placeholder="Explain what still needs to be done..."
                    value={completionData.returnVisitReason}
                    onChange={(e) => setCompletionData({ ...completionData, returnVisitReason: e.target.value })}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm"
                    rows={3}
                  />
                </div>
              )}

              {/* Aftercare Notes */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-md">
                  Aftercare instructions for tenant
                </label>
                <textarea
                  placeholder="E.g. 'Don't use this tap for 24 hours', 'Ensure good ventilation'"
                  value={completionData.aftercareNotes}
                  onChange={(e) => setCompletionData({ ...completionData, aftercareNotes: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-sm"
                  rows={3}
                />
              </div>

              {/* Photos placeholder */}
              <div className="rounded-xl border-2 border-dashed border-neutral-300 p-lg text-center">
                <p className="text-sm text-neutral-600">📸 Before/after photos (to be added)</p>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleCompleteJob}
                disabled={submittingCompletion || !completionData.price}
                className="w-full rounded-xl bg-neutral-900 py-lg font-bold text-white disabled:bg-neutral-400"
              >
                {submittingCompletion ? 'Submitting...' : completionData.returnVisitNeeded ? 'Complete job (return visit scheduled)' : 'Complete job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
