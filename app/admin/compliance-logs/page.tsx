'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import AppBar from '@/components/AppBar';
import Link from 'next/link';

interface ComplianceLog {
  id: string;
  property_id: string;
  check_type: string;
  checked_by: string;
  checked_by_role: string;
  checked_date: string;
  notes: string | null;
  created_at: string;
  people?: { full_name: string };
  properties?: { name: string; address: string };
}

interface Property {
  id: string;
  name: string;
  address: string;
}

export default function ComplianceLogsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [logs, setLogs] = useState<ComplianceLog[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [checkType, setCheckType] = useState<'fire_door' | 'smoke_alarm'>('fire_door');
  const [checkedDate, setCheckedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login');
        return;
      }

      const supabase = createClient();
      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name, address')
        .order('name');

      setProperties(propsData || []);
      if (propsData?.[0]) {
        setSelectedProperty(propsData[0].id);
        await loadLogs(propsData[0].id);
      }
      setLoading(false);
    }

    init();
  }, [router]);

  async function loadLogs(propertyId: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('compliance_logs')
        .select('*, people(full_name), properties(name, address)')
        .eq('property_id', propertyId)
        .order('checked_date', { ascending: false });

      setLogs(data || []);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  }

  async function handleAddCheck() {
    if (!selectedProperty || !checkedDate) {
      alert('Please select a property and date');
      return;
    }

    setSubmitting(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const supabase = createClient();
      const { error } = await supabase.from('compliance_logs').insert({
        property_id: selectedProperty,
        check_type: checkType,
        checked_by: user.assignment?.id,
        checked_by_role: user.assignment?.role,
        checked_date: checkedDate,
        notes: notes || null,
      });

      if (error) throw error;

      setCheckType('fire_door');
      setCheckedDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setShowAddModal(false);
      await loadLogs(selectedProperty);
      alert('✅ Compliance check recorded');
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  const fireDoLogs = logs.filter((l) => l.check_type === 'fire_door');
  const smokeAlarmLogs = logs.filter((l) => l.check_type === 'smoke_alarm');

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <Link href="/admin" className="text-sm font-bold text-neutral-600 hover:text-neutral-900">
            ← Back
          </Link>
        }
      />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="flex items-center justify-between mb-lg">
          <h1 className="text-3xl font-bold text-neutral-900">Compliance Logs</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-lg py-md bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-800 transition-colors"
          >
            ➕ Add Check
          </button>
        </div>

        {/* Property selector */}
        <div className="mb-lg">
          <select
            value={selectedProperty}
            onChange={(e) => {
              setSelectedProperty(e.target.value);
              loadLogs(e.target.value);
            }}
            className="w-full rounded-xl border border-neutral-300 px-lg py-md text-base"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.address})
              </option>
            ))}
          </select>
        </div>

        {/* Fire Door Checks */}
        <section className="mb-3xl">
          <h2 className="text-2xl font-bold text-neutral-900 mb-md">🚪 Fire Door Checks</h2>
          {fireDoLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No fire door checks recorded</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Date</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Checked By</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {fireDoLogs.map((log, idx) => (
                    <tr key={log.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-lg py-md text-sm text-neutral-900">
                        {new Date(log.checked_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{log.people?.full_name || 'Unknown'}</td>
                      <td className="px-lg py-md text-sm text-neutral-600">{log.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Smoke Alarm Checks */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-md">🚨 Smoke Alarm Checks</h2>
          {smokeAlarmLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No smoke alarm checks recorded</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Date</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Checked By</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {smokeAlarmLogs.map((log, idx) => (
                    <tr key={log.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-lg py-md text-sm text-neutral-900">
                        {new Date(log.checked_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{log.people?.full_name || 'Unknown'}</td>
                      <td className="px-lg py-md text-sm text-neutral-600">{log.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Add Check Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-3xl bg-white p-lg max-w-md w-full mx-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-lg">Record Compliance Check</h2>

              <div className="space-y-md">
                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">Check Type</label>
                  <select
                    value={checkType}
                    onChange={(e) => setCheckType(e.target.value as 'fire_door' | 'smoke_alarm')}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  >
                    <option value="fire_door">🚪 Fire Door</option>
                    <option value="smoke_alarm">🚨 Smoke Alarm</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">Date</label>
                  <input
                    type="date"
                    value={checkedDate}
                    onChange={(e) => setCheckedDate(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., 'All doors functioning properly' or 'Low battery on alarm'"
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                    rows={3}
                  />
                </div>

                <div className="flex gap-sm pt-md">
                  <button
                    onClick={handleAddCheck}
                    disabled={submitting}
                    className="flex-1 rounded-xl bg-neutral-900 py-md font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Check'}
                  </button>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
