'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface Contact {
  id: string;
  email: string;
  role: 'contractor' | 'cleaner' | 'landlord';
  phone?: string;
  name?: string;
  property_id?: string;
  created_at: string;
  properties?: { id: string; name: string };
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'contractor' | 'cleaner' | 'landlord'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    phone: '',
    role: 'contractor' as const,
    property_id: '',
  });

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      // Get contacts
      const { data: contactsData } = await supabase
        .from('people')
        .select('*, properties(id, name)')
        .in('role', ['contractor', 'cleaner', 'landlord'])
        .order('role, email');

      setContacts(contactsData || []);

      // Get properties for assignment
      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name')
        .order('name');

      setProperties(propsData || []);
      setLoading(false);
    }
    init();
  }, [router]);

  async function handleAddContact() {
    if (!formData.email || !formData.name || !formData.role) {
      alert('Please fill in email, name, and role');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from('people').insert({
      email: formData.email,
      name: formData.name,
      phone: formData.phone || null,
      role: formData.role,
      property_id: formData.property_id || null,
    });

    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }

    setFormData({ email: '', name: '', phone: '', role: 'contractor', property_id: '' });
    setShowAddForm(false);

    // Refresh contacts
    const { data: contactsData } = await supabase
      .from('people')
      .select('*, properties(id, name)')
      .in('role', ['contractor', 'cleaner', 'landlord'])
      .order('role, email');
    setContacts(contactsData || []);
  }

  async function handleDeleteContact(id: string) {
    if (!confirm('Delete this contact?')) return;

    const supabase = createClient();
    await supabase.from('people').delete().eq('id', id);

    setContacts(contacts.filter((c) => c.id !== id));
  }

  const filteredContacts = filter === 'all' ? contacts : contacts.filter((c) => c.role === filter);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'contractor':
        return 'Contractor';
      case 'cleaner':
        return 'Cleaner';
      case 'landlord':
        return 'Landlord';
      default:
        return role;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'contractor':
        return 'bg-blue-100 text-blue-700';
      case 'cleaner':
        return 'bg-green-100 text-green-700';
      case 'landlord':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) return <GenericPageSkeleton />;

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        left={<BackButton href="/admin" />}
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="mb-3xl flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Contacts</h1>
            <p className="mt-sm text-sm text-neutral-600">Contractors, cleaners, and landlords assigned to properties</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
          >
            + Add Contact
          </button>
        </div>

        {/* Add Contact Form */}
        {showAddForm && (
          <div className="mb-3xl rounded-2xl border-2 border-neutral-900 bg-white p-lg">
            <h2 className="text-lg font-bold text-neutral-900 mb-md">Add New Contact</h2>
            <div className="grid gap-md md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ricky Thompson"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Email</label>
                <input
                  type="email"
                  placeholder="ricky@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Phone</label>
                <input
                  type="tel"
                  placeholder="07700 000000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                >
                  <option value="contractor">Contractor</option>
                  <option value="cleaner">Cleaner</option>
                  <option value="landlord">Landlord</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Assign to Property (optional)</label>
                <select
                  value={formData.property_id}
                  onChange={(e) => setFormData({ ...formData, property_id: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                >
                  <option value="">None</option>
                  {properties.map((prop) => (
                    <option key={prop.id} value={prop.id}>
                      {prop.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-md flex gap-md">
              <button
                onClick={handleAddContact}
                className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-800"
              >
                Save Contact
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filter Buttons */}
        <div className="mb-lg flex gap-sm">
          {(['all', 'contractor', 'cleaner', 'landlord'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-md py-sm text-sm font-semibold transition-all ${
                filter === f
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-700 hover:border-neutral-400'
              }`}
            >
              {f === 'all' ? 'All' : getRoleLabel(f)} ({filteredContacts.length})
            </button>
          ))}
        </div>

        {/* Contacts List — table layout matching All Units for row clarity */}
        {filteredContacts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No contacts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-300 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  <th className="px-md py-sm">Name</th>
                  <th className="px-md py-sm hidden sm:table-cell">Role</th>
                  <th className="px-md py-sm hidden md:table-cell">Email</th>
                  <th className="px-md py-sm hidden md:table-cell">Phone</th>
                  <th className="px-md py-sm hidden sm:table-cell">Assigned to</th>
                  <th className="px-md py-sm w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => router.push(`/admin/person/${contact.id}`)}
                    className="border-t border-neutral-200 bg-white hover:bg-neutral-50 transition-colors cursor-pointer"
                  >
                    <td className="px-md py-sm">
                      <p className="font-semibold text-neutral-900">{contact.name || contact.email}</p>
                      {/* Show email on mobile where dedicated column is hidden */}
                      <p className="text-xs text-neutral-500 md:hidden">{contact.email}</p>
                      <span className={`mt-xs inline-block text-xs font-semibold px-sm py-xs rounded-full sm:hidden ${getRoleColor(contact.role)}`}>
                        {getRoleLabel(contact.role)}
                      </span>
                    </td>
                    <td className="px-md py-sm hidden sm:table-cell">
                      <span className={`text-xs font-semibold px-sm py-xs rounded-full ${getRoleColor(contact.role)}`}>
                        {getRoleLabel(contact.role)}
                      </span>
                    </td>
                    <td className="px-md py-sm hidden md:table-cell text-neutral-600">{contact.email}</td>
                    <td className="px-md py-sm hidden md:table-cell text-neutral-600">{contact.phone || '—'}</td>
                    <td className="px-md py-sm hidden sm:table-cell text-xs">
                      {contact.properties?.name ? (
                        <a
                          href={`/admin/properties/${contact.property_id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          📍 {contact.properties.name}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-md py-sm">
                      <div className="flex items-center justify-end gap-sm">
                        <a
                          href={`/admin/view-as/${contact.id}`}
                          onClick={e => e.stopPropagation()}
                          title="View as this person"
                          className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-sm py-xs rounded-lg transition-colors whitespace-nowrap"
                        >
                          👁 View as
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteContact(contact.id) }}
                          className="text-xs text-red-600 hover:text-red-700 font-semibold"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
