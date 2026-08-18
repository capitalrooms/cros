'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

interface DiagnosticStep {
  step: 'category' | 'description' | 'questions' | 'diagnosis' | 'choice';
  data?: any;
}

const CATEGORIES = [
  { key: 'plumbing', label: '🚰 Plumbing', icon: '🚰' },
  { key: 'electrical', label: '⚡ Electrical', icon: '⚡' },
  { key: 'heating', label: '🔥 Heating/Cooling', icon: '🔥' },
  { key: 'appliances', label: '🍳 Appliances', icon: '🍳' },
  { key: 'structural', label: '🏠 Structural', icon: '🏠' },
  { key: 'other', label: '❓ Other', icon: '❓' },
];

export default function SmartTroubleshootingPage() {
  const router = useRouter();
  const [step, setStep] = useState<DiagnosticStep['step']>('category');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [personId, setPersonId] = useState<string>('');
  const [tenancyId, setTenancyId] = useState<string>('');
  const [propertyId, setPropertyId] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');

  // Form state
  const [selectedCategory, setSelectedCategory] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login');
        return;
      }

      setUser(data.user);
      setPersonId(data.assignment?.id || '');

      // Get tenancy data
      const supabase = createClient();
      const { data: tenancy } = await supabase
        .from('tenancies')
        .select('id, property_id, room_id')
        .eq('person_id', data.assignment?.id)
        .not('end_date', 'is', null)
        .or('end_date.gte.' + new Date().toISOString().split('T')[0])
        .single();

      if (tenancy) {
        setTenancyId(tenancy.id);
        setPropertyId(tenancy.property_id);
        setRoomId(tenancy.room_id);
      }

      setLoading(false);
    }

    init();
  }, [router]);

  async function generateQuestions() {
    if (!selectedCategory || !description.trim()) {
      setError('Please select a category and describe the issue');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/maintenance/generate-diagnostic-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          description: description,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate questions');

      const data = await response.json();
      setQuestions(data.questions || []);
      setAnswers(new Array(data.questions?.length || 0).fill(''));
      setStep('questions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating questions');
    } finally {
      setSubmitting(false);
    }
  }

  async function generateDiagnosis() {
    if (answers.some(a => !a.trim())) {
      setError('Please answer all questions');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/maintenance/generate-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          description: description,
          questions: questions,
          answers: answers,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate diagnosis');

      const data = await response.json();
      setDiagnosis(data);
      setStep('diagnosis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating diagnosis');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChoice(choice: 'try_diy' | 'escalate_to_pro') {
    if (!tenancyId || !propertyId) {
      setError('Missing tenancy information');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/maintenance/save-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: personId,
          tenancy_id: tenancyId,
          property_id: propertyId,
          room_id: roomId,
          category: selectedCategory,
          initial_description: description,
          ai_questions: questions,
          user_answers: answers,
          ai_recommendation: diagnosis.recommendation,
          ai_guidance: diagnosis.guidance,
          user_choice: choice,
        }),
      });

      if (!response.ok) throw new Error('Failed to save diagnostic');

      if (choice === 'escalate_to_pro') {
        // Redirect to regular maintenance form with pre-filled data
        router.push(`/tenant/maintenance?category=${selectedCategory}&description=${encodeURIComponent(description)}&diagnostic=true`);
      } else {
        // Show DIY guide
        setStep('choice');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving diagnostic');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-lg text-center text-neutral-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200">
        <div className="mx-auto max-w-2xl px-lg py-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-neutral-900">Smart Troubleshooting</h1>
            <Link
              href="/tenant/maintenance-choose"
              className="text-sm font-bold text-neutral-600 hover:text-neutral-900"
            >
              ← Back
            </Link>
          </div>
          <p className="text-sm text-neutral-600 mt-sm">
            Let's figure this out together. I'll ask a few questions to help diagnose the issue.
          </p>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-2xl px-lg py-lg">
        {error && (
          <div className="mb-lg rounded-lg border-2 border-red-200 bg-red-50 p-md">
            <p className="text-sm text-red-900">{error}</p>
          </div>
        )}

        {/* Step 1: Category Selection */}
        {step === 'category' && (
          <div className="space-y-lg">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 mb-md">What type of problem?</h2>
              <div className="grid grid-cols-2 gap-md md:grid-cols-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`rounded-lg border-2 p-md text-center transition-all ${
                      selectedCategory === cat.key
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400'
                    }`}
                  >
                    <div className="text-2xl mb-sm">{cat.icon}</div>
                    <div className="text-sm font-bold">{cat.label.split(' ')[1]}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep('description')}
              disabled={!selectedCategory || submitting}
              className="w-full rounded-lg bg-blue-600 px-lg py-sm text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Initial Description */}
        {step === 'description' && (
          <div className="space-y-lg">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 mb-md">
                What's happening with your {CATEGORIES.find(c => c.key === selectedCategory)?.label.split(' ')[1].toLowerCase()}?
              </h2>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Water is dripping from the pipe under the kitchen sink"
                className="w-full rounded-lg border-2 border-neutral-200 px-md py-sm text-sm"
                rows={4}
              />
            </div>

            <div className="flex gap-md">
              <button
                onClick={() => setStep('category')}
                className="flex-1 rounded-lg border-2 border-neutral-200 px-lg py-sm text-sm font-bold text-neutral-600 hover:bg-neutral-50"
              >
                Back
              </button>
              <button
                onClick={generateQuestions}
                disabled={!description.trim() || submitting}
                className="flex-1 rounded-lg bg-blue-600 px-lg py-sm text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Generating questions...' : 'Generate Questions'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Answer Questions */}
        {step === 'questions' && (
          <div className="space-y-lg">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 mb-md">A few quick questions</h2>
              <div className="space-y-md">
                {questions.map((q, idx) => (
                  <div key={idx}>
                    <label className="text-sm font-bold text-neutral-900 mb-sm block">
                      {idx + 1}. {q}
                    </label>
                    <input
                      type="text"
                      value={answers[idx] || ''}
                      onChange={(e) => {
                        const newAnswers = [...answers];
                        newAnswers[idx] = e.target.value;
                        setAnswers(newAnswers);
                      }}
                      placeholder="Your answer..."
                      className="w-full rounded-lg border-2 border-neutral-200 px-md py-sm text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-md">
              <button
                onClick={() => setStep('description')}
                className="flex-1 rounded-lg border-2 border-neutral-200 px-lg py-sm text-sm font-bold text-neutral-600 hover:bg-neutral-50"
              >
                Back
              </button>
              <button
                onClick={generateDiagnosis}
                disabled={answers.some(a => !a.trim()) || submitting}
                className="flex-1 rounded-lg bg-blue-600 px-lg py-sm text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Analyzing...' : 'Get Diagnosis'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Diagnosis & Choice */}
        {step === 'diagnosis' && diagnosis && (
          <div className="space-y-lg">
            <div className={`rounded-2xl border-2 p-lg ${
              diagnosis.recommendation === 'diy'
                ? 'border-green-200 bg-green-50'
                : diagnosis.recommendation === 'maybe_diy'
                ? 'border-yellow-200 bg-yellow-50'
                : 'border-orange-200 bg-orange-50'
            }`}>
              <h2 className="text-lg font-bold text-neutral-900 mb-md">
                {diagnosis.recommendation === 'diy' && '💡 Try This First'}
                {diagnosis.recommendation === 'maybe_diy' && '⚠️ Maybe DIY'}
                {diagnosis.recommendation === 'professional_needed' && '👷 Professional Recommended'}
              </h2>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{diagnosis.guidance}</p>
            </div>

            <div className="flex gap-md">
              {diagnosis.recommendation !== 'professional_needed' && (
                <button
                  onClick={() => handleChoice('try_diy')}
                  disabled={submitting}
                  className="flex-1 rounded-lg border-2 border-green-600 px-lg py-sm text-sm font-bold text-green-900 hover:bg-green-50 disabled:opacity-50"
                >
                  Try This Fix
                </button>
              )}
              <button
                onClick={() => handleChoice('escalate_to_pro')}
                disabled={submitting}
                className="flex-1 rounded-lg bg-orange-600 px-lg py-sm text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Call a Professional'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
