'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface Viewing {
  id: string;
  room_id: string;
  viewing_date: string;
  viewing_slot: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  notes: string | null;
  room?: { name: string };
  properties?: { name: string };
}

export default function ViewingsDiary() {
  const router = useRouter();
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'lettings') {
        router.push('/login');
        return;
      }

      const supabase = createClient();
      const { data: viewingsData } = await supabase
        .from('viewings')
        .select('*, rooms(name)')
        .order('viewing_date');

      setViewings(viewingsData || []);
      setLoading(false);
    }
    init();
  }, [router]);

  if (loading) return <GenericPageSkeleton />;

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <Link href="/lettings" className="min-w-0 truncate text-sm font-semibold text-white hover:text-white/80">
            Dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Viewing diary</h1>
          <p className="mt-sm text-neutral-600">Manage all property viewings</p>
        </div>

        {viewings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No viewings scheduled</p>
          </div>
        ) : (
          <div className="space-y-md">
            {viewings.map((viewing) => (
              <div
                key={viewing.id}
                className="rounded-2xl border-2 border-neutral-200 bg-white p-lg hover:border-neutral-900"
              >
                <div className="flex items-start justify-between gap-md">
                  <div>
                    <p className="font-bold text-neutral-900">
                      {new Date(viewing.viewing_date).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                    <p className="text-sm text-neutral-600 mt-xs">{viewing.viewing_slot}</p>
                    <p className="font-semibold text-neutral-900 mt-md">{viewing.room?.name}</p>
                    {viewing.visitor_name && (
                      <p className="text-sm text-neutral-600 mt-sm">👤 {viewing.visitor_name}</p>
                    )}
                    {viewing.visitor_email && (
                      <p className="text-sm text-neutral-600">✉️ {viewing.visitor_email}</p>
                    )}
                    {viewing.notes && (
                      <p className="text-sm text-neutral-600 mt-sm italic">"{viewing.notes}"</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-sm">
                    <span
                      className={`px-md py-xs text-xs font-semibold rounded-full text-center ${
                        viewing.status === 'scheduled'
                          ? 'bg-blue-100 text-blue-700'
                          : viewing.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      {viewing.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
