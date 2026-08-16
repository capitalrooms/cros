'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

interface JobCompletionProps {
  jobId: string;
  onComplete: (result: any) => void;
  onCancel: () => void;
}

const RETURN_VISIT_REASONS = [
  { key: 'leave_to_dry', label: 'Needs to dry/cure', needsDate: true },
  { key: 'waiting_for_parts', label: 'Waiting for parts', needsDate: true },
  { key: 'specialist_needed', label: 'Specialist needed for follow-up', needsDate: true },
  { key: 'inspection_required', label: 'Landlord/inspector needs to check', needsDate: true },
  { key: 'tenant_not_home', label: 'Tenant not home for part of job', needsDate: false },
  { key: 'weather_dependent', label: 'Weather dependent work', needsDate: true },
  { key: 'other_return_visit', label: 'Other reason', needsDate: true },
];

export default function JobCompletion({ jobId, onComplete, onCancel }: JobCompletionProps) {
  const [completionNotes, setCompletionNotes] = useState('');
  const [photoBeforeFile, setPhotoBeforeFile] = useState<File | null>(null);
  const [photoAfterFile, setPhotoAfterFile] = useState<File | null>(null);
  const [cost, setCost] = useState('');
  const [costNotes, setCostNotes] = useState('');
  const [returnVisitNeeded, setReturnVisitNeeded] = useState(false);
  const [returnVisitReason, setReturnVisitReason] = useState('');
  const [returnVisitNotes, setReturnVisitNotes] = useState('');
  const [returnVisitDate, setReturnVisitDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  async function handleComplete() {
    setError('');

    // Validation
    if (!completionNotes.trim()) {
      setError('Please enter completion notes');
      return;
    }

    if (returnVisitNeeded) {
      if (!returnVisitReason) {
        setError('Please select a reason for return visit');
        return;
      }
      const reason = RETURN_VISIT_REASONS.find((r) => r.key === returnVisitReason);
      if (reason?.needsDate && !returnVisitDate) {
        setError('Please enter estimated return visit date');
        return;
      }
    }

    setSubmitting(true);

    try {
      // Upload photos if provided
      let photoBeforeUrl = null;
      let photoAfterUrl = null;

      if (photoBeforeFile) {
        const fileName = `job-${jobId}-before-${Date.now()}`;
        const { data, error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(fileName, photoBeforeFile);
        if (uploadError) throw uploadError;
        photoBeforeUrl = data?.path;
      }

      if (photoAfterFile) {
        const fileName = `job-${jobId}-after-${Date.now()}`;
        const { data, error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(fileName, photoAfterFile);
        if (uploadError) throw uploadError;
        photoAfterUrl = data?.path;
      }

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get person ID
      const { data: person } = await supabase
        .from('people')
        .select('id')
        .eq('auth_id', user.id)
        .single();
      if (!person) throw new Error('User not found');

      // Update job
      const { error: updateError } = await supabase
        .from('maintenance_tickets')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: person.id,
          completion_notes: completionNotes,
          photo_before_url: photoBeforeUrl,
          photo_after_url: photoAfterUrl,
          cost: cost ? parseFloat(cost) : null,
          cost_notes: costNotes || null,
          return_visit_needed: returnVisitNeeded,
          return_visit_reason: returnVisitNeeded ? returnVisitReason : null,
          return_visit_notes: returnVisitNeeded ? returnVisitNotes : null,
          return_visit_date_estimate: returnVisitNeeded ? returnVisitDate : null,
        })
        .eq('id', jobId);

      if (updateError) throw updateError;

      // Create completion log entry
      await supabase.from('job_completion_log').insert({
        ticket_id: jobId,
        status_before: 'in_progress',
        status_after: 'completed',
        completed_by: person.id,
        notes: completionNotes,
      });

      // Send tenant notification
      await fetch('/api/notify-job-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: jobId,
          hasReturnVisit: returnVisitNeeded,
          returnVisitDate: returnVisitDate || null,
        }),
      }).catch(() => {}); // Non-blocking

      onComplete({ success: true, returnVisitNeeded });
    } catch (err) {
      console.error('Error completing job:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete job');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedReason = RETURN_VISIT_REASONS.find((r) => r.key === returnVisitReason);
  const needsDate = selectedReason?.needsDate ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-lg">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-white border-b-2 border-neutral-200 p-lg flex items-center justify-between">
          <h2 className="text-xl font-bold text-neutral-900">Complete This Job</h2>
          <button
            onClick={onCancel}
            className="text-2xl text-neutral-600 hover:text-neutral-900"
          >
            ✕
          </button>
        </div>

        <div className="space-y-lg p-lg">
          {/* Error Message */}
          {error && (
            <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-md">
              <p className="text-sm font-bold text-red-900">{error}</p>
            </div>
          )}

          {/* Completion Notes */}
          <div className="space-y-sm">
            <label className="text-sm font-bold text-neutral-900">
              What did you complete? *
            </label>
            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="e.g., Replaced broken door handle, tested locking mechanism, everything working smoothly"
              className="w-full rounded-lg border-2 border-neutral-200 px-md py-sm text-sm"
              rows={3}
            />
          </div>

          {/* Before Photo */}
          <div className="space-y-sm">
            <label className="text-sm font-bold text-neutral-900">
              📸 Before photo (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoBeforeFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
            {photoBeforeFile && (
              <p className="text-xs text-neutral-600">Selected: {photoBeforeFile.name}</p>
            )}
          </div>

          {/* After Photo */}
          <div className="space-y-sm">
            <label className="text-sm font-bold text-neutral-900">
              📸 After photo (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoAfterFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
            {photoAfterFile && (
              <p className="text-xs text-neutral-600">Selected: {photoAfterFile.name}</p>
            )}
          </div>

          {/* Cost */}
          <div className="grid grid-cols-2 gap-md">
            <div className="space-y-sm">
              <label className="text-sm font-bold text-neutral-900">
                💷 Cost (optional)
              </label>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full rounded-lg border-2 border-neutral-200 px-md py-sm text-sm"
              />
            </div>
            <div className="space-y-sm">
              <label className="text-sm font-bold text-neutral-900">
                Notes (optional)
              </label>
              <input
                type="text"
                value={costNotes}
                onChange={(e) => setCostNotes(e.target.value)}
                placeholder="e.g., parts, labour"
                className="w-full rounded-lg border-2 border-neutral-200 px-md py-sm text-sm"
              />
            </div>
          </div>

          {/* Return Visit */}
          <div className="border-t-2 border-neutral-200 pt-lg space-y-md">
            <div className="flex items-center gap-md">
              <input
                type="checkbox"
                id="return-visit"
                checked={returnVisitNeeded}
                onChange={(e) => {
                  setReturnVisitNeeded(e.target.checked);
                  if (!e.target.checked) {
                    setReturnVisitReason('');
                    setReturnVisitNotes('');
                    setReturnVisitDate('');
                  }
                }}
                className="h-5 w-5 rounded"
              />
              <label htmlFor="return-visit" className="text-sm font-bold text-neutral-900">
                This job needs a return visit
              </label>
            </div>

            {returnVisitNeeded && (
              <>
                <div className="space-y-sm">
                  <label className="text-sm font-bold text-neutral-900">
                    Why do you need to return? *
                  </label>
                  <select
                    value={returnVisitReason}
                    onChange={(e) => setReturnVisitReason(e.target.value)}
                    className="w-full rounded-lg border-2 border-neutral-200 px-md py-sm text-sm"
                  >
                    <option value="">Select a reason...</option>
                    {RETURN_VISIT_REASONS.map((reason) => (
                      <option key={reason.key} value={reason.key}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>

                {needsDate && (
                  <div className="space-y-sm">
                    <label className="text-sm font-bold text-neutral-900">
                      Estimated return date *
                    </label>
                    <input
                      type="date"
                      value={returnVisitDate}
                      onChange={(e) => setReturnVisitDate(e.target.value)}
                      className="w-full rounded-lg border-2 border-neutral-200 px-md py-sm text-sm"
                    />
                  </div>
                )}

                <div className="space-y-sm">
                  <label className="text-sm font-bold text-neutral-900">
                    Notes about return visit (optional)
                  </label>
                  <textarea
                    value={returnVisitNotes}
                    onChange={(e) => setReturnVisitNotes(e.target.value)}
                    placeholder="e.g., Paint needs 48 hours to dry, will check finish and touch up"
                    className="w-full rounded-lg border-2 border-neutral-200 px-md py-sm text-sm"
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>

          {/* Reassuring Message */}
          <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-md">
            <p className="text-sm text-green-900">
              ✅ <strong>Great work!</strong> The tenant will be notified that this work is complete
              {returnVisitNeeded ? ` and to expect you back on ${returnVisitDate}` : ''}.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-sm sticky bottom-0 bg-white pt-lg border-t-2 border-neutral-200">
            <button
              onClick={handleComplete}
              disabled={submitting}
              className="flex-1 rounded-lg bg-green-600 px-md py-sm text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? '⏳ Marking complete...' : '✅ Mark Job Complete'}
            </button>
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border-2 border-neutral-200 px-md py-sm text-sm font-bold text-neutral-600 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
