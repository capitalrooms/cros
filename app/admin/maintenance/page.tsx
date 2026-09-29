'use client';

import { useState, useEffect, useRef } from 'react';
import QuotesPanel from './QuotesPanel';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatBooking, TIME_SLOTS, earliestBookableDate, bookingLeadTimeNote } from '@/lib/booking';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  reporter_id: string;
  contractor_id?: string;
  property_id: string | null;
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
 *
 * Section headers are color-coded to indicate whether admin action is needed:
 * - ACTION_NEEDED (orange/red): tenant or contractor waiting on admin decision/step
 * - PASSIVE_TRACKING (neutral): process already in motion, nothing needed from admin right now
 */
type SectionType = 'ACTION_NEEDED' | 'PASSIVE_TRACKING';

interface PipelineStage {
  key: string;
  title: string;
  actionType: SectionType;
  getHeaderClass: (itemCount: number) => string;
  cardClass: string;
  match: (t: Ticket) => boolean;
}

const PIPELINE: PipelineStage[] = [
  {
    key: 'awaiting',
    title: 'New — awaiting review',
    actionType: 'ACTION_NEEDED',
    getHeaderClass: () => 'bg-red-600 text-white',
    cardClass: 'border-red-500 border-2',
    match: (t: Ticket) => t.status === 'reported' && !t.approved_at && !t.on_hold,
  },
  {
    key: 'hold',
    title: 'Batched — pending action',
    actionType: 'PASSIVE_TRACKING',
    getHeaderClass: () => 'bg-neutral-700 text-white',
    cardClass: 'border-dashed border-neutral-400 border-2',
    match: (t: Ticket) => t.on_hold && t.status === 'reported',
  },
  {
    key: 'raised',
    title: 'Approved — assign contractor',
    actionType: 'ACTION_NEEDED',
    getHeaderClass: () => 'bg-red-600 text-white',
    cardClass: 'border-red-500 border-2',
    match: (t: Ticket) => t.status === 'reported' && !!t.approved_at && !t.on_hold,
  },
  {
    key: 'assigned',
    title: 'With contractor — awaiting date',
    actionType: 'ACTION_NEEDED',
    getHeaderClass: () => 'bg-red-600 text-white',
    cardClass: 'border-red-500 border-2',
    match: (t: Ticket) => t.status === 'assigned' && !t.booked_date,
  },
  {
    key: 'booked',
    title: 'Booked in',
    actionType: 'PASSIVE_TRACKING',
    getHeaderClass: () => 'bg-neutral-800 text-white',
    cardClass: 'border-neutral-300',
    match: (t: Ticket) => t.status === 'assigned' && !!t.booked_date,
  },
  {
    key: 'progress',
    title: 'In progress',
    actionType: 'PASSIVE_TRACKING',
    getHeaderClass: () => 'bg-neutral-600 text-white',
    cardClass: 'border-neutral-300',
    match: (t: Ticket) => t.status === 'in_progress',
  },
  {
    key: 'completed',
    title: 'Completed',
    actionType: 'PASSIVE_TRACKING',
    getHeaderClass: () => 'bg-neutral-400 text-white',
    cardClass: 'border-neutral-200 opacity-70',
    match: (t: Ticket) => t.status === 'completed',
  },
];

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
  const [contractors, setContractors] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [bookContractor, setBookContractor] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [bookDate, setBookDate] = useState('');
  const [bookSlot, setBookSlot] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [batchDate, setBatchDate] = useState('');
  const [showBatchDialog, setShowBatchDialog] = useState(false);

  // Visit-request + merge state
  const [visitRequests, setVisitRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestDecision, setRequestDecision] = useState<Record<string, string>>({});
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  // Add to Planner
  const [plannerBoards, setPlannerBoards] = useState<{ id: string; title: string; section: string; items: { groupName: string }[] }[]>([]);
  const [addToPlannerTicket, setAddToPlannerTicket] = useState<Ticket | null>(null);
  const [plannerBoard, setPlannerBoard] = useState('');
  const [plannerGroup, setPlannerGroup] = useState('');
  const [plannerGroupCustom, setPlannerGroupCustom] = useState('');
  const [plannerAdded, setPlannerAdded] = useState<string | null>(null); // ticketId just added

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
      }
    }
    checkAuth();
  }, [router]);

  // Deep link from the phone Today screen: /admin/maintenance?ticket=<id> opens that job.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !tickets.length) return;
    const id = new URLSearchParams(window.location.search).get('ticket');
    const t = id && tickets.find(x => x.id === id);
    if (t) { deepLinked.current = true; setSelectedTicket(t); setShowDetails(true); }
  }, [tickets]);

  // Load planner boards from localStorage (client-side only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cros_planner_v1')
      if (raw) setPlannerBoards(JSON.parse(raw))
    } catch {}
  }, []);

  function openAddToPlanner(ticket: Ticket) {
    setAddToPlannerTicket(ticket)
    setPlannerBoard(plannerBoards[0]?.id || '')
    setPlannerGroup('')
    setPlannerGroupCustom('')
    setPlannerAdded(null)
  }

  function confirmAddToPlanner() {
    if (!addToPlannerTicket) return
    const board = plannerBoards.find(b => b.id === plannerBoard)
    if (!board) return
    const groupName = plannerGroup === '__custom__' ? plannerGroupCustom.trim() : plannerGroup
    if (!groupName) return

    const ticket = addToPlannerTicket
    const uid = () => Math.random().toString(36).slice(2, 10)
    const newItem = {
      id: uid(),
      groupName,
      groupColor: '#6b7280',
      title: `${ticket.category}: ${ticket.title}`,
      status: 'discuss' as const,
      responsible: 'Harry',
      date: '—',
      updates: [{
        id: uid(),
        author: 'Harry',
        when: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        body: `Raised by tenant${ticket.properties?.name ? ` at ${ticket.properties.name}` : ''}${ticket.rooms?.name ? `, ${ticket.rooms.name}` : ''}. Priority: ${ticket.priority}. ${ticket.description || ''}`.trim(),
      }],
    }
    const updated = plannerBoards.map(b =>
      b.id !== plannerBoard ? b : { ...b, items: [...b.items, newItem] }
    )
    setPlannerBoards(updated)
    try { localStorage.setItem('cros_planner_v1', JSON.stringify(updated)) } catch {}
    setPlannerAdded(ticket.id)
    setTimeout(() => setAddToPlannerTicket(null), 1500)
  }

  useEffect(() => {
    fetchTickets();
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('people')
        .select('id, full_name, first_name, last_name, company, email')
        .eq('role', 'contractor')
        .order('full_name');
      // people has no "name" column — build the label the dropdowns show
      setContractors((data || []).map((c: any) => ({
        id: c.id, email: c.email,
        name: c.company || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.full_name || null,
      })));
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

      // Cascade date to any merged child tickets so the visit stays coherent
      if (bookDate && bookSlot) {
        await cascadeDateToChildren(ticketId, bookDate, bookSlot);
      }

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

  // Load visit-requests whenever the selected ticket changes
  useEffect(() => {
    if (!selectedTicket) { setVisitRequests([]); return; }
    setLoadingRequests(true);
    fetch(`/api/admin/visit-requests?status=pending`)
      .then(r => r.ok ? r.json() : { requests: [] })
      .then(j => {
        const forThisTicket = (j.requests || []).filter((r: any) => r.ticket_id === selectedTicket.id);
        setVisitRequests(forThisTicket);
      })
      .catch(() => {})
      .finally(() => setLoadingRequests(false));
  }, [selectedTicket?.id]);

  async function handleVisitRequestDecision(requestId: string, decision: 'approved' | 'declined', response?: string) {
    setRequestDecision(prev => ({ ...prev, [requestId]: 'saving' }));
    try {
      const { data: sessionData } = await createClient().auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const res = await fetch('/api/admin/visit-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ requestId, decision, adminResponse: response || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setVisitRequests(prev => prev.filter(r => r.id !== requestId));
      fetchTickets();
    } catch (e) {
      alert('Failed to save decision: ' + (e instanceof Error ? e.message : 'Unknown error'));
      setRequestDecision(prev => ({ ...prev, [requestId]: '' }));
    }
  }

  /** Merge ticketId into targetId — sets merged_into_ticket_id and copies the date. */
  async function mergeTicketInto(ticketId: string, targetId: string) {
    if (!targetId || merging) return;
    const target = tickets.find(t => t.id === targetId);
    if (!window.confirm(`Merge "${selectedTicket?.title}" into "${target?.title}"? The merged job will follow the target's schedule.`)) return;
    setMerging(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('maintenance_tickets')
        .update({
          merged_into_ticket_id: targetId,
          booked_date: target?.booked_date ?? null,
          booked_slot: target?.booked_slot ?? null,
          status: 'assigned',
        })
        .eq('id', ticketId);
      if (err) throw err;
      setMergeTargetId('');
      fetchTickets();
      setShowDetails(false);
    } catch (e) {
      alert('Merge failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setMerging(false);
    }
  }

  /**
   * When re-booking a parent ticket, cascade the new date to all child (merged) tickets
   * so the visit stays coherent.
   */
  async function cascadeDateToChildren(parentId: string, newDate: string, newSlot: string) {
    const supabase = createClient();
    await supabase
      .from('maintenance_tickets')
      .update({ booked_date: newDate, booked_slot: newSlot })
      .eq('merged_into_ticket_id', parentId);
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

  // Get the week range for display
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Group booked jobs by date, filtered to the selected week only
  const bookedTickets = tickets
    .filter((t) => t.booked_date && t.status !== 'completed' && t.booked_date >= weekStartStr && t.booked_date <= weekEndStr)
    .sort((a, b) => a.booked_date!.localeCompare(b.booked_date!));

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
        left={<BackButton href="/admin" />}
      />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        {/* Page heading */}
        <div className="mb-3xl flex items-start justify-between gap-md">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Maintenance Jobs</h1>
            <p className="mt-sm text-sm text-neutral-600">Approve, assign, and batch repairs across all properties</p>
          </div>
          <div className="flex gap-sm shrink-0">
            <Link
              href="/admin/maintenance/job-sheet"
              className="rounded-xl bg-blue-600 px-lg py-md text-sm font-bold text-white hover:bg-blue-700"
            >
              📋 Job sheet
            </Link>
            <Link
              href="/admin/maintenance/new"
              className="rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
            >
              + Single job
            </Link>
          </div>
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
              const isActionNeeded = col.actionType === 'ACTION_NEEDED';
              const isEmpty = items.length === 0;

              // ACTION_NEEDED sections always expand; others collapse when empty
              const shouldExpand = isActionNeeded || isEmpty === false;

              // Collapsed thin row (for empty or passive-tracking sections)
              if (!shouldExpand && isEmpty) {
                return (
                  <div key={col.key} className="flex items-center gap-md rounded-xl bg-neutral-200 px-md py-sm">
                    <span className="flex-1 text-sm font-medium text-neutral-600">{col.title}</span>
                    <span className="rounded-full bg-neutral-300 px-sm text-xs font-semibold text-neutral-700">
                      {items.length}
                    </span>
                  </div>
                );
              }

              // Collapsed thin row (for passive-tracking sections with items)
              if (!shouldExpand && !isEmpty) {
                return (
                  <div key={col.key} className="flex items-center gap-md rounded-xl bg-white border border-neutral-200 px-md py-sm">
                    <span className="flex-1 text-sm font-medium text-neutral-700">{col.title}</span>
                    <span className="rounded-full bg-neutral-100 px-sm text-xs font-semibold text-neutral-600">
                      {items.length}
                    </span>
                  </div>
                );
              }

              // Expanded section (for ACTION_NEEDED or empty sections being displayed)
              return (
                <div key={col.key} className={`flex min-w-0 flex-col overflow-hidden rounded-xl border ${isActionNeeded ? 'border-orange-600' : 'border-neutral-200'} bg-neutral-50`}>
                  <div
                    className={`flex items-center justify-between px-md py-sm ${col.getHeaderClass(items.length)}`}
                  >
                    <div className="flex items-center gap-sm">
                      {isActionNeeded && (
                        <span className="text-lg">⚠️</span>
                      )}
                      <span className="text-sm font-semibold">{col.title}</span>
                    </div>
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
                              <label className="flex items-center gap-xs cursor-pointer" title="Select for batching">
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
                                <span className="text-xs text-neutral-400">Select</span>
                              </label>
                            </div>
                          )}
                          {col.key === 'progress' && ticket.return_needed && (
                            <p className="mt-sm text-xs font-semibold text-neutral-900">
                              Return visit needed
                            </p>
                          )}
                          {/* Add to Planner — available on non-completed tickets */}
                          {col.key !== 'completed' && (
                            <button
                              onClick={e => { e.stopPropagation(); openAddToPlanner(ticket) }}
                              className="mt-sm w-full rounded-lg border border-dashed border-neutral-300 py-1 text-[10px] font-semibold text-neutral-400 hover:border-neutral-500 hover:text-neutral-700 transition-colors"
                            >
                              🗂️ Add to Planner
                            </button>
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

                {/* Quotes from one or more contractors — accepting one assigns the job */}
                <QuotesPanel
                  key={selectedTicket.id}
                  ticketId={selectedTicket.id}
                  contractors={contractors.map((c) => ({ id: c.id, label: c.name || c.email, email: c.email }))}
                  onAssigned={() => fetchTickets()}
                />

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
                        {c.name || c.email}
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

                {/* ── Tenant add-on requests ───────────────────────────── */}
                {(loadingRequests || visitRequests.length > 0) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-md">
                    <h3 className="font-bold text-amber-900 mb-sm">🔔 Tenant add-on requests</h3>
                    {loadingRequests ? (
                      <div className="h-8 bg-amber-100 rounded animate-pulse" />
                    ) : visitRequests.map((vr: any) => (
                      <div key={vr.id} className="border-t border-amber-200 pt-sm mt-sm">
                        <p className="text-sm text-neutral-800 mb-sm">
                          <span className="font-semibold">
                            {vr.tenant?.first_name} {vr.tenant?.last_name}
                          </span>
                          {' '}wants to add:
                        </p>
                        <p className="text-sm text-neutral-700 italic mb-md">"{vr.request_text}"</p>
                        <div className="flex gap-sm">
                          <button
                            disabled={requestDecision[vr.id] === 'saving'}
                            onClick={() => handleVisitRequestDecision(vr.id, 'approved')}
                            className="flex-1 rounded-lg bg-neutral-900 py-sm text-xs font-bold text-white disabled:opacity-40"
                          >
                            {requestDecision[vr.id] === 'saving' ? 'Saving…' : '✅ Approve + add to visit'}
                          </button>
                          <button
                            disabled={requestDecision[vr.id] === 'saving'}
                            onClick={() => handleVisitRequestDecision(vr.id, 'declined')}
                            className="flex-1 rounded-lg border border-neutral-300 py-sm text-xs font-semibold text-neutral-700 disabled:opacity-40"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Merge into another job ───────────────────────────── */}
                <div className="rounded-xl border border-neutral-200 p-md">
                  <h3 className="font-bold text-neutral-900 mb-xs">Merge into another job</h3>
                  <p className="text-xs text-neutral-500 mb-md">
                    Attach this job to another visit at the same property. It will follow the target job's date.
                  </p>
                  {/* Show which property this job is at so context is clear */}
                  {selectedTicket.properties && (
                    <p className="text-xs font-medium text-neutral-700 mb-sm">
                      📍 {selectedTicket.properties.name}{selectedTicket.properties.address ? ` — ${selectedTicket.properties.address}` : ''}
                      {' '}· only jobs at this property are shown below
                    </p>
                  )}
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                  >
                    <option value="">Select job to merge into…</option>
                    {tickets
                      .filter(t =>
                        t.id !== selectedTicket.id &&
                        t.property_id !== null &&
                        t.property_id === selectedTicket.property_id &&
                        t.status !== 'completed' &&
                        !(t as any).merged_into_ticket_id
                      )
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                          {t.booked_date ? ` · ${new Date(t.booked_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ' · no date'}
                        </option>
                      ))
                    }
                  </select>
                  <button
                    disabled={!mergeTargetId || merging}
                    onClick={() => mergeTicketInto(selectedTicket.id, mergeTargetId)}
                    className="mt-sm w-full rounded-lg border border-neutral-400 py-sm text-sm font-bold text-neutral-900 disabled:opacity-40"
                  >
                    {merging ? 'Merging…' : 'Merge jobs →'}
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
                    isToday ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200'
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

      {/* ── Add to Planner modal ── */}
      {addToPlannerTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setAddToPlannerTicket(null) }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-neutral-900 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Add to Planner</p>
              <h3 className="mt-1 text-sm font-semibold text-white leading-snug">{addToPlannerTicket.category}: {addToPlannerTicket.title}</h3>
              <p className="text-xs text-neutral-500 mt-0.5">{addToPlannerTicket.properties?.name}{addToPlannerTicket.rooms?.name ? ` · ${addToPlannerTicket.rooms.name}` : ''}</p>
            </div>
            {plannerAdded === addToPlannerTicket.id ? (
              <div className="p-6 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-semibold text-neutral-800">Added to Planner</p>
              </div>
            ) : plannerBoards.length === 0 ? (
              <div className="p-5">
                <p className="text-sm text-neutral-500">No planner boards found. Open the Planner first to create boards.</p>
                <button onClick={() => setAddToPlannerTicket(null)} className="mt-3 w-full rounded-xl border border-neutral-300 py-2 text-sm font-semibold">Close</button>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">Board</label>
                  <select value={plannerBoard} onChange={e => { setPlannerBoard(e.target.value); setPlannerGroup('') }}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900">
                    {plannerBoards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">Group (property section)</label>
                  {(() => {
                    const board = plannerBoards.find(b => b.id === plannerBoard)
                    const groups = Array.from(new Set((board?.items || []).map((i: any) => i.groupName))).filter(Boolean)
                    return (
                      <>
                        <select value={plannerGroup} onChange={e => setPlannerGroup(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900">
                          <option value="">— choose or type new —</option>
                          {groups.map((g: any) => <option key={g} value={g}>{g}</option>)}
                          <option value="__custom__">+ New group…</option>
                        </select>
                        {plannerGroup === '__custom__' && (
                          <input autoFocus value={plannerGroupCustom} onChange={e => setPlannerGroupCustom(e.target.value)}
                            placeholder="Group name, e.g. Willis Road"
                            className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                          />
                        )}
                      </>
                    )
                  })()}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={confirmAddToPlanner}
                    disabled={!plannerBoard || !plannerGroup || (plannerGroup === '__custom__' && !plannerGroupCustom.trim())}
                    className="flex-1 rounded-xl bg-neutral-900 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-neutral-700 transition-colors">
                    Add to Planner
                  </button>
                  <button onClick={() => setAddToPlannerTicket(null)}
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
