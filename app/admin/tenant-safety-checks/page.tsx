'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import AppBar from '@/components/AppBar';
import Link from 'next/link';

interface TenantSelfCheck {
  id: string;
  tenancy_id: string;
  property_id: string;
  room_id: string;
  check_type: 'fire_door' | 'smoke_alarm';
  frequency: string;
  request_sent_at: string;
  response_received_at: string | null;
  tenant_response: string | null;
  issue_type: string | null;
  issue_description: string | null;
  tenancies?: { tenant_id: string; people?: { full_name: string } } | null;
  properties?: { name: string; address: string } | null;
  rooms?: { name: string } | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
}

interface IssueType {
  issue_key: string;
  display_name: string;
  category: string;
}

export default function TenantSafetyChecksPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [checks, setChecks] = useState<TenantSelfCheck[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed' | 'issues'>('all');

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      // Load properties
      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name, address')
        .order('name');

      setProperties(propsData || []);
      if (propsData?.[0]) {
        setSelectedProperty(propsData[0].id);
        await loadChecks(propsData[0].id);
      }

      // Load issue types
      const { data: issues } = await supabase.from('tenant_self_check_issues').select('*');
      setIssueTypes(issues || []);

      setLoading(false);
    }

    init();
  }, [router]);

  async function loadChecks(propertyId: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('tenant_self_checks')
        .select(
          `
          *,
          tenancies(
            id,
            tenant_id,
            people:tenant_id(full_name)
          ),
          properties(name, address),
          rooms(name)
        `
        )
        .eq('property_id', propertyId)
        .order('request_sent_at', { ascending: false });

      setChecks(data || []);
    } catch (error) {
      console.error('Failed to load checks:', error);
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

  // Apply filters
  let filtered = checks;
  if (filterStatus === 'pending') {
    filtered = checks.filter((c) => !c.response_received_at);
  } else if (filterStatus === 'completed') {
    filtered = checks.filter((c) => c.response_received_at && c.tenant_response === 'confirmed_ok');
  } else if (filterStatus === 'issues') {
    filtered = checks.filter((c) => c.tenant_response === 'issue_reported');
  }

  const fireDoLChecks = filtered.filter((c) => c.check_type === 'fire_door');
  const smokeAlarmChecks = filtered.filter((c) => c.check_type === 'smoke_alarm');

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <Link href="/admin" className="text-sm font-bold text-neutral-600 hover:text-neutral-900">
            ← Back
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="mb-lg">
          <h1 className="text-3xl font-bold text-neutral-900">Tenant Safety Checks</h1>
          <p className="text-sm text-neutral-600 mt-sm">
            Monthly fire door and smoke alarm checks reported by tenants
          </p>
        </div>

        {/* Property selector */}
        <div className="mb-lg">
          <select
            value={selectedProperty}
            onChange={(e) => {
              setSelectedProperty(e.target.value);
              loadChecks(e.target.value);
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

        {/* Filter buttons */}
        <div className="mb-lg flex gap-sm flex-wrap">
          {(['all', 'pending', 'completed', 'issues'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-md py-sm rounded-lg font-semibold text-sm transition-colors ${
                filterStatus === status
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {status === 'all' && 'All Checks'}
              {status === 'pending' && 'Pending'}
              {status === 'completed' && 'Confirmed OK'}
              {status === 'issues' && 'Issues Reported'}
            </button>
          ))}
        </div>

        {/* Fire Door Checks */}
        <section className="mb-3xl">
          <h2 className="text-2xl font-bold text-neutral-900 mb-md">🚪 Fire Door Checks</h2>
          {fireDoLChecks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No fire door checks</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Tenant</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Room</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Request Date</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Response</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {fireDoLChecks.map((check, idx) => (
                    <tr key={check.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-lg py-md text-sm text-neutral-900">
                        {check.tenancies?.people?.full_name || 'Unknown'}
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{check.rooms?.name}</td>
                      <td className="px-lg py-md text-sm text-neutral-600">
                        {new Date(check.request_sent_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-lg py-md text-sm">
                        {!check.response_received_at ? (
                          <span className="inline-block px-md py-xs rounded-full bg-yellow-100 text-yellow-800 font-semibold text-xs">
                            Pending
                          </span>
                        ) : check.tenant_response === 'confirmed_ok' ? (
                          <span className="inline-block px-md py-xs rounded-full bg-green-100 text-green-800 font-semibold text-xs">
                            ✓ OK
                          </span>
                        ) : (
                          <span className="inline-block px-md py-xs rounded-full bg-orange-100 text-orange-800 font-semibold text-xs">
                            ⚠️ Issue
                          </span>
                        )}
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">
                        {check.tenant_response === 'issue_reported' && (
                          <span>
                            {issueTypes.find((i) => i.issue_key === check.issue_type)?.display_name}
                          </span>
                        )}
                      </td>
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
          {smokeAlarmChecks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No smoke alarm checks</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Tenant</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Room</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Request Date</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Response</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {smokeAlarmChecks.map((check, idx) => (
                    <tr key={check.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-lg py-md text-sm text-neutral-900">
                        {check.tenancies?.people?.full_name || 'Unknown'}
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{check.rooms?.name}</td>
                      <td className="px-lg py-md text-sm text-neutral-600">
                        {new Date(check.request_sent_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-lg py-md text-sm">
                        {!check.response_received_at ? (
                          <span className="inline-block px-md py-xs rounded-full bg-yellow-100 text-yellow-800 font-semibold text-xs">
                            Pending
                          </span>
                        ) : check.tenant_response === 'confirmed_ok' ? (
                          <span className="inline-block px-md py-xs rounded-full bg-green-100 text-green-800 font-semibold text-xs">
                            ✓ OK
                          </span>
                        ) : (
                          <span className="inline-block px-md py-xs rounded-full bg-orange-100 text-orange-800 font-semibold text-xs">
                            ⚠️ Issue
                          </span>
                        )}
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">
                        {check.tenant_response === 'issue_reported' && (
                          <span>
                            {issueTypes.find((i) => i.issue_key === check.issue_type)?.display_name}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
