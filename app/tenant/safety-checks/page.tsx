'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import AppBar from '@/components/AppBar';
import Link from 'next/link';

interface SelfCheck {
  id: string;
  check_type: 'fire_door' | 'smoke_alarm';
  request_sent_at: string;
  response_received_at: string | null;
  tenant_response: string | null;
  issue_type: string | null;
  issue_description: string | null;
  tenancy_id: string;
}

interface IssueType {
  id: string;
  issue_key: string;
  display_name: string;
  category: string;
}

export default function SafetyChecksPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tenancyId, setTenancyId] = useState<string>('');
  const [checks, setChecks] = useState<SelfCheck[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [reportingCheckId, setReportingCheckId] = useState<string | null>(null);
  const [selectedIssueType, setSelectedIssueType] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login');
        return;
      }

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
        setTenancyId(tenancy.id);

        // Load pending checks
        const { data: checksData } = await supabase
          .from('tenant_self_checks')
          .select('*')
          .eq('tenancy_id', tenancy.id)
          .order('request_sent_at', { ascending: false });

        setChecks(checksData || []);
      }

      // Load issue types
      const { data: issues } = await supabase.from('tenant_self_check_issues').select('*');
      setIssueTypes(issues || []);

      setLoading(false);
    }

    init();
  }, [router]);

  async function handleCheckConfirmed(checkId: string) {
    if (!tenancyId) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenant_self_checks')
        .update({
          response_received_at: new Date().toISOString(),
          tenant_response: 'confirmed_ok',
        })
        .eq('id', checkId);

      if (error) throw error;

      setChecks((prev) =>
        prev.map((c) =>
          c.id === checkId
            ? {
                ...c,
                response_received_at: new Date().toISOString(),
                tenant_response: 'confirmed_ok',
              }
            : c
        )
      );

      alert('✅ Check confirmed');
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  async function handleReportIssue() {
    if (!reportingCheckId || !selectedIssueType || !issueDescription.trim()) {
      alert('Please select an issue type and describe it');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const selectedIssue = issueTypes.find((i) => i.issue_key === selectedIssueType);

      const { error } = await supabase
        .from('tenant_self_checks')
        .update({
          response_received_at: new Date().toISOString(),
          tenant_response: 'issue_reported',
          issue_type: selectedIssueType,
          issue_description: issueDescription,
        })
        .eq('id', reportingCheckId);

      if (error) throw error;

      setChecks((prev) =>
        prev.map((c) =>
          c.id === reportingCheckId
            ? {
                ...c,
                response_received_at: new Date().toISOString(),
                tenant_response: 'issue_reported',
                issue_type: selectedIssueType,
                issue_description: issueDescription,
              }
            : c
        )
      );

      setReportingCheckId(null);
      setSelectedIssueType('');
      setIssueDescription('');
      alert('✅ Issue reported. Our team will review it shortly');
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

  const pendingChecks = checks.filter((c) => !c.response_received_at);
  const completedChecks = checks.filter((c) => c.response_received_at);

  const fireDoLChecks = checks.filter((c) => c.check_type === 'fire_door');
  const smokeAlarmChecks = checks.filter((c) => c.check_type === 'smoke_alarm');

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
        <h1 className="text-3xl font-bold text-neutral-900 mb-sm">Safety Checks</h1>
        <p className="text-sm text-neutral-600 mb-lg">
          Monthly checks on fire doors and smoke alarms help keep your home safe.
        </p>

        {/* Pending Checks */}
        {pendingChecks.length > 0 && (
          <section className="mb-3xl">
            <h2 className="text-lg font-bold text-neutral-900 mb-md">Action Needed</h2>
            <div className="space-y-md">
              {pendingChecks.map((check) => {
                const isFireDoor = check.check_type === 'fire_door';
                return (
                  <div
                    key={check.id}
                    className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-lg"
                  >
                    <h3 className="text-lg font-bold text-neutral-900 mb-sm">
                      {isFireDoor ? '🚪 Fire Door Check' : '🚨 Smoke Alarm Check'}
                    </h3>
                    <p className="text-sm text-neutral-600 mb-md">
                      {isFireDoor
                        ? "Please check that your room's fire door closes properly and latches securely."
                        : "Please test your smoke alarm and ensure it's working properly."}
                    </p>

                    {reportingCheckId === check.id ? (
                      <div className="space-y-md mt-md pt-md border-t border-blue-200">
                        <div>
                          <label className="text-xs font-semibold text-neutral-600 mb-xs block">
                            Issue Type
                          </label>
                          <select
                            value={selectedIssueType}
                            onChange={(e) => setSelectedIssueType(e.target.value)}
                            className="w-full rounded-lg border border-neutral-300 px-md py-md text-base"
                          >
                            <option value="">Select an issue...</option>
                            {issueTypes
                              .filter((i) => i.category === check.check_type)
                              .map((issue) => (
                                <option key={issue.issue_key} value={issue.issue_key}>
                                  {issue.display_name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-neutral-600 mb-xs block">
                            Describe the Issue
                          </label>
                          <textarea
                            value={issueDescription}
                            onChange={(e) => setIssueDescription(e.target.value)}
                            placeholder="e.g., The door doesn't close smoothly"
                            className="w-full rounded-lg border border-neutral-300 px-md py-md text-base"
                            rows={3}
                          />
                        </div>

                        <div className="flex gap-sm">
                          <button
                            onClick={handleReportIssue}
                            disabled={submitting}
                            className="flex-1 rounded-lg bg-blue-600 py-md font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {submitting ? 'Submitting...' : 'Submit Issue'}
                          </button>
                          <button
                            onClick={() => setReportingCheckId(null)}
                            className="flex-1 rounded-lg border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-sm mt-md">
                        <button
                          onClick={() => handleCheckConfirmed(check.id)}
                          className="flex-1 rounded-lg bg-green-600 py-md font-semibold text-white hover:bg-green-700"
                        >
                          ✓ All Good
                        </button>
                        <button
                          onClick={() => {
                            setReportingCheckId(check.id);
                            setSelectedIssueType('');
                            setIssueDescription('');
                          }}
                          className="flex-1 rounded-lg border border-orange-300 bg-orange-50 py-md font-semibold text-orange-900 hover:bg-orange-100"
                        >
                          ⚠️ There's an Issue
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {pendingChecks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center mb-3xl">
            <p className="text-sm text-neutral-600">No pending checks right now</p>
          </div>
        )}

        {/* Completed Checks */}
        {completedChecks.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-neutral-900 mb-md">Check History</h2>
            <div className="space-y-md">
              {completedChecks.map((check) => (
                <div key={check.id} className="rounded-lg border border-neutral-200 bg-white p-md">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-neutral-900">
                        {check.check_type === 'fire_door' ? '🚪 Fire Door' : '🚨 Smoke Alarm'}
                      </h3>
                      <p className="text-sm text-neutral-600 mt-xs">
                        {new Date(check.request_sent_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      {check.tenant_response === 'issue_reported' && (
                        <div className="mt-sm pt-sm border-t border-neutral-200">
                          <p className="text-xs font-semibold text-orange-900">
                            Issue: {issueTypes.find((i) => i.issue_key === check.issue_type)?.display_name}
                          </p>
                          <p className="text-xs text-neutral-600 mt-xs">{check.issue_description}</p>
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold px-md py-xs rounded ${
                        check.tenant_response === 'confirmed_ok'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {check.tenant_response === 'confirmed_ok' ? '✓ Confirmed' : '⚠️ Issue'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
