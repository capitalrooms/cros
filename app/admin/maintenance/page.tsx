'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatBooking, TIME_SLOTS, earliestBookableDate, bookingLeadTimeNote } from '@/lib/booking';
import AppBar from '@/components/AppBar'

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  reporter_id: string;
  contractor_id?: string;
  location: string | null;
  booked_date: string | null;
  booked_slot: string | null;
  return_needed: boolean | null;
  approved_at: string | null;
  on_hold: boolean;
  hold_reason: string | null;
  cause: string | null;
  created_at: string;
  updated_at: string;
  properties: { name: string; address: string } | null;
  rooms: { name: string } | null;
}


/**
 * Left-to-right flow of progression — completed sits on the right so the board
 * reads as a pipeline rather than a list.
 */
const PIPELINE = [
  {
    key: 'awaiting',
    title: 'Awaiting approval',
    headerClass: 'bg-neutral-950 text-white',
    cardClass: 'border-neutral-900 border-2',
    match: (t: Ticket) => t.status === 'reported' && !t.approved_at && !t.on_hold,
  },
  {
    key: 'hold',
    title: 'Held to batch',
    headerClass: 'bg-neutral-700 text-white',
    cardClass: 'border-dashed border-neutral-400 border-2',
    match: (t: Ticket) => t.on_hold && t.status === 'reported',
  },
  {
    key: 'raised',
    title: 'Approved · assign a contractor',
    headerClass: 'bg-neutral-950 text-white',
    cardClass: 'border-neutral-900 border-2',
    match: (t: Ticket) => t.status === 'reported' && !!t.approved_at && !t.on_hold,
  },
  {
    key: 'assigned',
    title: 'With contractor · awaiting date',
    headerClass: 'bg-neutral-800 text-white',
    cardClass: 'border-neutral-300',
    match: (t: Ticket) => t.status === 'assigned' && !t.booked_date,
  },
  {
    key: 'booked',
    title: 'Booked in',
    headerClass: 'bg-neutral-800 text-white',
    cardClass: 'border-neutral-300',
    match: (t: Ticket) => t.status === 'assigned' && !!t.booked_date,
  },
  {
    key: 'progress',
    title: 'In progress',
    headerClass: 'bg-neutral-600 text-white',
    cardClass: 'border-neutral-300',
    match: (t: Ticket) => t.status === 'in_progress',
  },
  {
    key: 'completed',
    title: 'Completed',
    headerClass: 'bg-neutral-400 text-white',
    cardClass: 'border-neutral-200 opacity-70',
    match: (t: Ticket) => t.status === 'completed',
  },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-neutral-400',
  medium: 'text-neutral-500',
  high: 'text-neutral-900',
};

