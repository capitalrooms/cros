'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppBar from '@/components/AppBar';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';

interface Contact {
  id: string;
  email: string;
  role: 'contractor' | 'cleaner' | 'landlord';
  phone?: string;
  name?: string;
  property_id?: string;
  created_at: string;
  properties?: { name: string };
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
        .select('*, properties(name)')
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
      .select('*, properties(name)')
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

        {/* Contacts List */}
        {filteredContacts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No contacts found</p>
          </div>
        ) : (
          <div className="space-y-sm">
            {filteredContacts.map((contact) => (
              <div key={contact.id} className="rounded-2xl border border-neutral-200 bg-white p-lg hover:border-neutral-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-md">
                      <h3 className="text-lg font-bold text-neutral-900">{contact.name || contact.email}</h3>
                      <span className={`text-xs font-semibold px-md py-xs rounded-full ${getRoleColor(contact.role)}`}>
                        {getRoleLabel(contact.role)}
                      </span>
                    </div>
                    <p className="mt-xs text-sm text-neutral-600">{contact.email}</p>
                    {contact.phone && (
                      <p className="text-sm text-neutral-600">{contact.phone}</p>
                    )}
                    {contact.properties?.name && (
                      <p className="mt-sm text-xs font-semibold text-neutral-700">
                        📍 Assigned to: {contact.properties.name}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteContact(contact.id)}
                    className="text-sm text-red-600 hover:text-red-700 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
