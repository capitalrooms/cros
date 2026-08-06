'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatBooking } from '@/lib/booking';
import AppBar from '@/components/AppBar';

interface Ticket {
  id: string;
  title: string;
  booked_date: string | null;
  booked_slot: string | null;
  status: string;
  priority: string;
  properties: { name: string } | null;
  rooms: { name: string } | null;
  location: string | null;
  type: 'maintenance' | 'viewing' | 'contractor' | 'cleaner' | 'admin' | 'property_update';
}

export default function CalendarPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator') {
        router.push('/login');
        return;
      }
      fetchTickets();
    }
    checkAuth();
  }, [router]);

  async function fetchTickets() {
    try {
      const supabase = createClient();

      // Fetch maintenance tickets
      const { data: ticketsData } = await supabase
        .from('maintenance_tickets')
        .select('*, properties(name), rooms(name)')
        .neq('status', 'completed')
        .order('booked_date', { ascending: true, nullsFirst: false });

      // Fetch viewings
      const { data: viewingsData } = await supabase
        .from('viewings')
        .select('*, rooms(name, properties(name))')
        .eq('viewing_status', 'scheduled')
        .order('viewing_date', { ascending: true });

      // Transform and merge data
      const allItems: Ticket[] = [];

      // Add maintenance tickets
      if (ticketsData) {
        allItems.push(
          ...ticketsData.map((t: any) => ({
            id: t.id,
            title: t.title,
            booked_date: t.booked_date,
            booked_slot: t.booked_slot,
            status: t.status,
            priority: t.priority,
            properties: t.properties,
            rooms: t.rooms,
            location: t.location,
            type: 'maintenance' as const,
          }))
        );
      }

      // Add viewings
      if (viewingsData) {
        allItems.push(
          ...viewingsData.map((v: any) => ({
            id: v.id,
            title: `Viewing: ${v.visitor_name}`,
            booked_date: v.viewing_date,
            booked_slot: v.viewing_slot,
            status: v.viewing_status,
            priority: 'medium',
            properties: v.rooms?.properties,
            rooms: v.rooms,
            location: null,
            type: 'viewing' as const,
          }))
        );
      }

      // Sort by date
      allItems.sort((a, b) => {
        const dateA = new Date(a.booked_date || '').getTime();
        const dateB = new Date(b.booked_date || '').getTime();
        return dateA - dateB;
      });

      setTickets(allItems);
    } finally {
      setLoading(false);
    }
  }

  // Get current month bounds
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);

  // Group tickets by date
  const byDate = tickets.reduce<Record<string, Ticket[]>>((acc, t) => {
    if (t.booked_date) {
      (acc[t.booked_date] ||= []).push(t);
    }
    return acc;
  }, {});

  // Build calendar grid
  const firstDayOfWeek = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const calendarDays: (number | null)[] = Array(firstDayOfWeek).fill(null);
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  const dayLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    const today = new Date().toISOString().split('T')[0];
    if (iso === today) return 'Today';
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    if (iso === tomorrow) return 'Tomorrow';
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
  };

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <Link href="/admin/maintenance" className="shrink-0 text-sm text-white/60 hover:text-white">
            Maintenance · Dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Month navigation */}
        <div className="mb-lg flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-md">
          <button
            onClick={() => setMonthOffset(monthOffset - 1)}
            className="rounded-lg border border-neutral-300 px-md py-sm hover:bg-neutral-50"
          >
            ← Previous
          </button>
          <h2 className="text-lg font-bold text-neutral-900">
            {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={() => setMonthOffset(monthOffset + 1)}
            className="rounded-lg border border-neutral-300 px-md py-sm hover:bg-neutral-50"
          >
            Next →
          </button>
        </div>

        {loading ? (
          <p className="text-center text-neutral-500">Loading calendar…</p>
        ) : (
          <div className="space-y-lg">
            {/* Calendar grid */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-md">
              {/* Day headers */}
              <div className="mb-md grid grid-cols-7 gap-sm">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="text-center text-xs font-bold uppercase text-neutral-500">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-sm">
                {calendarDays.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} className="aspect-square" />;
                  }

                  const dateStr = new Date(month.getFullYear(), month.getMonth(), day)
                    .toISOString()
                    .split('T')[0];
                  const dayTickets = byDate[dateStr] || [];
                  const isToday = dateStr === new Date().toISOString().split('T')[0];

                  return (
                    <div
                      key={day}
                      className={`aspect-square rounded-lg border-2 p-sm transition-all cursor-pointer hover:shadow-md ${
                        isToday ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white'
                      }`}
                    >
                      <p className={`text-sm font-bold ${isToday ? 'text-white' : 'text-neutral-900'}`}>{day}</p>
                      {dayTickets.length > 0 && (
                        <div className="mt-sm">
                          <p className={`text-xs font-semibold ${isToday ? 'text-white/80' : 'text-neutral-600'}`}>
                            {dayTickets.length} appt{dayTickets.length !== 1 ? 's' : ''}
                          </p>
                          <div className="mt-xs flex flex-wrap gap-0.5">
                            {dayTickets.slice(0, 3).map((t, i) => (
                              <div
                                key={i}
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isToday ? 'bg-white' : 'bg-neutral-900'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming appointments for this month */}
            <div>
              <h3 className="mb-md text-lg font-bold text-neutral-900">Appointments this month</h3>
              {Object.entries(byDate)
                .filter(([date]) => {
                  const d = new Date(date + 'T00:00:00');
                  return d >= monthStart && d <= monthEnd;
                })
                .map(([date, items]) => (
                  <div key={date} className="mb-lg rounded-2xl border border-neutral-200 bg-white p-md">
                    <h4 className="mb-sm text-base font-bold text-neutral-900">
                      {dayLabel(date)} — {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                      })}
                    </h4>
                    <div className="space-y-sm">
                      {items.map((ticket) => {
                        const typeColors: Record<string, { bg: string; text: string; label: string }> = {
                          maintenance: { bg: 'bg-blue-100', text: 'text-blue-900', label: 'Maintenance' },
                          viewing: { bg: 'bg-purple-100', text: 'text-purple-900', label: 'Viewing' },
                          contractor: { bg: 'bg-orange-100', text: 'text-orange-900', label: 'Contractor' },
                          cleaner: { bg: 'bg-green-100', text: 'text-green-900', label: 'Cleaner' },
                          admin: { bg: 'bg-indigo-100', text: 'text-indigo-900', label: 'Admin Visit' },
                          property_update: { bg: 'bg-teal-100', text: 'text-teal-900', label: 'Property Update' },
                        };
                        const typeStyle = typeColors[ticket.type] || typeColors.maintenance;

                        return (
                          <div
                            key={ticket.id}
                            className="flex items-start justify-between gap-md rounded-lg border border-neutral-200 bg-neutral-50 p-md hover:bg-neutral-100 cursor-pointer"
                            onClick={() => setSelectedTicket(ticket)}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-neutral-900">
                                {ticket.booked_slot && formatBooking(ticket.booked_date!, ticket.booked_slot)}
                              </p>
                              <p className="text-sm text-neutral-700">{ticket.title}</p>
                              <p className="text-xs text-neutral-500">
                                {ticket.properties?.name}
                                {ticket.rooms?.name ? ` · ${ticket.rooms.name}` : ''}
                              </p>
                            </div>
                            <div className="shrink-0 flex gap-xs">
                              <span className={`rounded-full px-sm py-xs text-xs font-bold ${typeStyle.bg} ${typeStyle.text}`}>
                                {typeStyle.label}
                              </span>
                              <span
                                className={`rounded-full px-sm py-xs text-xs font-bold ${
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
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

              {Object.keys(byDate).filter(
                (date) => {
                  const d = new Date(date + 'T00:00:00');
                  return d >= monthStart && d <= monthEnd;
                }
              ).length === 0 && (
                <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-lg text-center text-sm text-neutral-500">
                  No appointments scheduled for this month
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