export default function MaintenanceDashboard() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [contractors, setContractors] = useState<{ id: string; full_name: string | null; email: string }[]>([]);
  const [bookContractor, setBookContractor] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [bookDate, setBookDate] = useState('');
  const [bookSlot, setBookSlot] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [batchDate, setBatchDate] = useState('');
  const [showBatchDialog, setShowBatchDialog] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
      }
    }
    checkAuth();
  }, [router]);

  useEffect(() => {
    fetchTickets();
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('people')
        .select('id, full_name, email')
        .eq('role', 'contractor')
        .order('full_name');
      setContractors(data || []);
    })();
  }, []);

  // Prefill the booking form with whatever the ticket already has.
  useEffect(() => {
    setBookContractor(selectedTicket?.contractor_id ?? '');
    setBookDate(selectedTicket?.booked_date ?? '');
    setBookSlot(selectedTicket?.booked_slot ?? '');
    setAdminNote((selectedTicket as any)?.admin_note ?? '');
  }, [selectedTicket]);

  /** Attach a "before you go" instruction the contractor sees on the job. */
  async function saveAdminNote(ticketId: string) {
    setSavingNote(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({ admin_note: adminNote || null })
        .eq('id', ticketId);
      if (err) throw err;
      setSelectedTicket((t) => (t ? ({ ...t, admin_note: adminNote } as any) : t));
      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  }

  async function fetchTickets() {
    try {
      const supabase = createClient();
      let query = supabase
        .from('maintenance_tickets')
        .select('*, properties(name, address), rooms(name)')
        .order('created_at', { ascending: false });

      if (filterStatus) {
        query = query.eq('status', filterStatus);
      }
      if (filterPriority) {
        query = query.eq('priority', filterPriority);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setTickets(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }

  /** Release to contractors — they cannot see a ticket until this happens. */
  async function approveTicket(ticketId: string) {
    try {
      const supabase = createClient();
      const me = await getCurrentUser();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({
          approved_at: new Date().toISOString(),
          approved_by: (me?.assignment as any)?.id ?? null,
          on_hold: false,
        })
        .eq('id', ticketId);
      if (err) throw err;
      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release ticket');
    }
  }

  /** Park a small job until there is enough work to justify one visit. */
  async function holdTicket(ticketId: string) {
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({ on_hold: true, approved_at: null })
        .eq('id', ticketId);
      if (err) throw err;

      // Tell the tenant, so a hold doesn't read as being ignored.
      fetch('/api/notify-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      }).catch((e) => console.error('Hold notification failed:', e));

      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hold ticket');
    }
  }

  /** Release every held job at one property together, as one batch. */
  async function releaseBatch(propertyName: string) {
    const batch = tickets.filter(
      (t) => t.on_hold && t.status === 'reported' && t.properties?.name === propertyName
    );
    if (batch.length === 0) return;
    if (!window.confirm(`Send ${batch.length} job${batch.length > 1 ? 's' : ''} at ${propertyName} to contractors as one batch?`)) return;

    try {
      const supabase = createClient();
      const me = await getCurrentUser();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({
          approved_at: new Date().toISOString(),
          approved_by: (me?.assignment as any)?.id ?? null,
          on_hold: false,
        })
        .in('id', batch.map((t) => t.id));
      if (err) throw err;
      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release batch');
    }
  }

  /**
   * Record a booking taken over the phone. Same end state as a contractor
   * accepting in their portal, including the notification + calendar invite,
   * so the two routes can't drift apart.
   */
  async function bookOnBehalf(ticketId: string) {
    let shortNotice = false;
    const t = tickets.find((x) => x.id === ticketId);
    const earliest = earliestBookableDate(t?.rooms?.name ?? t?.location, t?.priority);
    if (bookDate < earliest) {
      const authorised = window.confirm(
        `This job is in a bedroom and you're booking less than 24 hours ahead.\n\n` +
          `You must have the tenant's authorisation to attend at this notice.\n\n` +
          `Confirm you have their agreement? The tenant will be asked to approve in writing.`
      );
      if (!authorised) return;
      shortNotice = true;
    }
    try {
      const supabase = createClient();
      const me = await getCurrentUser();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({
          contractor_id: bookContractor,
          booked_date: bookDate,
          booked_slot: bookSlot,
          status: 'assigned',
          on_hold: false,
          approved_at: new Date().toISOString(),
          approved_by: (me?.assignment as any)?.id ?? null,
          ...(shortNotice && {
            short_notice: true,
            short_notice_asserted_by: (me?.assignment as any)?.id,
            short_notice_asserted_at: new Date().toISOString(),
          }),
        })
        .eq('id', ticketId);
      if (err) throw err;

      fetch('/api/notify-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      }).catch((e) => console.error('Booking notification failed:', e));

      fetchTickets();
      setShowDetails(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book');
    }
  }

  /**
   * Send an approved job to a chosen contractor WITHOUT a date. The contractor
   * then picks the date from their portal. This is the normal route; bookOnBehalf
   * is the phone fallback that also sets the date in one go.
   */
  async function assignContractor(ticketId: string) {
    if (!bookContractor) return;
    try {
      const supabase = createClient();
      const me = await getCurrentUser();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({
          contractor_id: bookContractor,
          status: 'assigned',
          on_hold: false,
          approved_at: new Date().toISOString(),
          approved_by: (me?.assignment as any)?.id ?? null,
        })
        .eq('id', ticketId);
      if (err) throw err;

      // Let the contractor know they've got a job to schedule.
      fetch('/api/notify-job-raised', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      }).catch((e) => console.error('Assign notification failed:', e));

      fetchTickets();
      setShowDetails(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign');
    }
  }

  async function updateTicketStatus(ticketId: string, newStatus: string) {
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({ status: newStatus })
        .eq('id', ticketId);

      if (err) throw err;
      fetchTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status: newStatus });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket');
    }
  }

  async function batchJobsToDate() {
    if (!batchDate || selectedForBatch.size === 0) return;
    try {
      const supabase = createClient();
      const jobIds = Array.from(selectedForBatch);
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({ booked_date: batchDate })
        .in('id', jobIds);
      if (err) throw err;
      setSelectedForBatch(new Set());
      setBatchDate('');
      setShowBatchDialog(false);
      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch jobs');
    }
  }

  const filteredTickets = tickets.filter((t) => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  });

  // Calendar: week of upcoming bookings
  const today = new Date().toISOString().split('T')[0];
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const count = tickets.filter((t) => t.booked_date === iso && t.status !== 'completed').length;
    return { iso, d, count };
  });

  // Group booked jobs by date
  const bookedTickets = tickets.filter((t) => t.booked_date && t.status !== 'completed').sort((a, b) => a.booked_date!.localeCompare(b.booked_date!));
  const byDay = bookedTickets.reduce<Record<string, Ticket[]>>((acc, t) => {
    (acc[t.booked_date!] ||= []).push(t);
    return acc;
  }, {});

  const dayLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    const t = new Date();
    const isToday = iso === today;
    const tomorrow = new Date(t.getTime() + 86400000).toISOString().split('T')[0];
    if (isToday) return 'Today';
    if (iso === tomorrow) return 'Tomorrow';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <Link href="/admin" className="min-w-0 truncate hover:opacity-80">
            Dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Page heading */}
        <div className="mb-3xl flex items-start justify-between gap-md">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Maintenance Jobs</h1>
            <p className="mt-sm text-sm text-neutral-600">Approve, assign, and batch repairs across all properties</p>
          </div>
          <Link
            href="/admin/maintenance/new"
            className="shrink-0 rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
          >
            + Create job
          </Link>
        </div>

        {error && (
          <div className="mb-md rounded-xl border border-2 border-neutral-900 bg-white p-md text-sm text-neutral-900">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-lg rounded-2xl border border-neutral-200 bg-white p-md">
          <h3 className="mb-md font-semibold text-neutral-900">Filters</h3>
          <div className="flex flex-wrap gap-md">
            <div>
              <label className="block text-xs font-medium text-neutral-700">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setLoading(true);
                }}
                className="mt-xs rounded-xl border border-neutral-300 px-sm py-xs text-sm"
              >
                <option value="">All Statuses</option>
                <option value="reported">Reported</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => {
                  setFilterPriority(e.target.value);
                  setLoading(true);
                }}
                className="mt-xs rounded-xl border border-neutral-300 px-sm py-xs text-sm"
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pipeline — left to right, completed on the right */}
        {loading ? (
          <div className="text-center text-neutral-600">Loading tickets...</div>
        ) : (
          <div className="grid gap-md md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {PIPELINE.map((col) => {
              const items = filteredTickets.filter((t) => col.match(t));
              return (
                <div key={col.key} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                  <div
                    className={`flex items-center justify-between px-md py-sm ${col.headerClass}`}
                  >
                    <span className="text-sm font-semibold">{col.title}</span>
                    <span className="rounded-full bg-white/20 px-sm text-xs font-semibold">
                      {items.length}
                    </span>
                  </div>

                  <div className="flex-1 space-y-md p-sm">
                  {/* Held work is grouped by property so a batch can go out together. */}
                  {col.key === 'hold' &&
                    Array.from(new Set(items.map((t) => t.properties?.name).filter(Boolean))).map(
                      (prop) => (
                        <button
                          key={prop}
                          onClick={() => releaseBatch(prop as string)}
                          className="w-full rounded-lg bg-neutral-900 py-sm text-xs font-bold text-white"
                        >
                          Send {items.filter((t) => t.properties?.name === prop).length} jobs at {prop}
                        </button>
                      )
                    )}

                  <div className="space-y-md">
                    {items.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-neutral-200 p-lg text-center text-xs text-neutral-400">
                        Nothing here
                      </p>
                    ) : (
                      items.map((ticket) => (
                        <div
                          key={ticket.id}
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setShowDetails(true);
                          }}
                          className={`cursor-pointer rounded-lg border bg-white p-md transition-shadow hover:shadow-md ${col.cardClass}`}
                        >
                          {/*
                            Property leads, not the tenant's own wording — raw
                            titles ("I spilt coffee on the wall") are messy and
                            vary wildly. Category says what kind of job it is;
                            the tenant's description is demoted to a quiet line.
                          */}
                          <div className="flex items-start justify-between gap-sm">
                            <h3 className="text-sm font-bold leading-snug text-neutral-900">
                              {ticket.properties?.name ?? 'Unknown property'}
                            </h3>
                            <span
                              className={`shrink-0 text-xs font-bold ${PRIORITY_COLORS[ticket.priority]}`}
                            >
                              {ticket.priority.toUpperCase()}
                            </span>
                          </div>

                          <p className="text-xs text-neutral-500">
                            {ticket.rooms?.name || ticket.location}
                          </p>

                          <p className="mt-sm text-sm font-semibold text-neutral-900">
                            {ticket.category}
                          </p>
                          <p className="truncate text-xs text-neutral-400" title={ticket.title}>
                            {ticket.title}
                          </p>

                          {ticket.booked_date && (
                            <p className="mt-sm text-xs font-bold text-neutral-900">
                              {formatBooking(ticket.booked_date, ticket.booked_slot)}
                            </p>
                          )}

                          <div className="mt-sm text-right text-xs text-neutral-400">
                            {new Date(ticket.created_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </div>

                          {col.key === 'awaiting' && (
                            <div className="mt-md flex gap-xs">
                              <button
                                onClick={(e) => { e.stopPropagation(); approveTicket(ticket.id); }}
                                className="flex-1 rounded-lg bg-neutral-900 py-xs text-xs font-bold text-white"
                              >
                                Approve
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); holdTicket(ticket.id); }}
                                className="flex-1 rounded-lg border border-neutral-400 py-xs text-xs font-semibold"
                              >
                                Hold
                              </button>
                            </div>
                          )}
                          {col.key === 'hold' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); approveTicket(ticket.id); }}
                              className="mt-md w-full rounded-lg bg-neutral-900 py-xs text-xs font-bold text-white"
                            >
                              Release now
                            </button>
                          )}
                          {col.key === 'raised' && (
                            <p className="mt-sm text-xs font-semibold text-neutral-900">
                              Tap to assign a contractor
                            </p>
                          )}
                          {col.key === 'assigned' && (
                            <p className="mt-sm text-xs font-semibold text-neutral-500">
                              Sent — contractor to pick a date
                            </p>
                          )}
                          {col.key === 'booked' && (
                            <div className="mt-sm flex items-center justify-between">
                              <p className="text-xs text-neutral-500">
                                {ticket.contractor_id ? 'Contractor assigned' : 'Unassigned'}
                              </p>
                              <input
                                type="checkbox"
                                checked={selectedForBatch.has(ticket.id)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const newSet = new Set(selectedForBatch);
                                  if (e.target.checked) {
                                    newSet.add(ticket.id);
                                  } else {
                                    newSet.delete(ticket.id);
                                  }
                                  setSelectedForBatch(newSet);
                                }}
                                className="cursor-pointer"
                              />
                            </div>
                          )}
                          {col.key === 'progress' && ticket.return_needed && (
                            <p className="mt-sm text-xs font-semibold text-neutral-900">
                              Return visit needed
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Batch Jobs Section */}
        {selectedForBatch.size > 0 && (
          <div className="mt-lg rounded-2xl border border-neutral-200 bg-white p-md">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-neutral-900">{selectedForBatch.size} job{selectedForBatch.size !== 1 ? 's' : ''} selected for batching</h3>
                <p className="mt-xs text-sm text-neutral-600">
                  {tickets.filter(t => selectedForBatch.has(t.id)).map(t => t.properties?.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                </p>
              </div>
              <button
                onClick={() => setShowBatchDialog(true)}
                className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-800"
              >
                Batch to Date →
              </button>
            </div>
          </div>
        )}

        {/* Batch Dialog */}
        {showBatchDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-lg">
            <div className="w-full max-w-md rounded-2xl bg-white p-xl">
              <h2 className="text-xl font-semibold text-neutral-900">Batch Jobs to Same Date</h2>
              <p className="mt-xs text-sm text-neutral-600">Select the date to move all {selectedForBatch.size} job{selectedForBatch.size !== 1 ? 's' : ''} to:</p>

              <div className="mt-lg">
                <label className="block text-sm font-medium text-neutral-700">Target Date</label>
                <input
                  type="date"
                  value={batchDate}
                  onChange={(e) => setBatchDate(e.target.value)}
                  className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                />
              </div>

              <div className="mt-lg flex gap-md">
                <button
                  onClick={() => setShowBatchDialog(false)}
                  className="flex-1 rounded-xl border border-neutral-300 px-lg py-sm text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => batchJobsToDate()}
                  disabled={!batchDate}
                  className="flex-1 rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-800 disabled:bg-neutral-300"
                >
                  Batch Jobs
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {showDetails && selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-lg">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-xl">
              <div className="mb-md flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-neutral-900">{selectedTicket.title}</h2>
                  <p className="mt-xs text-sm text-neutral-600">
                    Reported {new Date(selectedTicket.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-md">
                <div>
                  <h3 className="font-medium text-neutral-900">Description</h3>
                  <p className="mt-xs text-sm text-neutral-600">{selectedTicket.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-md">
                  <div>
                    <h3 className="font-medium text-neutral-900">Category</h3>
                    <p className="mt-xs text-sm text-neutral-600">{selectedTicket.category}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-neutral-900">Priority</h3>
                    <p className={`mt-xs text-sm font-medium ${PRIORITY_COLORS[selectedTicket.priority]}`}>
                      {selectedTicket.priority.toUpperCase()}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-neutral-900">Status</h3>
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => updateTicketStatus(selectedTicket.id, e.target.value)}
                    className="mt-xs rounded-xl border border-neutral-300 px-md py-sm text-sm"
                  >
                    <option value="reported">Reported</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/*
                  Book on a contractor's behalf. Contractors phone rather than
                  using the portal — without this the record goes stale and
                  everyone falls back to WhatsApp.
                */}
                <div className="rounded-xl border-2 border-neutral-900 p-md">
                  <h3 className="font-bold text-neutral-900">
                    {selectedTicket.contractor_id ? 'Reassign or rebook' : 'Send to a contractor'}
                  </h3>
                  <p className="mt-xs text-xs text-neutral-500">
                    Choose who does this job — pick a contractor to suit the work. They&apos;re
                    notified and book a date themselves, or set the date now if they&apos;ve
                    confirmed by phone.
                  </p>
                  <p className="mt-xs text-xs text-neutral-500">
                    {bookingLeadTimeNote(
                      selectedTicket.rooms?.name ?? selectedTicket.location,
                      selectedTicket.priority
                    )}
                  </p>

                  <label className="mt-md block text-xs font-medium text-neutral-700">
                    Contractor
                  </label>
                  <select
                    value={bookContractor}
                    onChange={(e) => setBookContractor(e.target.value)}
                    className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                  >
                    <option value="">Select contractor…</option>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || c.email}
                      </option>
                    ))}
                  </select>

                  {/* Primary route: assign, the contractor books the date */}
                  <button
                    onClick={() => assignContractor(selectedTicket.id)}
                    disabled={!bookContractor}
                    className="mt-md w-full rounded-lg bg-neutral-900 py-md text-sm font-bold text-white disabled:bg-neutral-300"
                  >
                    Send to contractor →
                  </button>

                  {/* Fallback: book the date now (phone confirmation) */}
                  <div className="mt-md border-t border-neutral-200 pt-md">
                    <p className="mb-md text-xs font-medium text-neutral-600">
                      Or book the date now (phone confirmation)
                    </p>
                    <div className="grid grid-cols-2 gap-md">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700">Date</label>
                        <input
                          type="date"
                          value={bookDate}
                          onChange={(e) => setBookDate(e.target.value)}
                          className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-700">Slot</label>
                        <select
                          value={bookSlot}
                          onChange={(e) => setBookSlot(e.target.value)}
                          className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                        >
                          <option value="">Select slot…</option>
                          {TIME_SLOTS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => bookOnBehalf(selectedTicket.id)}
                      disabled={!bookContractor || !bookDate || !bookSlot}
                      className="mt-md w-full rounded-lg border border-neutral-400 py-md text-sm font-bold text-neutral-900 disabled:opacity-40"
                    >
                      Confirm booking
                    </button>
                  </div>
                </div>

                {/* "Before you go" note the contractor sees on the job */}
                <div className="rounded-xl border border-neutral-300 p-md">
                  <h3 className="font-bold text-neutral-900">Note for the contractor</h3>
                  <p className="mt-xs text-xs text-neutral-500">
                    Anything extra to check while they&apos;re there — shown on their job screen and
                    again before they mark it complete.
                  </p>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={2}
                    placeholder="e.g. While you're there, please check the boiler pressure."
                    className="mt-md w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                  <button
                    onClick={() => saveAdminNote(selectedTicket.id)}
                    disabled={savingNote}
                    className="mt-md w-full rounded-lg border border-neutral-400 py-sm text-sm font-bold text-neutral-900 disabled:opacity-40"
                  >
                    {savingNote ? 'Saving…' : 'Save note'}
                  </button>
                </div>

                <div className="flex gap-md border-t border-neutral-200 pt-md">
                  <button
                    onClick={() => setShowDetails(false)}
                    className="flex-1 rounded-xl border border-neutral-300 px-md py-sm text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calendar view — upcoming week */}
        <section className="mt-3xl">
          <div className="mb-lg flex items-center justify-between">
            <div className="flex items-center gap-md">
              <button
                onClick={() => setWeekOffset(weekOffset - 1)}
                className="rounded-lg border border-neutral-300 p-sm hover:bg-neutral-50"
              >
                ←
              </button>
              <h2 className="text-xl font-bold text-neutral-900">Upcoming week</h2>
              <button
                onClick={() => setWeekOffset(weekOffset + 1)}
                className="rounded-lg border border-neutral-300 p-sm hover:bg-neutral-50"
              >
                →
              </button>
            </div>
            <Link href="/admin/calendar" className="text-sm font-medium text-neutral-700 hover:text-neutral-900">
              View full calendar →
            </Link>
          </div>

          {/* Week strip */}
          <div className="mb-lg flex gap-xs overflow-x-auto">
            {week.map((d) => {
              const isToday = d.iso === today;
              return (
                <div
                  key={d.iso}
                  className={`min-w-[72px] rounded-xl px-sm py-md text-center ${
                    isToday ? 'bg-neutral-950 text-white' : 'bg-white border border-neutral-200'
                  }`}
                >
                  <p className={`text-xs uppercase tracking-wide ${isToday ? 'opacity-60' : 'text-neutral-500'}`}>
                    {d.d.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </p>
                  <p className={`text-base font-bold leading-tight ${isToday ? 'text-white' : 'text-neutral-900'}`}>
                    {d.d.getDate()}
                  </p>
                  <div className="mt-xs flex h-1.5 justify-center gap-0.5">
                    {d.count > 0 ? (
                      Array.from({ length: Math.min(d.count, 3) }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-neutral-900'}`}
                        />
                      ))
                    ) : (
                      <span className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-white/30' : 'bg-neutral-200'}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Schedule by day */}
          {bookedTickets.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">
              No jobs booked yet
            </p>
          ) : (
            <div className="space-y-lg">
              {Object.entries(byDay).map(([date, items]) => (
                <div key={date} className="rounded-2xl border border-neutral-200 bg-white p-md">
                  <h3 className="mb-md text-base font-bold text-neutral-900">
                    {dayLabel(date)}
                    <span className="ml-sm text-sm font-normal text-neutral-500">
                      {items.length} job{items.length !== 1 ? 's' : ''}
                    </span>
                  </h3>

                  <div className="space-y-sm">
                    {items.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="flex items-start justify-between gap-md rounded-lg border border-neutral-200 bg-neutral-50 p-sm hover:bg-neutral-100 cursor-pointer"
                        onClick={() => {
                          setSelectedTicket(ticket);
                          setShowDetails(true);
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-neutral-900">
                            {formatBooking(ticket.booked_date!, ticket.booked_slot!)}
                          </p>
                          <p className="text-sm text-neutral-700">{ticket.title}</p>
                          <p className="text-xs text-neutral-500">
                            {ticket.properties?.name}
                            {ticket.rooms?.name ? ` · ${ticket.rooms.name}` : ''}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-sm py-xs text-xs font-bold ${
                            ticket.priority === 'high'
                              ? 'bg-neutral-900 text-white'
                              : ticket.priority === 'medium'
                                ? 'bg-neutral-200 text-neutral-900'
                                : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {ticket.priority.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
