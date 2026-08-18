'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  location: string | null;
  booked_date: string | null;
  booked_slot: string | null;
  created_at: string;
  contractor_id?: string;
  rooms: { name: string } | null;
}

const PIPELINE = [
  {
    key: 'reported',
    title: 'Reported',
    description: 'Awaiting approval',
    headerClass: 'bg-neutral-950 text-white',
    cardClass: 'border-neutral-900 border-2',
    match: (t: Ticket) => t.status === 'reported',
  },
  {
    key: 'approved',
    title: 'Approved & Booked',
    description: 'Sent to contractor',
    headerClass: 'bg-neutral-900 text-white',
    cardClass: 'border-neutral-800 border-2',
    match: (t: Ticket) => t.status === 'assigned' || (t.status === 'reported' && !!t.booked_date),
  },
  {
    key: 'in_progress',
    title: 'In Progress',
    description: 'Contractor working (may need return visit)',
    headerClass: 'bg-neutral-700 text-white',
    cardClass: 'border-neutral-600 border-2',
    match: (t: Ticket) => t.status === 'in_progress',
  },
  {
    key: 'completed',
    title: 'Completed',
    description: 'All work done',
    headerClass: 'bg-neutral-600 text-white',
    cardClass: 'border-neutral-400 border-2',
    match: (t: Ticket) => t.status === 'completed',
  },
];

export default function PropertyDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [property, setProperty] = useState<any>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      // Get property
      const { data: prop } = await supabase
        .from('properties')
        .select('*')
        .eq('id', params.id)
        .single();

      setProperty(prop);

      // Get maintenance jobs for this property
      const { data: jobs } = await supabase
        .from('maintenance_tickets')
        .select('*, rooms(name)')
        .eq('property_id', params.id)
        .order('created_at', { ascending: false });

      setTickets(jobs || []);
      setLoading(false);
    }
    init();
  }, [params.id, router]);

  if (loading) return <GenericPageSkeleton />;

  if (!property) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar
          right={
            <Link href="/admin/properties" className="shrink-0 hover:opacity-80">
              ← Properties
            </Link>
          }
        />
        <p className="p-xl text-sm text-neutral-600">Property not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <div className="flex items-center gap-md">
            <Link href="/admin/properties" className="shrink-0 hover:opacity-80">
              Properties
            </Link>
          </div>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Property Header */}
        <div className="mb-3xl rounded-2xl border-2 border-neutral-900 bg-white p-lg">
          <h1 className="text-2xl font-bold text-neutral-900">{property.name}</h1>
          <p className="mt-xs text-neutral-600">{property.address}</p>

          <div className="mt-lg grid grid-cols-3 gap-md border-t border-neutral-200 pt-lg">
            <div>
              <p className="text-xs font-semibold uppercase text-neutral-500">Bedrooms</p>
              <p className="mt-sm text-lg font-bold text-neutral-900">{property.bedrooms}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-neutral-500">Bathrooms</p>
              <p className="mt-sm text-lg font-bold text-neutral-900">{property.bathrooms}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-neutral-500">Occupied</p>
              <p className="mt-sm text-lg font-bold text-neutral-900">{property.occupied_by_tenants} tenants</p>
            </div>
          </div>
        </div>

        {/* Contacts Section */}
        <div className="mb-3xl grid gap-md md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Cleaner</h3>
            <p className="mt-md text-neutral-600">To be added in Contacts view</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Contractor</h3>
            <p className="mt-md text-neutral-600">To be added in Contacts view</p>
          </div>
        </div>

        {/* Key Safe / Access */}
        <div className="mb-3xl rounded-2xl border border-neutral-200 bg-white p-lg">
          <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Access</h3>
          <p className="mt-md text-sm text-neutral-600">Key codes and access methods to be added</p>
        </div>

        {/* Maintenance Pipeline */}
        <div className="mb-3xl">
          <h2 className="text-xl font-bold text-neutral-900 mb-lg">Maintenance Jobs</h2>

          <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((col) => {
              const items = tickets.filter(col.match);
              return (
                <div key={col.key}>
                  <div className={`mb-md flex items-center justify-between rounded-xl px-md py-sm ${col.headerClass}`}>
                    <div>
                      <p className="text-sm font-semibold">{col.title}</p>
                      <p className="text-xs opacity-75">{col.description}</p>
                    </div>
                    <span className="rounded-full bg-white/20 px-sm text-xs font-semibold text-white">
                      {items.length}
                    </span>
                  </div>

                  <div className="space-y-md">
                    {items.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-neutral-300 bg-white/50 p-md text-center text-xs text-neutral-400">
                        —
                      </p>
                    ) : (
                      items.map((ticket) => (
                        <div
                          key={ticket.id}
                          className={`rounded-xl p-md space-y-xs ${col.cardClass}`}
                        >
                          <p className="font-semibold text-sm text-neutral-900">{ticket.title}</p>
                          <p className="text-xs text-neutral-600">{ticket.category}</p>

                          {ticket.location && (
                            <p className="text-xs text-neutral-500">
                              📍 {ticket.rooms?.name || ticket.location}
                            </p>
                          )}

                          {ticket.booked_date && (
                            <p className="text-xs font-semibold text-neutral-700">
                              📅 {new Date(ticket.booked_date).toLocaleDateString('en-GB', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              })}
                              {ticket.booked_slot && ` • ${ticket.booked_slot}`}
                            </p>
                          )}

                          <div className="flex items-center justify-between pt-xs">
                            <span
                              className={`text-xs font-semibold px-sm py-xs rounded-full ${
                                ticket.priority === 'high'

                                  ? 'bg-red-100 text-red-700'
                                  : ticket.priority === 'medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {ticket.priority}
                            </span>
                            {ticket.contractor_id && (
                              <span className="text-xs text-green-700 font-semibold">✓ Assigned</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
