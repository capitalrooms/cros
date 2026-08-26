'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

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

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-neutral-100 text-neutral-500',
  medium: 'bg-neutral-200 text-neutral-700',
  high: 'bg-neutral-900 text-white',
};

const todayISO = () => new Date().toISOString().split('T')[0];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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
        right={<BackButton href="/tenant" />}
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
                        <span className={`text-xs font-semibold px-md py-xs rounded-full ${statusStyle.badge}`}>
                          {statusStyle.label}
                        </span>
                      </div>

                      <p className="mt-sm text-sm text-neutral-600">{request.description}</p>

                      <div className="mt-md space-y-xs text-sm text-neutral-600">
                        <p>
                          <span className="font-semibold">Category:</span> {String(request.category).replace(/-/g, ' ')}
                        </p>
                        <p>
                          <span className="font-semibold">Location:</span> {request.rooms?.name || request.location || '—'}
                        </p>
                        <p>
                          <span className="font-semibold">Reported:</span> {formatDate(request.created_at)}
                        </p>
                      </div>

                      {/* Booking Info */}
                      {request.booked_date && (
                        <div className="mt-md rounded-xl bg-neutral-50 p-md border border-neutral-200">
                          <p className="text-xs font-semibold uppercase text-neutral-500 mb-xs">Scheduled for</p>
                          <p className="text-base font-bold text-neutral-900">
                            {formatDate(request.booked_date)}
                            {request.booked_slot && ` · ${formatTime(request.booked_slot)}`}
                          </p>
                        </div>
                      )}

                      {/* Completed Info */}
                      {request.completed_at && (
                        <div className="mt-md rounded-xl bg-green-50 p-md border border-green-200">
                          <p className="text-xs font-semibold uppercase text-green-700 mb-xs">Completed</p>
                          <p className="text-base font-bold text-green-900">{formatDate(request.completed_at)}</p>
                        </div>
                      )}
                    </div>

                    {/* Priority Badge */}
                    <span className={`shrink-0 rounded-full px-md py-xs text-xs font-bold uppercase ${PRIORITY_STYLES[request.priority]}`}>
                      {request.priority}
                    </span>
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
