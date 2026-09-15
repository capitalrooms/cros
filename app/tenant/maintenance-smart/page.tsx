'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import AppBar from '@/components/AppBar';
import BackButton from '@/app/components/BackButton';

type DiagStep = 'category' | 'description' | 'questions' | 'diagnosis' | 'choice';

const CATEGORIES = [
  { key: 'plumbing',    label: 'Plumbing',     icon: '🚰' },
  { key: 'electrical',  label: 'Electrical',   icon: '⚡' },
  { key: 'heating',     label: 'Heating',      icon: '🔥' },
  { key: 'appliances',  label: 'Appliances',   icon: '🍳' },
  { key: 'structural',  label: 'Structural',   icon: '🏠' },
  { key: 'other',       label: 'Other',        icon: '❓' },
];

export default function SmartTroubleshootingPage() {
  const router = useRouter();
  const [step, setStep]               = useState<DiagStep>('category');
  const [loading, setLoading]         = useState(true);
  const [personId, setPersonId]       = useState('');
  const [tenancyId, setTenancyId]     = useState('');
  const [propertyId, setPropertyId]   = useState('');
  const [roomId, setRoomId]           = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions]     = useState<string[]>([]);
  const [answers, setAnswers]         = useState<string[]>([]);
  const [diagnosis, setDiagnosis]     = useState<any>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || data.assignment?.role !== 'tenant') { router.push('/login'); return; }
      setPersonId(data.assignment?.id || '');
      const supabase = createClient();
      const { data: tenancy } = await supabase
        .from('tenancies').select('id, property_id, room_id')
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

  // Back navigation per step
  function goBack() {
    if (step === 'category')    router.push('/tenant/maintenance-choose');
    else if (step === 'description') setStep('category');
    else if (step === 'questions')   setStep('description');
    else if (step === 'diagnosis')   setStep('questions');
    else if (step === 'choice')      setStep('diagnosis');
    else router.push('/tenant/maintenance-choose');
  }

  async function generateQuestions() {
    if (!selectedCategory || !description.trim()) {
      setError('Please select a category and describe the issue');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/maintenance/generate-diagnostic-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory, description }),
      });
      if (!res.ok) throw new Error('Failed to generate questions');
      const data = await res.json();
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
    if (answers.some(a => !a.trim())) { setError('Please answer all questions'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/maintenance/generate-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory, description, questions, answers }),
      });
      if (!res.ok) throw new Error('Failed to generate diagnosis');
      const data = await res.json();
      setDiagnosis(data);
      setStep('diagnosis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating diagnosis');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChoice(choice: 'try_diy' | 'escalate_to_pro') {
    if (!tenancyId || !propertyId) { setError('Missing tenancy information'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/maintenance/save-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: personId, tenancy_id: tenancyId, property_id: propertyId, room_id: roomId,
          category: selectedCategory, initial_description: description,
          ai_questions: questions, user_answers: answers,
          ai_recommendation: diagnosis.recommendation, ai_guidance: diagnosis.guidance,
          user_choice: choice,
        }),
      });
      if (!res.ok) throw new Error('Failed to save diagnostic');
      if (choice === 'escalate_to_pro') {
        router.push(`/tenant/maintenance?category=${selectedCategory}&description=${encodeURIComponent(description)}&diagnostic=true`);
      } else {
        setStep('choice');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving diagnostic');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/tenant/maintenance-choose" />} />
        <div className="flex items-center justify-center pt-32 text-sm text-neutral-400">Loading…</div>
      </div>
    );
  }

  const catLabel = CATEGORIES.find(c => c.key === selectedCategory)?.label.toLowerCase() || '';

  const STEP_TITLES: Record<DiagStep, string> = {
    category:    'Smart Troubleshooting',
    description: 'Describe the issue',
    questions:   'A few questions',
    diagnosis:   'Diagnosis',
    choice:      'What to do next',
  };

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {/* AppBar handles safe area — no custom header */}
      <AppBar
        left={<BackButton onClick={goBack} />}
        center={<span className="text-sm font-semibold text-white opacity-75">{STEP_TITLES[step]}</span>}
      />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        {error && (
          <div className="mb-lg rounded-xl border border-red-200 bg-red-50 px-md py-sm">
            <p className="text-sm text-red-900">{error}</p>
          </div>
        )}

        {/* ── Category ─────────────────────────────────────────────────── */}
        {step === 'category' && (
          <div>
            <p className="text-sm text-neutral-500 mb-lg">
              Let's figure this out together. I'll ask a few questions to help diagnose the issue.
            </p>
            <h2 className="text-base font-bold text-neutral-900 mb-md">What type of problem?</h2>
            <div className="grid grid-cols-2 gap-md mb-xl md:grid-cols-3">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`rounded-xl border-2 p-md text-center transition-all ${
                    selectedCategory === cat.key
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400'
                  }`}
                >
                  <div className="text-2xl mb-xs">{cat.icon}</div>
                  <div className="text-sm font-semibold">{cat.label}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep('description')}
              disabled={!selectedCategory}
              className="w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white disabled:opacity-40 hover:bg-neutral-800 transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── Description ──────────────────────────────────────────────── */}
        {step === 'description' && (
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-md">
              What's happening with your {catLabel}?
            </h2>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={`e.g., Water is dripping from the pipe under the kitchen sink`}
              className="w-full rounded-xl border-2 border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 resize-none focus:border-neutral-900 focus:outline-none"
              rows={4}
              autoFocus
            />
            <button
              onClick={generateQuestions}
              disabled={!description.trim() || submitting}
              className="mt-lg w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white disabled:opacity-40 hover:bg-neutral-800 transition-colors"
            >
              {submitting ? 'Working out questions…' : 'Generate Questions →'}
            </button>
          </div>
        )}

        {/* ── Questions ────────────────────────────────────────────────── */}
        {step === 'questions' && (
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-md">A few quick questions</h2>
            <div className="space-y-md">
              {questions.map((q, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-neutral-200 p-md">
                  <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                    {idx + 1}. {q}
                  </label>
                  <input
                    type="text"
                    value={answers[idx] || ''}
                    onChange={e => {
                      const next = [...answers];
                      next[idx] = e.target.value;
                      setAnswers(next);
                    }}
                    placeholder="Your answer…"
                    className="w-full rounded-lg border border-neutral-200 px-md py-sm text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={generateDiagnosis}
              disabled={answers.some(a => !a.trim()) || submitting}
              className="mt-lg w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white disabled:opacity-40 hover:bg-neutral-800 transition-colors"
            >
              {submitting ? 'Analysing…' : 'Get Diagnosis →'}
            </button>
          </div>
        )}

        {/* ── Diagnosis ────────────────────────────────────────────────── */}
        {step === 'diagnosis' && diagnosis && (
          <div>
            <div className={`rounded-2xl border-2 p-lg mb-lg ${
              diagnosis.recommendation === 'diy'
                ? 'border-green-200 bg-green-50'
                : diagnosis.recommendation === 'maybe_diy'
                ? 'border-amber-200 bg-amber-50'
                : 'border-orange-200 bg-orange-50'
            }`}>
              <h2 className="text-base font-bold text-neutral-900 mb-md">
                {diagnosis.recommendation === 'diy'                 && '💡 Try This First'}
                {diagnosis.recommendation === 'maybe_diy'           && '⚠️ Could be DIY'}
                {diagnosis.recommendation === 'professional_needed' && '👷 Professional Recommended'}
              </h2>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">{diagnosis.guidance}</p>
            </div>

            <div className="flex gap-md">
              {diagnosis.recommendation !== 'professional_needed' && (
                <button
                  onClick={() => handleChoice('try_diy')}
                  disabled={submitting}
                  className="flex-1 rounded-xl border-2 border-green-600 px-lg py-md text-sm font-bold text-green-900 hover:bg-green-50 disabled:opacity-50 transition-colors"
                >
                  Try This Fix
                </button>
              )}
              <button
                onClick={() => handleChoice('escalate_to_pro')}
                disabled={submitting}
                className="flex-1 rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Report to Agent'}
              </button>
            </div>
          </div>
        )}

        {/* ── Choice confirmed (DIY) ────────────────────────────────────── */}
        {step === 'choice' && (
          <div className="text-center py-3xl">
            <div className="text-5xl mb-lg">🛠️</div>
            <h2 className="text-xl font-bold text-neutral-900 mb-sm">Good luck!</h2>
            <p className="text-sm text-neutral-500 mb-xl">
              If it doesn't sort it, you can always report it to the agent and we'll send someone out.
            </p>
            <button
              onClick={() => router.push('/tenant/maintenance-choose')}
              className="inline-block rounded-xl bg-neutral-900 px-xl py-md text-sm font-bold text-white hover:bg-neutral-800 mr-md mb-md"
            >
              Report anyway →
            </button>
            <button
              onClick={() => router.push('/tenant')}
              className="inline-block rounded-xl border border-neutral-200 bg-white px-xl py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Back to dashboard
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
