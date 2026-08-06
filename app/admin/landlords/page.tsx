'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface Landlord {
  id: string;
  email: string;
  name?: string;
  created_at: string;
  properties?: Array<{ id: string; name: string; address: string }>;
}

export default function LandlordsPage() {
  const router = useRouter();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    selectedProperties: [] as string[],
  });

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator') {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      // Get landlords
      const { data: landlordData } = await supabase
        .from('people')
        .select('id, email, name, created_at')
        .eq('role', 'landlord')
        .order('created_at', { ascending: false });

      setLandlords(landlordData || []);

      // Get properties
      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name, address, bedrooms')
        .order('name');

      setProperties(propsData || []);
      setLoading(false);
    }
    init();
  }, [router]);

  async function handleInviteLandlord() {
    if (!formData.email || !formData.name) {
      alert('Please fill in email and name');
      return;
    }

    if (formData.selectedProperties.length === 0) {
      alert('Please select at least one property');
      return;
    }

    const supabase = createClient();

    // Create landlord in people table
    const { data: landlord, error } = await supabase
      .from('people')
      .insert({
        email: formData.email,
        name: formData.name,
        role: 'landlord',
      })
      .select()
      .single();

    if (error) {
      alert(`Error creating landlord: ${error.message}`);
      return;
    }

    // Assign properties to landlord
    for (const propertyId of formData.selectedProperties) {
      await supabase
        .from('landlord_properties')
        .insert({
          landlord_id: landlord.id,
          property_id: propertyId,
        })
        .single();
    }

    setSuccessMessage(`✓ Landlord added! Email: ${formData.email}`);
    setFormData({ email: '', name: '', selectedProperties: [] });
    setShowInviteForm(false);

    // Refresh landlords list
    const { data: landlordData } = await supabase
      .from('people')
      .select('id, email, name, created_at')
      .eq('role', 'landlord')
      .order('created_at', { ascending: false });

    setLandlords(landlordData || []);

    setTimeout(() => setSuccessMessage(''), 3000);
  }

  const togglePropertySelection = (propertyId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedProperties: prev.selectedProperties.includes(propertyId)
        ? prev.selectedProperties.filter((id) => id !== propertyId)
        : [...prev.selectedProperties, propertyId],
    }));
  };

  if (loading) return <GenericPageSkeleton />;

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <div className="flex items-center gap-md">
            <Link href="/admin" className="shrink-0 hover:opacity-80">
              Dashboard
            </Link>
          </div>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="mb-3xl flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Landlords</h1>
            <p className="mt-sm text-sm text-neutral-600">Add and manage landlords with their properties</p>
          </div>
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
          >
            + Add Landlord
          </button>
        </div>

        {successMessage && (
          <div className="mb-lg rounded-xl bg-green-100 p-md text-sm text-green-700 font-semibold">
            {successMessage}
          </div>
        )}

        {/* Add Landlord Form */}
        {showInviteForm && (
          <div className="mb-3xl rounded-2xl border-2 border-neutral-900 bg-white p-lg">
            <h2 className="text-lg font-bold text-neutral-900 mb-md">Add New Landlord</h2>

            <div className="grid gap-md md:grid-cols-2 mb-md">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Email</label>
                <input
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                />
              </div>
            </div>

            <div className="mb-md">
              <label className="block text-xs font-semibold text-neutral-700 mb-md">Select Properties</label>
              <div className="grid gap-sm md:grid-cols-2">
                {properties.map((prop) => (
                  <label
                    key={prop.id}
                    className="flex items-start gap-sm p-md border border-neutral-200 rounded-lg cursor-pointer hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={formData.selectedProperties.includes(prop.id)}
                      onChange={() => togglePropertySelection(prop.id)}
                      className="mt-xs"
                    />
                    <div>
                      <p className="font-semibold text-sm text-neutral-900">{prop.name}</p>
                      <p className="text-xs text-neutral-600">{prop.address}</p>
                      <p className="text-xs text-neutral-500 mt-xs">{prop.bedrooms} bed HMO</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-neutral-500 mt-md">
                {formData.selectedProperties.length} properties selected
              </p>
            </div>

            <div className="flex gap-md">
              <button
                onClick={handleInviteLandlord}
                className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-800"
              >
                Add Landlord
              </button>
              <button
                onClick={() => setShowInviteForm(false)}
                className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Landlords List */}
        {landlords.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No landlords added yet</p>
          </div>
        ) : (
          <div className="space-y-md">
            {landlords.map((landlord) => (
              <div
                key={landlord.id}
                className="rounded-2xl border border-neutral-200 bg-white p-lg hover:border-neutral-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-neutral-900">{landlord.name || landlord.email}</h3>
                    <p className="text-sm text-neutral-600">{landlord.email}</p>
                    <p className="text-xs text-neutral-500 mt-sm">
                      Invited {new Date(landlord.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-neutral-700 bg-neutral-100 px-md py-xs rounded-full">
                    Landlord
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
