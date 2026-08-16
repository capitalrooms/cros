'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import AppBar from '@/components/AppBar';
import Link from 'next/link';

interface AcknowledgmentNote {
  id: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  expires_at: string;
  acknowledged_at: string | null;
  people?: { full_name: string } | null;
  rooms?: { name: string } | null;
}

export default function AcknowledgmentNotesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<AcknowledgmentNote[]>([]);
  const [personId, setPersonId] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login');
        return;
      }

      setPersonId(data.assignment?.id || null);

      const supabase = createClient();

      // Get active tenancy
      const { data: tenancy } = await supabase
        .from('tenancies')
        .select('id')
        .eq('tenant_id', data.assignment?.id)
        .not('end_date', 'is', null)
        .or('end_date.gte.' + new Date().toISOString().split('T')[0])
        .single();

      if (tenancy) {
        // Load active acknowledgment notes
        const { data: notesData } = await supabase
          .from('tenant_acknowledgment_notes')
          .select('*, people:created_by(full_name), rooms(name)')
          .eq('tenancy_id', tenancy.id)
          .neq('status', 'filed')
          .order('created_at', { ascending: false });

        setNotes(notesData || []);
      }

      setLoading(false);
    }

    init();
  }, [router]);

  async function handleAcknowledge(noteId: string) {
    if (!personId) return;

    setAcknowledging(noteId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenant_acknowledgment_notes')
        .update({
          acknowledged_by: personId,
          acknowledged_at: new Date().toISOString(),
          status: 'acknowledged',
        })
        .eq('id', noteId);

      if (error) throw error;

      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                status: 'acknowledged',
                acknowledged_at: new Date().toISOString(),
              }
            : n
        )
      );

      alert('✅ Thank you for acknowledging this note');
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setAcknowledging(null);
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

  const activeNotes = notes.filter((n) => n.status === 'active');
  const acknowledgedNotes = notes.filter((n) => n.status === 'acknowledged');

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <Link href="/tenant" className="text-sm font-bold text-neutral-600 hover:text-neutral-900">
            ← Back
          </Link>
        }
      />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        <h1 className="text-3xl font-bold text-neutral-900 mb-sm">Important Notices</h1>
        <p className="text-sm text-neutral-600 mb-lg">
          Messages from your landlord that need your acknowledgment
        </p>

        {/* Active Notes - Need Acknowledgment */}
        {activeNotes.length > 0 && (
          <section className="mb-3xl">
            <h2 className="text-lg font-bold text-neutral-900 mb-md">Awaiting Your Acknowledgment</h2>
            <div className="space-y-md">
              {activeNotes.map((note) => (
                <div key={note.id} className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-lg">
                  <h3 className="text-lg font-bold text-neutral-900 mb-sm">{note.title}</h3>
                  {note.rooms?.name && (
                    <p className="text-xs font-semibold text-neutral-600 mb-md">📍 {note.rooms.name}</p>
                  )}

                  <div className="bg-white rounded-lg p-md mb-md border border-blue-200">
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap">{note.content}</p>
                  </div>

                  <p className="text-xs text-neutral-600 mb-md">
                    From {note.people?.full_name || 'Your landlord'} •{' '}
                    {new Date(note.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>

                  <div className="flex gap-sm">
                    <button
                      onClick={() => handleAcknowledge(note.id)}
                      disabled={acknowledging === note.id}
                      className="flex-1 rounded-lg bg-blue-600 py-md font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {acknowledging === note.id ? 'Acknowledging…' : '✓ I Acknowledge'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeNotes.length === 0 && acknowledgedNotes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-600">No active notices right now</p>
          </div>
        )}

        {/* Acknowledged Notes - History */}
        {acknowledgedNotes.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-neutral-900 mb-md">Acknowledged</h2>
            <div className="space-y-md">
              {acknowledgedNotes.map((note) => (
                <div key={note.id} className="rounded-lg border border-neutral-200 bg-white p-md">
                  <div className="flex items-start justify-between mb-md">
                    <div>
                      <h3 className="font-semibold text-neutral-900">{note.title}</h3>
                      {note.rooms?.name && (
                        <p className="text-xs text-neutral-600 mt-xs">📍 {note.rooms.name}</p>
                      )}
                    </div>
                    <span className="inline-block px-md py-xs rounded-full bg-green-100 text-green-800 font-semibold text-xs">
                      ✓ Acknowledged
                    </span>
                  </div>

                  <p className="text-xs text-neutral-500">
                    Acknowledged{' '}
                    {new Date(note.acknowledged_at!).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
