'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AppBar from '@/components/AppBar'
import Link from 'next/link';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface AvailableRoom {
  id: string;
  name: string;
  property_id: string;
  property_name: string;
  property_address: string;
  current_asking_rent: number | null;
  available_date: string | null;
  marketing_status: string;
  days_on_market: number | null;
}

interface Application {
  id: string;
  room_id: string;
  property_name: string;
  property_address: string;
  room_name: string;
  visitor_name: string;
  visitor_email: string | null;
  visitor_phone: string | null;
  status: string; // 'referencing', 'provisional', 'agreed_rent', 'ready_to_move'
  proposed_rent?: number;
  proposed_move_in?: string;
  deposit_paid?: boolean;
  lease_end_date?: string;
  notes?: string;
}

export default function AvailableAndLettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      // Fetch available rooms sorted by date
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, name, property_id, current_asking_rent, available_date, marketing_status, days_on_market, properties(name, address)')
        .eq('status', 'available')
        .order('available_date', { ascending: true });

      if (roomsData) {
        const transformed = roomsData.map((room: any) => ({
          id: room.id,
          name: room.name,
          property_id: room.property_id,
          property_name: room.properties?.name || 'Unknown',
          property_address: room.properties?.address || '',
          current_asking_rent: room.current_asking_rent,
          available_date: room.available_date,
          marketing_status: room.marketing_status,
          days_on_market: room.days_on_market,
        }));
        setAvailableRooms(transformed);
      }

      // For now, applications would come from a separate system
      // This is placeholder for future integration
      setApplications([]);

      setLoading(false);
    }
    init();
  }, [router]);

  if (loading) return <GenericPageSkeleton />;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-7xl px-lg py-lg">
        <h1 className="text-3xl font-bold text-neutral-900 mb-lg">Available & Lettings</h1>

        {/* AVAILABLE SECTION */}
        <div className="mb-3xl">
          <div className="flex items-center justify-between mb-md">
            <h2 className="text-2xl font-bold text-neutral-900">AVAILABLE</h2>
            <span className="text-sm text-neutral-600">
              {availableRooms.length} room{availableRooms.length !== 1 ? 's' : ''} available
            </span>
          </div>

          {availableRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No available rooms</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Address</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Date Available</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Rent Amount (£pcm)</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Marketed?</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Needs Photos?</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Under Offer</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Maintenance Required</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRooms.map((room, idx) => (
                    <tr key={room.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-lg py-md text-sm text-neutral-900">
                        <div>
                          <p className="font-medium">{room.name}, {room.property_address}</p>
                        </div>
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{formatDate(room.available_date)}</td>
                      <td className="px-lg py-md text-sm font-medium text-neutral-900">
                        £{room.current_asking_rent?.toLocaleString() || '-'}
                      </td>
                      <td className="px-lg py-md text-sm text-center">
                        <input type="checkbox" className="w-4 h-4" />
                      </td>
                      <td className="px-lg py-md text-sm text-center">
                        <input type="checkbox" className="w-4 h-4" />
                      </td>
                      <td className="px-lg py-md text-sm text-center">
                        <input type="checkbox" className="w-4 h-4" />
                      </td>
                      <td className="px-lg py-md text-sm text-center">
                        <input type="checkbox" className="w-4 h-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* LET SECTION */}
        <div>
          <div className="flex items-center justify-between mb-md">
            <h2 className="text-2xl font-bold text-neutral-900">LET</h2>
            <span className="text-sm text-neutral-600">
              {applications.length} application{applications.length !== 1 ? 's' : ''} in progress
            </span>
          </div>

          {applications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No applications in progress</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Address</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Tenant Name</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Move-in Date</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Rent Amount (£)</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Deposit Paid</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Lease End Date</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Contact Number</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Applications would be listed here */}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
