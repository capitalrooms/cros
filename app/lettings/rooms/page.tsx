'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar';

interface Room {
  id: string;
  name: string;
  property_id: string;
  status: 'occupied' | 'available' | 'on_notice';
  current_rent: number | null;
  asking_rent: number | null;
  available_date: string | null;
  days_on_market: number | null;
  marketing_status: string;
  property?: { name: string; address: string };
}

export default function RoomsManagement() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'available' | 'on_notice' | 'occupied'>('all');

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'lettings') {
        router.push('/login');
        return;
      }

      const supabase = createClient();
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('*, properties(name, address)')
        .order('status');

      setRooms(roomsData || []);
      setLoading(false);
    }
    init();
  }, [router]);

  const filtered = rooms.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const counts = {
    all: rooms.length,
    available: rooms.filter((r) => r.status === 'available').length,
    on_notice: rooms.filter((r) => r.status === 'on_notice').length,
    occupied: rooms.filter((r) => r.status === 'occupied').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <Link href="/lettings" className="shrink-0 text-sm text-white/60 hover:text-white">
            Dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Rooms</h1>
          <p className="mt-sm text-neutral-600">Manage room listings and availability</p>
        </div>

        {/* Filter Buttons */}
        <div className="mb-lg flex gap-sm overflow-x-auto pb-sm">
          {(['all', 'available', 'on_notice', 'occupied'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-xl px-md py-sm text-sm font-semibold transition-all ${
                filter === f
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-700 hover:border-neutral-400'
              }`}
            >
              {f === 'all' ? 'All' : f === 'on_notice' ? 'On notice' : f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>

        {/* Rooms Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No rooms found</p>
          </div>
        ) : (
          <div className="grid gap-md">
            {filtered.map((room) => (
              <div
                key={room.id}
                className={`rounded-2xl border-2 p-lg ${
                  room.status === 'available'
                    ? 'border-green-200 bg-green-50'
                    : room.status === 'on_notice'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-neutral-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-md mb-md">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">{room.name}</h3>
                    <p className="text-sm text-neutral-600">{room.property?.name}</p>
                  </div>
                  <span
                    className={`px-md py-xs text-xs font-semibold rounded-full ${
                      room.status === 'available'
                        ? 'bg-green-100 text-green-700'
                        : room.status === 'on_notice'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {room.status === 'on_notice' ? 'On notice' : room.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
                  <div>
                    <p className="text-xs text-neutral-500">Current rent</p>
                    <p className="font-bold">£{room.current_rent?.toLocaleString() || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Asking rent</p>
                    <p className="font-bold">£{room.asking_rent?.toLocaleString() || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">On market</p>
                    <p className="font-bold">{room.days_on_market || '—'} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Available</p>
                    <p className="font-bold">
                      {room.available_date
                        ? new Date(room.available_date).toLocaleDateString('en-GB', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-md flex gap-sm">
                  <Link
                    href={`/lettings/rooms/${room.id}`}
                    className="flex-1 rounded-xl bg-neutral-950 px-md py-sm text-sm font-bold text-white hover:bg-neutral-800"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
