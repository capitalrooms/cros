'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import Link from 'next/link';
import AppBar from '@/components/AppBar';
import { MAINTENANCE_CATEGORIES } from '../categories';

interface FormData {
  title: string;
  description: string;
  category: string;
  location: string;
  urgency: 'routine' | 'urgent' | 'emergency';
}

interface PhotoFile {
  file: File;
  preview: string;
}

const COMMON_AREAS = [
  'My Room/Bedroom',
  'Kitchen',
  'Lounge/Living Room',
  'Ground Floor Hallway',
  'First Floor Hallway',
  'Ground Floor Bathroom',
  'First Floor Bathroom',
  'Stairs',
  'Front Entrance',
  'Back Door/Garden',
  'Shared Storage',
  'Other Communal Area',
];

// Emergency guidance for different issue types
const EMERGENCY_GUIDANCE: Record<string, { title: string; actions: string[] }> = {
  gas: {
    title: '🚨 Gas Emergency',
    actions: [
      'STOP USING THE APPLIANCE IMMEDIATELY',
      'Turn off the gas at the meter',
      'Open windows for ventilation',
      'Call National Gas Emergency Service: 0800 111 999',
      'Get everyone to a safe location outside',
      'Do NOT use phones/light switches inside',
    ],
  },
  fire: {
    title: '🔥 Fire Emergency',
    actions: [
      'EVACUATE IMMEDIATELY',
      'Call 999 and ask for Fire Service',
      'Use the nearest exit',
      'DO NOT use lifts',
      'Activate the fire alarm on your way out',
      'Do NOT return inside for any reason',
      'Meet at the assembly point as per fire plan',
    ],
  },
  electrical: {
    title: '⚡ Electrical Emergency',
    actions: [
      'Switch off the main power at the circuit breaker',
      'Do NOT touch wet switches/sockets',
      'Do NOT use water on electrical fires',
      'Call a qualified electrician immediately',
      "If there's a fire: Call 999 (Fire Service)",
      'Avoid the affected area until resolved',
    ],
  },
  flooding: {
    title: '💧 Flooding/Water Leak',
    actions: [
      'Turn off the water at the main stopcock (usually under the sink or outside)',
      'Switch off electricity to affected areas if safe',
      'Mop up water to prevent damage and slipping hazards',
      'Contact your landlord/agent IMMEDIATELY: [agent emergency number]',
      'Document damage with photos for insurance',
      'Open windows to aid drying',
    ],
  },
  heating: {
    title: '❄️ No Heating (Winter)',
    actions: [
      'Check if the boiler is switched on and the thermostat is set correctly',
      'Check that the pilot light is lit (if applicable)',
      'Allow 15 minutes for the system to respond',
      'If still not working, contact your landlord/agent IMMEDIATELY',
      'Agent emergency number: [emergency number]',
      'In extreme cold, seek temporary alternative accommodation',
    ],
  },
  antisocial: {
    title: '🚔 Severe Antisocial Behavior',
    actions: [
      'If you are in immediate danger, call 999',
      'Document incidents: date, time, nature, witnesses',
      'Call the non-emergency police line: 101',
      'Report to your landlord/agent in writing',
      'Ask about tenant dispute resolution services',
      'Consider getting support from local community safety services',
    ],
  },
  security: {
    title: '🔓 Security Breach/Break-in',
    actions: [
      'If someone is in your home, leave safely and call 999',
      'Call 999 to report the break-in',
      'Do NOT touch anything or disturb the scene',
      'Move to a safe location and wait for police',
      'Contact your landlord/agent after police have attended',
      'Get a crime reference number for insurance',
    ],
  },
};

function ReportFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryId = searchParams.get('category') || '';

  const selectedCategory = MAINTENANCE_CATEGORIES.find((c) => c.id === categoryId);
  const categoryLabel = selectedCategory?.title || 'Maintenance';

  const handleBack = () => router.back();

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    category: categoryLabel,
    location: 'My Room/Bedroom',
    urgency: 'routine',
  });
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showEmergencyGuidance, setShowEmergencyGuidance] = useState(false);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (!files) return;

    const newPhotos: PhotoFile[] = Array.from(files)
      .slice(0, 5 - photos.length)
      .map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));

    setPhotos([...photos, ...newPhotos]);
  }

  function removePhoto(index: number) {
    const newPhotos = [...photos];
    URL.revokeObjectURL(newPhotos[index].preview);
    newPhotos.splice(index, 1);
    setPhotos(newPhotos);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const userData = await getCurrentUser();
      if (!userData) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const { data: ticketData, error: ticketErr } = await supabase
        .from('maintenance_tickets')
        .insert([
          {
            reporter_id: userData.user.id,
            title: formData.title,
            description: formData.description,
            category: formData.category,
            location: formData.location,
            priority: formData.urgency === 'emergency' ? 'high' : formData.urgency === 'urgent' ? 'medium' : 'low',
            status: 'reported',
            property_id: userData.assignment?.property_id,
            room_id: userData.assignment?.room_id,
          },
        ])
        .select();

      if (ticketErr) throw ticketErr;
      const ticketId = ticketData?.[0]?.id;

      if (ticketId) {
        fetch('/api/notify-job-raised', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId }),
        }).catch((e) => console.error('Notification failed:', e));
      }

      if (photos.length > 0 && ticketId) {
        for (const photo of photos) {
          const timestamp = Date.now();
          const fileName = `${ticketId}/${timestamp}-${photo.file.name}`;

          const { error: uploadErr } = await supabase.storage
            .from('maintenance-photos')
            .upload(fileName, photo.file);

          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('maintenance-photos')
              .getPublicUrl(fileName);

            await supabase.from('attachments').insert([
              {
                ticket_id: ticketId,
                attachment_type: 'photo',
                file_name: photo.file.name,
                file_path: fileName,
                file_size: photo.file.size,
                storage_url: urlData.publicUrl,
                uploaded_by: userData.user.id,
              },
            ]);
          }
        }
      }

      const urgencyLabel = {
        routine: 'non-urgent',
        urgent: 'urgent',
        emergency: 'EMERGENCY',
      }[formData.urgency];

      setSuccess(
        `✅ Maintenance request submitted (${urgencyLabel})${
          photos.length > 0 ? ` with ${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''
        }!`
      );
      setFormData({
        title: '',
        description: '',
        category: categoryLabel,
        location: 'My Room/Bedroom',
        urgency: 'routine',
      });
      setPhotos([]);

      setTimeout(() => {
        router.push('/tenant');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  }

  // Determine if this looks like an emergency based on description/title
  const emergencyKeywords = ['gas', 'fire', 'flood', 'electrical', 'no heat', 'break-in', 'police', 'danger'];
  const seemsEmergency = emergencyKeywords.some(
    (keyword) =>
      formData.title.toLowerCase().includes(keyword) ||
      formData.description.toLowerCase().includes(keyword)
  );

  let emergencyType: keyof typeof EMERGENCY_GUIDANCE | null = null;
  if (formData.urgency === 'emergency') {
    if (formData.description.toLowerCase().includes('gas')) emergencyType = 'gas';
    else if (formData.description.toLowerCase().includes('fire')) emergencyType = 'fire';
    else if (formData.description.toLowerCase().includes('electrical') || formData.description.toLowerCase().includes('electric'))
      emergencyType = 'electrical';
    else if (formData.description.toLowerCase().includes('flood') || formData.description.toLowerCase().includes('leak'))
      emergencyType = 'flooding';
    else if (formData.description.toLowerCase().includes('heating') || formData.description.toLowerCase().includes('heat'))
      emergencyType = 'heating';
    else if (formData.description.toLowerCase().includes('antisocial')) emergencyType = 'antisocial';
    else if (formData.description.toLowerCase().includes('break-in') || formData.description.toLowerCase().includes('security'))
      emergencyType = 'security';
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100">
      <AppBar
        right={
          <button
            onClick={handleBack}
            className="min-w-0 truncate text-sm font-semibold text-white hover:text-white/80"
          >
            Back
          </button>
        }
      />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        {/* Emergency Alert Banner */}
        {formData.urgency === 'emergency' && (
          <div className="mb-lg rounded-2xl border-2 border-red-300 bg-red-50 p-lg">
            <p className="text-sm font-bold text-red-900 flex items-center gap-sm">
              🚨 <span>EMERGENCY ISSUE REPORTED</span>
            </p>
            <p className="mt-xs text-sm text-red-800">
              If this is a life-threatening emergency, please call 999 immediately. Do not wait for this form to be processed.
            </p>
          </div>
        )}

        {/* Success/Error Messages */}
        {error && (
          <div className="mb-lg rounded-xl border-2 border-red-300 bg-white p-md text-sm text-red-900 font-semibold">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-lg rounded-xl bg-gradient-to-r from-green-600 to-green-700 p-md text-sm font-semibold text-white">
            {success}
          </div>
        )}

        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 px-xl py-lg text-white">
            <p className="text-sm opacity-90">Reporting issue in:</p>
            <h1 className="text-2xl font-bold mt-xs">{categoryLabel}</h1>
            <p className="text-sm opacity-75 mt-xs">{selectedCategory?.description}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-xl space-y-lg">
            {/* Issue Title */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                What's the problem? *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-opacity-20"
                placeholder={`e.g., ${categoryLabel === 'Appliances' ? 'Dishwasher is leaking water' : categoryLabel === 'Plumbing' ? 'Kitchen tap won\'t stop dripping' : 'Describe the issue'}`}
                required
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">Where is it? *</label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-opacity-20"
                required
              >
                {COMMON_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                Describe the issue in detail *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-opacity-20"
                rows={5}
                placeholder="Describe what's happening, when it started, any error messages or unusual behavior..."
                required
              />
            </div>

            {/* Urgency Selection */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-md">
                How urgent is this? *
              </label>
              <div className="space-y-sm">
                {/* Routine */}
                <label className="flex items-start gap-md p-md border-2 rounded-lg cursor-pointer transition-all hover:bg-neutral-50"
                  style={{
                    borderColor: formData.urgency === 'routine' ? '#2563eb' : '#e5e7eb',
                    backgroundColor: formData.urgency === 'routine' ? '#eff6ff' : 'transparent'
                  }}>
                  <input
                    type="radio"
                    name="urgency"
                    value="routine"
                    checked={formData.urgency === 'routine'}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value as 'routine' | 'urgent' | 'emergency' })}
                    className="mt-0.5 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-neutral-900">Not Urgent</p>
                    <p className="text-sm text-neutral-600">Works most of the time, minor inconvenience</p>
                  </div>
                </label>

                {/* Urgent */}
                <label className="flex items-start gap-md p-md border-2 rounded-lg cursor-pointer transition-all hover:bg-orange-50"
                  style={{
                    borderColor: formData.urgency === 'urgent' ? '#ea580c' : '#e5e7eb',
                    backgroundColor: formData.urgency === 'urgent' ? '#fff7ed' : 'transparent'
                  }}>
                  <input
                    type="radio"
                    name="urgency"
                    value="urgent"
                    checked={formData.urgency === 'urgent'}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value as 'routine' | 'urgent' | 'emergency' })}
                    className="mt-0.5 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-neutral-900">🟠 Urgent</p>
                    <p className="text-sm text-neutral-600">Doesn't work properly, affects daily life or other tenants</p>
                  </div>
                </label>

                {/* Emergency */}
                <label className="flex items-start gap-md p-md border-2 rounded-lg cursor-pointer transition-all hover:bg-red-50"
                  style={{
                    borderColor: formData.urgency === 'emergency' ? '#dc2626' : '#e5e7eb',
                    backgroundColor: formData.urgency === 'emergency' ? '#fef2f2' : 'transparent'
                  }}>
                  <input
                    type="radio"
                    name="urgency"
                    value="emergency"
                    checked={formData.urgency === 'emergency'}
                    onChange={(e) => {
                      setFormData({ ...formData, urgency: e.target.value as 'routine' | 'urgent' | 'emergency' });
                      setShowEmergencyGuidance(true);
                    }}
                    className="mt-0.5 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-red-900">🚨 EMERGENCY</p>
                    <p className="text-sm text-red-700">Immediate danger, gas/fire/flooding/severe injury risk</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Emergency Guidance */}
            {formData.urgency === 'emergency' && emergencyType && EMERGENCY_GUIDANCE[emergencyType] && (
              <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-lg">
                <p className="text-lg font-bold text-red-900 mb-md">{EMERGENCY_GUIDANCE[emergencyType].title}</p>
                <ol className="space-y-sm">
                  {EMERGENCY_GUIDANCE[emergencyType].actions.map((action, idx) => (
                    <li key={idx} className="flex gap-md">
                      <span className="font-bold text-red-700 flex-shrink-0">{idx + 1}.</span>
                      <span className="text-sm text-red-800">{action}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Photos Upload */}
            <div className="border-t border-neutral-200 pt-lg">
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                📸 Add Photos (Optional - up to 5)
              </label>
              <p className="text-xs text-neutral-600 mb-md">
                Photos help us understand and fix the issue faster
              </p>

              <label className="flex items-center justify-center gap-md rounded-lg border-2 border-dashed border-neutral-300 px-md py-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <span className="text-2xl">📷</span>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Click to add photos</p>
                  <p className="text-xs text-neutral-600">or drag and drop</p>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  disabled={photos.length >= 5}
                  className="hidden"
                />
              </label>

              {photos.length > 0 && (
                <div className="mt-md">
                  <p className="text-xs font-semibold text-neutral-600 mb-sm">
                    {photos.length} photo{photos.length !== 1 ? 's' : ''} selected
                  </p>
                  <div className="grid grid-cols-4 gap-sm">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={photo.preview}
                          alt={`Preview ${idx + 1}`}
                          className="w-full h-16 object-cover rounded-lg border border-neutral-200"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute top-0 right-0 -translate-y-1/3 translate-x-1/3 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-md pt-lg border-t border-neutral-200">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 rounded-xl px-lg py-md text-sm font-semibold text-white transition-all ${
                  formData.urgency === 'emergency'
                    ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                    : formData.urgency === 'urgent'
                    ? 'bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400'
                    : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
                }`}
              >
                {loading
                  ? 'Submitting...'
                  : formData.urgency === 'emergency'
                  ? '🚨 Report Emergency'
                  : formData.urgency === 'urgent'
                  ? '⏰ Report Urgent Issue'
                  : '✓ Submit Report'}
              </button>
              <Link href="/tenant/maintenance">
                <button
                  type="button"
                  className="rounded-xl border border-neutral-300 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
              </Link>
            </div>
          </form>

          {/* Tips Section */}
          <div className="border-t border-neutral-200 bg-neutral-50 px-xl py-lg">
            <h3 className="font-semibold text-neutral-900 mb-md">💡 Tips for reporting</h3>
            <ul className="space-y-sm text-sm text-neutral-600">
              <li>✓ <strong>Be specific:</strong> "Tap drips 5 times per minute" is better than "tap leaks"</li>
              <li>✓ <strong>Include when:</strong> "Started yesterday after the shower" helps diagnosis</li>
              <li>✓ <strong>Add photos:</strong> Pictures of the issue speed up the fix</li>
              <li>✓ <strong>For emergencies:</strong> Call 999 first, then use this form</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-100 flex items-center justify-center">Loading...</div>}>
      <ReportFormContent />
    </Suspense>
  );
}
