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
  priority: 'low' | 'medium' | 'high';
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

function ReportFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryId = searchParams.get('category') || '';

  const selectedCategory = MAINTENANCE_CATEGORIES.find((c) => c.id === categoryId);
  const categoryLabel = selectedCategory?.title || 'Maintenance';

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    category: categoryLabel,
    location: 'My Room/Bedroom',
    priority: 'medium',
  });
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (!files) return;

    const newPhotos: PhotoFile[] = Array.from(files)
      .slice(0, 5 - photos.length) // Max 5 photos
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
            priority: formData.priority,
            status: 'reported',
            property_id: userData.assignment?.property_id,
            room_id: userData.assignment?.room_id,
          },
        ])
        .select();

      if (ticketErr) throw ticketErr;
      const ticketId = ticketData?.[0]?.id;

      // Send notification email
      if (ticketId) {
        fetch('/api/notify-job-raised', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId }),
        }).catch((e) => console.error('Notification failed:', e));
      }

      // Upload photos if any
      if (photos.length > 0 && ticketId) {
        for (const photo of photos) {
          const timestamp = Date.now();
          const fileName = `${ticketId}/${timestamp}-${photo.file.name}`;

          // Upload to storage
          const { error: uploadErr } = await supabase.storage
            .from('maintenance-photos')
            .upload(fileName, photo.file);

          if (uploadErr) console.error('Photo upload error:', uploadErr);

          if (!uploadErr) {
            // Get public URL
            const { data: urlData } = supabase.storage
              .from('maintenance-photos')
              .getPublicUrl(fileName);

            // Record attachment in database
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

      setSuccess(
        photos.length > 0
          ? `Maintenance request submitted with ${photos.length} photo${photos.length > 1 ? 's' : ''}!`
          : 'Maintenance request submitted!'
      );
      setFormData({
        title: '',
        description: '',
        category: categoryLabel,
        location: 'My Room/Bedroom',
        priority: 'medium',
      });
      setPhotos([]);

      // Redirect to tenant dashboard after 2 seconds
      setTimeout(() => {
        router.push('/tenant');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <Link
            href="/tenant/maintenance"
            className="shrink-0 text-sm text-white/60 hover:text-white"
          >
            Maintenance · Back
          </Link>
        }
      />

      <main className="mx-auto max-w-3xl px-lg py-lg">
        <div className="rounded-2xl border border-neutral-200 bg-white p-xl">
          {error && (
            <div className="mb-md rounded-xl border-2 border-neutral-900 bg-white p-md text-sm text-neutral-900">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-md rounded-xl bg-neutral-950 p-md text-sm font-semibold text-white">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-md">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Issue Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                placeholder={`e.g., ${categoryLabel === 'Appliances' ? 'Dishwasher not washing' : categoryLabel === 'Plumbing' ? 'Leaky kitchen tap' : 'Describe the issue'}`}
                required
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Location *</label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
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
              <label className="block text-sm font-medium text-neutral-700">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-sm placeholder-neutral-400 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                rows={5}
                placeholder={`Describe the ${categoryLabel.toLowerCase()} issue in detail...`}
                required
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">Priority *</label>
              <div className="mt-sm flex gap-md">
                {(['low', 'medium', 'high'] as const).map((pri) => (
                  <label key={pri} className="flex items-center gap-sm cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value={pri}
                      checked={formData.priority === pri}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priority: e.target.value as 'low' | 'medium' | 'high',
                        })
                      }
                      className="cursor-pointer"
                    />
                    <span className="text-sm text-neutral-700 capitalize">{pri}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Photos Upload */}
            <div className="border-t border-neutral-200 pt-md">
              <label className="block text-sm font-medium text-neutral-700 mb-sm">
                📸 Add Photos (Optional - Max 5)
              </label>
              <p className="text-xs text-neutral-600 mb-md">
                Photos help us understand the issue better and provide faster solutions
              </p>

              <div className="mb-md">
                <label className="flex items-center justify-center gap-md rounded-lg border-2 border-dashed border-neutral-300 px-md py-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <span className="text-2xl">📷</span>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Click to add photos</p>
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
              </div>

              {photos.length > 0 && (
                <div className="space-y-sm">
                  <p className="text-xs font-medium text-neutral-600">
                    {photos.length} photo{photos.length !== 1 ? 's' : ''} selected
                  </p>
                  <div className="grid grid-cols-4 gap-sm">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={photo.preview}
                          alt={`Preview ${idx + 1}`}
                          className="w-full h-16 object-cover rounded-xl border border-neutral-200"
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

            {/* Submit */}
            <div className="flex gap-md pt-md">
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-blue-600 px-lg py-sm text-sm font-medium text-white hover:bg-blue-700 disabled:bg-neutral-400"
              >
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
              <Link href="/tenant/maintenance">
                <button
                  type="button"
                  className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </Link>
            </div>
          </form>

          <div className="mt-xl space-y-md border-t border-neutral-200 pt-xl">
            <h3 className="font-medium text-neutral-900">Tips for this category</h3>
            <div className="space-y-md text-sm text-neutral-600">
              <div>
                <p className="font-medium text-neutral-700">Be specific</p>
                <p>The more detail you provide, the faster we can fix the issue.</p>
              </div>
              <div>
                <p className="font-medium text-neutral-700">Include symptoms</p>
                <p>Describe what's happening, when it started, and if it's getting worse.</p>
              </div>
              <div>
                <p className="font-medium text-neutral-700">Set priority</p>
                <p>High priority issues get attention within hours. Emergency? Call immediately.</p>
              </div>
            </div>
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
