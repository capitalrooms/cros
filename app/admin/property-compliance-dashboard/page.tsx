'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PropertyComplianceData {
  property_id: string;
  property_name: string;
  total_checks_sent: number;
  checks_completed: number;
  checks_ok: number;
  issues_reported: number;
  checks_pending: number;
  last_check_sent: string;
  photos_received: number;
}

interface RoomCheckStatus {
  room_name: string;
  tenant_name: string;
  fire_door_status: 'ok' | 'issue' | 'pending' | 'none';
  smoke_alarm_status: 'ok' | 'issue' | 'pending' | 'none';
  fire_door_month: string | null;
  smoke_alarm_month: string | null;
  fire_door_photo: boolean;
  smoke_alarm_photo: boolean;
}

export default function PropertyComplianceDashboard() {
  const [properties, setProperties] = useState<PropertyComplianceData[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomCheckStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBulkRequest, setShowBulkRequest] = useState(false);
  const [bulkRequestType, setBulkRequestType] = useState<'fire_door' | 'smoke_alarm'>('fire_door');
  const [bulkRequestDeadline, setBulkRequestDeadline] = useState('');
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadComplianceData();
  }, []);

  async function loadComplianceData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Verify admin role
      const { data: person } = await supabase
        .from('people')
        .select('role')
        .eq('auth_id', user.id)
        .single();

      if (person?.role !== 'administrator' && person?.role !== 'admin') {
        router.push('/');
        return;
      }

      // Get property compliance summary
      const { data: propertySummary } = await supabase
        .from('property_compliance_summary')
        .select('*')
        .order('property_name');

      setProperties((propertySummary as any) || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load compliance data:', error);
      setLoading(false);
    }
  }

  async function loadRoomStatus(propertyId: string) {
    try {
      // Get all rooms and tenants at property
      const { data: rooms } = await supabase
        .from('tenancies')
        .select(
          `
          room_id,
          person_id,
          tenant:person_id(name),
          room:room_id(name, property_id)
        `
        )
        .eq('property_id', propertyId)
        .not('end_date', 'is', null)
        .or('end_date.gte.' + new Date().toISOString().split('T')[0]);

      if (!rooms) return;

      // Get check status for each room
      const statusData: RoomCheckStatus[] = [];

      for (const tenancy of rooms) {
        const room = (tenancy as any).room;
        const tenant = (tenancy as any).tenant;

        if (!room || !tenant) continue;

        // Get latest fire door check
        const { data: fireChecks } = await supabase
          .from('tenant_self_checks')
          .select('response_received_at, tenant_response, photo_attachment_url, request_sent_at')
          .eq('room_id', room.id)
          .eq('check_type', 'fire_door')
          .order('request_sent_at', { ascending: false })
          .limit(1)
          .single();

        // Get latest smoke alarm check
        const { data: smokeChecks } = await supabase
          .from('tenant_self_checks')
          .select('response_received_at, tenant_response, photo_attachment_url, request_sent_at')
          .eq('room_id', room.id)
          .eq('check_type', 'smoke_alarm')
          .order('request_sent_at', { ascending: false })
          .limit(1)
          .single();

        const getStatus = (check: any) => {
          if (!check) return 'none';
          if (!check.response_received_at) return 'pending';
          if (check.tenant_response === 'confirmed_ok') return 'ok';
          if (check.tenant_response === 'issue_reported') return 'issue';
          return 'pending';
        };

        const getMonth = (check: any) => {
          if (!check?.request_sent_at) return null;
          const date = new Date(check.request_sent_at);
          return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
        };

        statusData.push({
          room_name: room.name,
          tenant_name: tenant.name,
          fire_door_status: getStatus(fireChecks) as any,
          smoke_alarm_status: getStatus(smokeChecks) as any,
          fire_door_month: getMonth(fireChecks),
          smoke_alarm_month: getMonth(smokeChecks),
          fire_door_photo: !!fireChecks?.photo_attachment_url,
          smoke_alarm_photo: !!smokeChecks?.photo_attachment_url,
        });
      }

      setRoomStatus(statusData);
    } catch (error) {
      console.error('Failed to load room status:', error);
    }
  }

  async function handleBulkPhotoRequest() {
    if (!selectedProperty || !bulkRequestDeadline) return;

    setSubmittingBulk(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: person } = await supabase
        .from('people')
        .select('id')
        .eq('auth_id', user.id)
        .single();
      if (!person) throw new Error('User not found');

      // Create bulk photo request
      const { data: request, error: requestError } = await supabase
        .from('property_photo_requests')
        .insert({
          property_id: selectedProperty,
          check_type: bulkRequestType,
          requested_by: person.id,
          request_deadline: bulkRequestDeadline,
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Get all tenants at property
      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('person_id')
        .eq('property_id', selectedProperty)
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString().split('T')[0]}`);

      if (tenancies && tenancies.length > 0) {
        // Send notifications to tenants (via canonical notifications table schema)
        const messages = tenancies.map((t: any) => ({
          user_id: t.person_id,
          title: `📸 Photo Request: ${bulkRequestType === 'fire_door' ? 'Fire Door' : 'Smoke Alarm'}`,
          body: `Please send a photo of your ${bulkRequestType === 'fire_door' ? 'fire door' : 'smoke alarm'} by ${new Date(
            bulkRequestDeadline
          ).toLocaleDateString('en-GB')}. Instructions: Check that it's working properly and takes a photo.`,
          type: 'photo_request',
          link: '/tenant/safety-checks',
          read: false,
        }));

        const { error } = await supabase.from('notifications').insert(messages);
        if (error) console.error('Photo request notification failed:', error);
      }

      alert(`✅ Photo request sent to ${tenancies?.length || 0} tenants`);
      setShowBulkRequest(false);
      setBulkRequestDeadline('');
      loadComplianceData();
    } catch (error) {
      console.error('Failed to send bulk request:', error);
      alert('Failed to send photo request');
    } finally {
      setSubmittingBulk(false);
    }
  }

  if (loading) {
    return <div className="p-lg text-center text-neutral-500">Loading compliance data...</div>;
  }

  const selectedProp = properties.find((p) => p.property_id === selectedProperty);

  return (
    <div className="min-h-screen bg-neutral-100 p-lg">
      <div className="mx-auto max-w-6xl space-y-lg">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Property Compliance Dashboard</h1>
            <p className="text-sm text-neutral-600 mt-xs">
              Fire door & smoke alarm checks organized by property and month
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-neutral-200 px-md py-xs text-sm font-bold text-neutral-900 hover:bg-neutral-300"
          >
            ← Back
          </Link>
        </div>

        {/* Properties List */}
        <div className="space-y-md">
          <h2 className="text-lg font-bold text-neutral-900">Your Properties</h2>
          <div className="grid gap-md">
            {properties.map((prop) => (
              <div
                key={prop.property_id}
                onClick={() => {
                  setSelectedProperty(prop.property_id);
                  loadRoomStatus(prop.property_id);
                }}
                className={`cursor-pointer rounded-2xl border-2 p-lg transition-all ${
                  selectedProperty === prop.property_id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-neutral-200 bg-white hover:border-neutral-400'
                }`}
              >
                <div className="flex items-start justify-between gap-md">
                  <div className="flex-1">
                    <h3 className="font-bold text-neutral-900">{prop.property_name}</h3>
                    <p className="text-sm text-neutral-600 mt-xs">
                      {prop.checks_completed} of {prop.total_checks_sent} checks completed
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-sm text-xs font-bold">
                      <span className="rounded-lg bg-green-100 px-sm py-xs text-green-900">
                        ✅ {prop.checks_ok}
                      </span>
                      <span className="rounded-lg bg-orange-100 px-sm py-xs text-orange-900">
                        ⚠️ {prop.issues_reported}
                      </span>
                      <span className="rounded-lg bg-red-100 px-sm py-xs text-red-900">
                        ⏳ {prop.checks_pending}
                      </span>
                    </div>
                    {prop.last_check_sent && (
                      <p className="text-xs text-neutral-500 mt-xs">
                        Last: {new Date(prop.last_check_sent).toLocaleDateString('en-GB')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Property Detail */}
        {selectedProperty && selectedProp && (
          <div className="space-y-lg rounded-2xl border-2 border-blue-200 bg-blue-50 p-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-900">{selectedProp.property_name} - Room Status</h2>
              <button
                onClick={() => setShowBulkRequest(true)}
                className="rounded-lg bg-orange-600 px-md py-xs text-sm font-bold text-white hover:bg-orange-700"
              >
                📸 Request Photos
              </button>
            </div>

            {/* Room Table */}
            <div className="overflow-x-auto rounded-xl bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-neutral-200 bg-neutral-50">
                    <th className="px-md py-sm text-left text-xs font-bold text-neutral-600">Room</th>
                    <th className="px-md py-sm text-left text-xs font-bold text-neutral-600">Tenant</th>
                    <th className="px-md py-sm text-center text-xs font-bold text-neutral-600">🚪 Fire Door</th>
                    <th className="px-md py-sm text-center text-xs font-bold text-neutral-600">Month</th>
                    <th className="px-md py-sm text-center text-xs font-bold text-neutral-600">📸 Photo</th>
                    <th className="px-md py-sm text-center text-xs font-bold text-neutral-600">🚨 Smoke Alarm</th>
                    <th className="px-md py-sm text-center text-xs font-bold text-neutral-600">Month</th>
                    <th className="px-md py-sm text-center text-xs font-bold text-neutral-600">📸 Photo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {roomStatus.map((room, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50">
                      <td className="px-md py-sm text-sm font-bold text-neutral-900">{room.room_name}</td>
                      <td className="px-md py-sm text-sm text-neutral-600">{room.tenant_name}</td>

                      {/* Fire Door Status */}
                      <td className="px-md py-sm text-center text-sm">
                        {room.fire_door_status === 'ok' && (
                          <span className="inline-block rounded-lg bg-green-100 px-md py-xs text-xs font-bold text-green-900">
                            ✅ OK
                          </span>
                        )}
                        {room.fire_door_status === 'issue' && (
                          <span className="inline-block rounded-lg bg-orange-100 px-md py-xs text-xs font-bold text-orange-900">
                            ⚠️ Issue
                          </span>
                        )}
                        {room.fire_door_status === 'pending' && (
                          <span className="inline-block rounded-lg bg-red-100 px-md py-xs text-xs font-bold text-red-900">
                            ⏳ Pending
                          </span>
                        )}
                        {room.fire_door_status === 'none' && (
                          <span className="inline-block rounded-lg bg-neutral-100 px-md py-xs text-xs font-bold text-neutral-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-md py-sm text-center text-xs text-neutral-600">
                        {room.fire_door_month || '—'}
                      </td>
                      <td className="px-md py-sm text-center text-sm">
                        {room.fire_door_photo ? (
                          <span className="text-lg">📸</span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>

                      {/* Smoke Alarm Status */}
                      <td className="px-md py-sm text-center text-sm">
                        {room.smoke_alarm_status === 'ok' && (
                          <span className="inline-block rounded-lg bg-green-100 px-md py-xs text-xs font-bold text-green-900">
                            ✅ OK
                          </span>
                        )}
                        {room.smoke_alarm_status === 'issue' && (
                          <span className="inline-block rounded-lg bg-orange-100 px-md py-xs text-xs font-bold text-orange-900">
                            ⚠️ Issue
                          </span>
                        )}
                        {room.smoke_alarm_status === 'pending' && (
                          <span className="inline-block rounded-lg bg-red-100 px-md py-xs text-xs font-bold text-red-900">
                            ⏳ Pending
                          </span>
                        )}
                        {room.smoke_alarm_status === 'none' && (
                          <span className="inline-block rounded-lg bg-neutral-100 px-md py-xs text-xs font-bold text-neutral-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-md py-sm text-center text-xs text-neutral-600">
                        {room.smoke_alarm_month || '—'}
                      </td>
                      <td className="px-md py-sm text-center text-sm">
                        {room.smoke_alarm_photo ? (
                          <span className="text-lg">📸</span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {roomStatus.length === 0 && (
              <p className="text-center text-sm text-neutral-500">No active tenancies at this property</p>
            )}
          </div>
        )}

        {/* Bulk Photo Request Modal */}
        {showBulkRequest && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-lg">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl space-y-lg p-lg">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-neutral-900">Request Photos</h2>
                <button
                  onClick={() => setShowBulkRequest(false)}
                  className="text-2xl text-neutral-600 hover:text-neutral-900"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-md">
                <div>
                  <label className="text-sm font-bold text-neutral-900">Check Type</label>
                  <select
                    value={bulkRequestType}
                    onChange={(e) => setBulkRequestType(e.target.value as any)}
                    className="w-full rounded-lg border-2 border-neutral-200 px-md py-xs text-sm mt-xs"
                  >
                    <option value="fire_door">🚪 Fire Door Photo</option>
                    <option value="smoke_alarm">🚨 Smoke Alarm Photo</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold text-neutral-900">
                    Request Deadline (by when should they send?)
                  </label>
                  <input
                    type="date"
                    value={bulkRequestDeadline}
                    onChange={(e) => setBulkRequestDeadline(e.target.value)}
                    className="w-full rounded-lg border-2 border-neutral-200 px-md py-xs text-sm mt-xs"
                  />
                </div>

                <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-md">
                  <p className="text-sm text-blue-900">
                    ℹ️ <strong>All tenants</strong> at {selectedProp?.property_name} will receive a notification
                    asking them to send a photo by the deadline.
                  </p>
                </div>
              </div>

              <div className="flex gap-sm">
                <button
                  onClick={handleBulkPhotoRequest}
                  disabled={submittingBulk || !bulkRequestDeadline}
                  className="flex-1 rounded-lg bg-orange-600 px-md py-sm text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {submittingBulk ? '⏳ Sending...' : '📸 Send Photo Request'}
                </button>
                <button
                  onClick={() => setShowBulkRequest(false)}
                  className="flex-1 rounded-lg border-2 border-neutral-200 px-md py-sm text-sm font-bold text-neutral-600 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
