'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface RentRecord {
  id: string;
  room_id: string;
  tenant_email: string;
  amount_due: number;
  amount_paid: number | null;
  due_date: string;
  status: 'paid' | 'overdue' | 'pending';
  notes: string | null;
}

export default function RentTracking() {
  const router = useRouter();
  const [rentRecords, setRentRecords] = useState<RentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all');

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'lettings') {
        router.push('/login');
        return;
      }

      const supabase = createClient();
      const { data: rentData } = await supabase
        .from('rent_tracking')
        .select('*')
        .order('due_date');

      setRentRecords(rentData || []);
      setLoading(false);
    }
    init();
  }, [router]);

  const filtered = rentRecords.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const counts = {
    all: rentRecords.length,
    paid: rentRecords.filter((r) => r.status === 'paid').length,
    pending: rentRecords.filter((r) => r.status === 'pending').length,
    overdue: rentRecords.filter((r) => r.status === 'overdue').length,
  };

  const totalDue = rentRecords.reduce((sum, r) => sum + r.amount_due, 0);
  const totalPaid = rentRecords.reduce((sum, r) => sum + (r.amount_paid || 0), 0);
  const outstanding = totalDue - totalPaid;

  if (loading) return <GenericPageSkeleton />;

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        left={<BackButton href="/lettings" />}
      />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Rent tracking</h1>
          <p className="mt-sm text-neutral-600">Monitor rent payments and arrears</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-lg">
          <SummaryCard
            label="Total due"
            value={`£${totalDue.toLocaleString()}`}
            color="neutral"
          />
          <SummaryCard
            label="Total paid"
            value={`£${totalPaid.toLocaleString()}`}
            color="green"
          />
          <SummaryCard
            label="Outstanding"
            value={`£${outstanding.toLocaleString()}`}
            color={outstanding > 0 ? 'red' : 'neutral'}
          />
        </div>

        {/* Filter Buttons */}
        <div className="mb-lg flex gap-sm overflow-x-auto pb-sm">
          {(['all', 'paid', 'pending', 'overdue'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-xl px-md py-sm text-sm font-semibold transition-all ${
                filter === f
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-700 hover:border-neutral-400'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>

        {/* Rent Records */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No rent records</p>
          </div>
        ) : (
          <div className="space-y-sm">
            {filtered.map((record) => (
              <div
                key={record.id}
                className={`rounded-2xl border-2 p-lg ${
                  record.status === 'overdue'
                    ? 'border-red-200 bg-red-50'
                    : record.status === 'paid'
                    ? 'border-green-200 bg-green-50'
                    : 'border-neutral-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-md">
                  <div>
                    <p className="font-bold text-neutral-900">{record.tenant_email}</p>
                    <p className="text-sm text-neutral-600 mt-xs">
                      Due: {new Date(record.due_date).toLocaleDateString('en-GB')}
                    </p>
                    <div className="mt-md flex gap-md">
                      <div>
                        <p className="text-xs text-neutral-500">Amount due</p>
                        <p className="font-bold text-neutral-900">£{record.amount_due.toLocaleString()}</p>
                      </div>
                      {record.amount_paid !== null && (
                        <div>
                          <p className="text-xs text-neutral-500">Paid</p>
                          <p className="font-bold text-green-700">£{record.amount_paid.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-md py-xs text-xs font-semibold rounded-full shrink-0 ${
                      record.status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : record.status === 'overdue'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {record.status}
                  </span>
                </div>
                {record.notes && (
                  <p className="text-sm text-neutral-600 mt-sm italic">"{record.notes}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = 'neutral',
}: {
  label: string;
  value: string;
  color?: 'green' | 'red' | 'neutral';
}) {
  const colorMap = {
    green: 'bg-green-50 border-green-200 text-green-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    neutral: 'bg-neutral-50 border-neutral-200 text-neutral-900',
  };

  return (
    <div className={`rounded-2xl border-2 p-lg ${colorMap[color]}`}>
      <p className="text-xs font-semibold uppercase opacity-75">{label}</p>
      <p className="mt-sm text-2xl font-bold">{value}</p>
    </div>
  );
}
