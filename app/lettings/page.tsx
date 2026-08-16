'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AppBar from '@/components/AppBar';

interface AvailableRoom {
  id: string;
  name: string;
  property_id: string;
  property_name: string;
  property_address: string;
  current_asking_rent: number | null;
  available_date: string | null;
}

interface Viewing {
  id: string;
  room_id: string;
  viewing_date: string;
  viewing_slot: string;
  visitor_name: string;
  viewing_status: string;
}

const todayISO = () => new Date().toISOString().split('T')[0];

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  const isToday = iso === todayISO();
  const tomorrow = new Date(t.getTime() + 86400000).toISOString().split('T')[0];
  if (isToday) return 'Today';
  if (iso === tomorrow) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const getWeekData = () => {
  const today = new Date();
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const iso = d.toISOString().split('T')[0];
    week.push({ iso, d });
  }
  return week;
};

export default function LettingsDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [showBookViewingModal, setShowBookViewingModal] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedViewing, setSelectedViewing] = useState<Viewing | null>(null);
  const [showViewingDetails, setShowViewingDetails] = useState(false);
  const [isEditingViewing, setIsEditingViewing] = useState(false);
  const [editingViewingForm, setEditingViewingForm] = useState({
    date: '',
    slot: '',
    visitor_name: '',
  });
  const [showSmsPrompt, setShowSmsPrompt] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const [lastBookedViewing, setLastBookedViewing] = useState<any>(null);

  const [bookingForm, setBookingForm] = useState({
    date: '',
    slot: '',
    visitor_name: '',
    visitor_email: '',
    visitor_phone: '',
    notes: '',
  });

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'lettings') {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      // Fetch available rooms
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, name, property_id, current_asking_rent, available_date, properties(name, address)')
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
        }));
        setAvailableRooms(transformed);
      }

      // Fetch upcoming viewings
      const { data: viewingsData } = await supabase
        .from('viewings')
        .select('id, room_id, viewing_date, viewing_slot, visitor_name, viewing_status')
        .eq('viewing_status', 'scheduled')
        .gte('viewing_date', todayISO())
        .order('viewing_date', { ascending: true })
        .limit(10);

      setViewings(viewingsData || []);
      setLoading(false);
    }
    init();
  }, [router]);

  const handleUpdateViewing = async () => {
    if (!selectedViewing || !editingViewingForm.visitor_name.trim()) {
      alert('Please fill in required fields');
      return;
    }

    try {
      const response = await fetch(`/api/viewings/${selectedViewing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewing_date: editingViewingForm.date,
          viewing_slot: editingViewingForm.slot,
          visitor_name: editingViewingForm.visitor_name,
        }),
      });

      if (!response.ok) throw new Error('Failed to update viewing');

      // Refresh viewings list
      const supabase = createClient();
      const { data: viewingsData } = await supabase
        .from('viewings')
        .select('id, room_id, viewing_date, viewing_slot, visitor_name, viewing_status')
        .eq('viewing_status', 'scheduled')
        .gte('viewing_date', todayISO());

      if (viewingsData) {
        setViewings(viewingsData);
      }

      setIsEditingViewing(false);
      setShowViewingDetails(false);
      alert('Viewing updated successfully');
    } catch (error) {
      alert('Error updating viewing');
      console.error(error);
    }
  };

  const handleSendSms = async () => {
    if (!smsPhone.trim() || !lastBookedViewing) {
      alert('Please enter a phone number');
      return;
    }

    try {
      const response = await fetch('/api/sms/send-viewing-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: smsPhone,
          visitorName: lastBookedViewing.visitor_name,
          viewingDate: lastBookedViewing.viewing_date,
          viewingTime: lastBookedViewing.viewing_slot,
        }),
      });

      if (!response.ok) throw new Error('Failed to send SMS');

      alert('✅ Viewing booked and SMS confirmation sent');
      setShowSmsPrompt(false);
      setLastBookedViewing(null);
      setSmsPhone('');
    } catch (error) {
      alert('Error sending SMS: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleBookViewing = async () => {
    if (!selectedRoomId || !selectedPropertyId || !bookingForm.date || !bookingForm.slot || !bookingForm.visitor_name) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const supabase = createClient();
      const { data: inserted, error } = await supabase
        .from('viewings')
        .insert([
          {
            room_id: selectedRoomId,
            viewing_date: bookingForm.date,
            viewing_slot: bookingForm.slot,
            visitor_name: bookingForm.visitor_name,
            visitor_email: bookingForm.visitor_email || null,
            visitor_phone: bookingForm.visitor_phone || null,
            viewing_status: 'scheduled',
            feedback: bookingForm.notes || null,
          },
        ])
        .select();

      if (error) throw error;

      // Send notifications
      if (inserted?.[0]) {
        await fetch('/api/notify-viewing-scheduled', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewingId: inserted[0].id }),
        });
      }

      // Refresh viewings
      const { data: refreshed } = await supabase
        .from('viewings')
        .select('id, room_id, viewing_date, viewing_slot, visitor_name, viewing_status')
        .eq('viewing_status', 'scheduled')
        .gte('viewing_date', todayISO())
        .order('viewing_date', { ascending: true })
        .limit(10);

      setViewings(refreshed || []);
      setShowBookViewingModal(false);

      // Show SMS prompt
      if (inserted?.[0]) {
        setLastBookedViewing({
          id: inserted[0].id,
          visitor_name: bookingForm.visitor_name,
          visitor_email: bookingForm.visitor_email,
          viewing_date: bookingForm.date,
          viewing_slot: bookingForm.slot,
        });
        setSmsPhone(bookingForm.visitor_phone || '');
        setShowSmsPrompt(true);
      }

      setSelectedRoomId(null);
      setSelectedPropertyId(null);
      setBookingForm({ date: '', slot: '', visitor_name: '', visitor_email: '', visitor_phone: '', notes: '' });
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    return {
      iso,
      d,
      count: viewings.filter((v) => v.viewing_date === iso).length,
    };
  });

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <button
            onClick={async () => {
              const { signOut } = await import('@/lib/auth');
              await signOut();
              router.push('/login');
            }}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-7xl px-lg py-lg">
        <div className="flex items-center justify-between mb-lg">
          <h1 className="text-3xl font-bold text-neutral-900">Lettings Dashboard</h1>
          <button
            onClick={() => {
              setSelectedRoomId(null);
              setSelectedPropertyId(null);
              setBookingForm({ date: '', slot: '', visitor_name: '', visitor_email: '', visitor_phone: '', notes: '' });
              setShowBookViewingModal(true);
            }}
            className="px-lg py-md bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-800 transition-colors"
          >
            ➕ Add Viewing
          </button>
        </div>

        {/* DIARY / UPCOMING VIEWINGS */}
        <div className="mb-3xl">
          <h2 className="text-2xl font-bold text-neutral-900 mb-md">📅 Upcoming Viewings</h2>
          {viewings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No viewings scheduled</p>
            </div>
          ) : (
            <div className="space-y-sm">
              {viewings.map((viewing) => (
                <div
                  key={viewing.id}
                  onClick={() => {
                    setSelectedViewing(viewing);
                    setShowViewingDetails(true);
                  }}
                  className="rounded-lg border border-neutral-200 bg-white p-md cursor-pointer hover:border-neutral-900 hover:shadow-md transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-neutral-900">{viewing.visitor_name}</p>
                      <p className="text-sm text-neutral-600">
                        {dayLabel(viewing.viewing_date)} at {viewing.viewing_slot}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-md py-xs bg-neutral-100 rounded text-neutral-600">
                      {viewing.viewing_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CALENDAR WEEK VIEW */}
        <div className="mb-3xl">
          <h2 className="text-2xl font-bold text-neutral-900 mb-md">Diary</h2>
          <div className="flex gap-xs overflow-x-auto">
            {week.map((d) => {
              const isToday = d.iso === todayISO();
              const dayViewings = viewings.filter((v) => v.viewing_date === d.iso);
              const isExpanded = expandedDay === d.iso;
              return (
                <div key={d.iso}>
                  <div
                    onClick={() => setExpandedDay(isExpanded ? null : d.iso)}
                    className={`min-w-[100px] rounded-xl px-sm py-md text-center transition-all cursor-pointer hover:shadow-md ${
                      isToday ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900 border border-neutral-200'
                    } ${isExpanded ? 'ring-2 ring-neutral-900' : ''}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide">{d.d.toLocaleDateString('en-GB', { weekday: 'short' })}</p>
                    <p className="text-lg font-bold mt-xs">{d.d.getDate()}</p>
                    {dayViewings.length > 0 && (
                      <p className="text-xs mt-sm font-semibold">{dayViewings.length} viewing{dayViewings.length > 1 ? 's' : ''}</p>
                    )}
                  </div>
                  {isExpanded && dayViewings.length === 0 && (
                    <div className="mt-md text-center text-xs text-neutral-500 min-w-[100px]">No viewings</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* EXPANDED DAY DETAILS */}
          {expandedDay && (
            <div className="mt-lg rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <div className="flex items-center justify-between mb-lg">
                <h3 className="text-lg font-bold text-neutral-900">
                  {new Date(expandedDay).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </h3>
                <button
                  onClick={() => setExpandedDay(null)}
                  className="text-lg font-bold text-neutral-400 hover:text-neutral-900"
                >
                  ✕
                </button>
              </div>

              {viewings.filter((v) => v.viewing_date === expandedDay).length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-lg">No viewings scheduled for this day</p>
              ) : (
                <div className="space-y-md">
                  {viewings
                    .filter((v) => v.viewing_date === expandedDay)
                    .map((viewing) => (
                      <div
                        key={viewing.id}
                        onClick={() => {
                          setSelectedViewing(viewing);
                          setShowViewingDetails(true);
                        }}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 p-md cursor-pointer hover:border-neutral-900 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-neutral-900">{viewing.visitor_name}</p>
                            <p className="text-sm text-neutral-600 mt-xs">🕐 {viewing.viewing_slot}</p>
                            <p className="text-xs text-neutral-500 mt-sm">Click to view details or edit</p>
                          </div>
                          <span className="text-xs font-semibold px-md py-xs bg-white border border-neutral-300 rounded text-neutral-600">
                            {viewing.viewing_status}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* AVAILABLE SECTION */}
        <div className="mb-3xl">
          <div className="flex items-center justify-between mb-md">
            <h2 className="text-2xl font-bold text-neutral-900">Available</h2>
            <span className="text-sm text-neutral-600">
              {availableRooms.length} room{availableRooms.length !== 1 ? 's' : ''} available
            </span>
          </div>

          {availableRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No rooms currently available for letting</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Address</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Date Available</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Rent (£pcm)</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRooms.map((room, idx) => (
                    <tr key={room.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-lg py-md text-sm text-neutral-900">
                        <p className="font-medium">{room.name}, {room.property_address}</p>
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{formatDate(room.available_date)}</td>
                      <td className="px-lg py-md text-sm font-medium text-neutral-900">
                        £{room.current_asking_rent?.toLocaleString() || '-'}
                      </td>
                      <td className="px-lg py-md text-sm">
                        <button
                          onClick={() => {
                            setSelectedRoomId(room.id);
                            setSelectedPropertyId(room.property_id);
                            setShowBookViewingModal(true);
                          }}
                          className="px-md py-sm bg-neutral-900 text-white rounded font-semibold text-xs hover:bg-neutral-800"
                        >
                          Book Viewing
                        </button>
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
            <h2 className="text-2xl font-bold text-neutral-900">Let</h2>
            <span className="text-sm text-neutral-600">Applications in progress</span>
          </div>

          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No applications in progress</p>
            <p className="text-xs text-neutral-400 mt-md">Applications will appear here as you progress through referencing</p>
          </div>
        </div>

        {/* BOOK VIEWING MODAL */}
        {showBookViewingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-3xl bg-white p-lg max-w-md w-full mx-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-neutral-900 mb-lg">Book Viewing</h2>

              <div className="space-y-md">
                {!selectedRoomId && (
                  <select
                    value={selectedRoomId || ''}
                    onChange={(e) => {
                      const roomId = e.target.value;
                      setSelectedRoomId(roomId);
                      const room = availableRooms.find(r => r.id === roomId);
                      if (room) setSelectedPropertyId(room.property_id);
                    }}
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  >
                    <option value="">Select room...</option>
                    {availableRooms.map(room => (
                      <option key={room.id} value={room.id}>
                        {room.name}, {room.property_address}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="date"
                  value={bookingForm.date}
                  onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })}
                  min={todayISO()}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                />

                <select
                  value={bookingForm.slot}
                  onChange={(e) => setBookingForm({ ...bookingForm, slot: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                >
                  <option value="">Choose time...</option>
                  {Array.from({ length: 40 }, (_, i) => {
                    const hour = Math.floor((i * 15) / 60) + 8;
                    const minute = (i * 15) % 60;
                    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                    const period = hour < 12 ? 'am' : 'pm';
                    return (
                      <option key={i} value={timeStr}>
                        {displayHour}:{String(minute).padStart(2, '0')} {period}
                      </option>
                    );
                  })}
                </select>

                <input
                  type="text"
                  placeholder="Visitor name *"
                  value={bookingForm.visitor_name}
                  onChange={(e) => setBookingForm({ ...bookingForm, visitor_name: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                />

                <input
                  type="email"
                  placeholder="Email"
                  value={bookingForm.visitor_email}
                  onChange={(e) => setBookingForm({ ...bookingForm, visitor_email: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                />

                <input
                  type="tel"
                  placeholder="Phone"
                  value={bookingForm.visitor_phone}
                  onChange={(e) => setBookingForm({ ...bookingForm, visitor_phone: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                />

                <textarea
                  placeholder="Notes"
                  value={bookingForm.notes}
                  onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  rows={2}
                />

                <div className="flex gap-sm pt-md">
                  <button
                    onClick={handleBookViewing}
                    className="flex-1 rounded-xl bg-neutral-900 py-md font-bold text-white"
                  >
                    Book Viewing
                  </button>
                  <button
                    onClick={() => setShowBookViewingModal(false)}
                    className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEWING DETAILS MODAL */}
        {showViewingDetails && selectedViewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-3xl bg-white p-lg max-w-md w-full mx-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-lg">
                <h2 className="text-xl font-bold text-neutral-900">
                  {isEditingViewing ? 'Edit Viewing' : 'Viewing Details'}
                </h2>
                <button
                  onClick={() => {
                    setShowViewingDetails(false);
                    setIsEditingViewing(false);
                  }}
                  className="text-2xl font-bold text-neutral-400 hover:text-neutral-900"
                >
                  ×
                </button>
              </div>

              <div className="space-y-md">
                {isEditingViewing ? (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-neutral-600 mb-xs block">Visitor Name</label>
                      <input
                        type="text"
                        value={editingViewingForm.visitor_name}
                        onChange={(e) => setEditingViewingForm({ ...editingViewingForm, visitor_name: e.target.value })}
                        className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-neutral-600 mb-xs block">Date</label>
                      <input
                        type="date"
                        value={editingViewingForm.date}
                        onChange={(e) => setEditingViewingForm({ ...editingViewingForm, date: e.target.value })}
                        className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-neutral-600 mb-xs block">Time</label>
                      <select
                        value={editingViewingForm.slot}
                        onChange={(e) => setEditingViewingForm({ ...editingViewingForm, slot: e.target.value })}
                        className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                      >
                        <option value="">Choose time...</option>
                        {Array.from({ length: 40 }, (_, i) => {
                          const hour = Math.floor((i * 15) / 60) + 8;
                          const minute = (i * 15) % 60;
                          const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                          const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                          const period = hour < 12 ? 'am' : 'pm';
                          return (
                            <option key={i} value={timeStr}>
                              {displayHour}:{String(minute).padStart(2, '0')} {period}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-neutral-50 p-md rounded-xl">
                      <p className="text-xs text-neutral-600 mb-xs">VISITOR</p>
                      <p className="font-semibold text-neutral-900">{selectedViewing.visitor_name}</p>
                    </div>

                    <div className="bg-neutral-50 p-md rounded-xl">
                      <p className="text-xs text-neutral-600 mb-xs">SCHEDULED</p>
                      <p className="font-semibold text-neutral-900">
                        {dayLabel(selectedViewing.viewing_date)} at {selectedViewing.viewing_slot}
                      </p>
                      <p className="text-sm text-neutral-600 mt-xs">{formatDate(selectedViewing.viewing_date)}</p>
                    </div>

                    <div className="bg-neutral-50 p-md rounded-xl">
                      <p className="text-xs text-neutral-600 mb-xs">STATUS</p>
                      <div className="flex items-center gap-sm">
                        <span className="px-md py-xs bg-white border border-neutral-300 rounded text-sm font-semibold text-neutral-900">
                          {selectedViewing.viewing_status}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-sm pt-md">
                  {isEditingViewing ? (
                    <>
                      <button
                        onClick={handleUpdateViewing}
                        className="flex-1 rounded-xl bg-neutral-900 py-md font-semibold text-white hover:bg-neutral-800"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingViewing(false)}
                        className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingViewingForm({
                            date: selectedViewing.viewing_date,
                            slot: selectedViewing.viewing_slot,
                            visitor_name: selectedViewing.visitor_name,
                          });
                          setIsEditingViewing(true);
                        }}
                        className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setShowViewingDetails(false)}
                        className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                      >
                        Close
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SMS CONFIRMATION PROMPT */}
        {showSmsPrompt && lastBookedViewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-3xl bg-white p-lg max-w-md w-full mx-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-lg">Send Confirmation SMS?</h2>

              <div className="space-y-md">
                <p className="text-sm text-neutral-600">
                  Send {lastBookedViewing.visitor_name} a text confirmation of their viewing?
                </p>

                <div className="bg-neutral-50 p-md rounded-xl text-sm">
                  <p className="text-neutral-600 mb-xs">Viewing Details:</p>
                  <p className="font-semibold text-neutral-900">{dayLabel(lastBookedViewing.viewing_date)} at {lastBookedViewing.viewing_slot}</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-600 mb-xs block">Phone Number</label>
                  <input
                    type="tel"
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    placeholder="+44 7..."
                    className="w-full rounded-xl border border-neutral-300 px-md py-md text-base"
                  />
                </div>

                <div className="flex gap-sm pt-md">
                  <button
                    onClick={handleSendSms}
                    className="flex-1 rounded-xl bg-neutral-900 py-md font-semibold text-white hover:bg-neutral-800"
                  >
                    Send SMS
                  </button>
                  <button
                    onClick={() => {
                      setShowSmsPrompt(false);
                      setLastBookedViewing(null);
                      alert('✅ Viewing booked (SMS skipped)');
                    }}
                    className="flex-1 rounded-xl border border-neutral-300 py-md font-semibold hover:bg-neutral-50"
                  >
                    Skip
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
