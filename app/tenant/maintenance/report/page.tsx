'use client';

import { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import AppBar from '@/components/AppBar';
import BackButton from '@/app/components/BackButton';
import { KINDS, kindFrom } from '@/lib/emergencies/guide';

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 'form' | 'triage' | 'photos' | 'urgency' | 'done';
type UrgencyLevel = 'routine' | 'soon' | 'urgent' | 'emergency';

// Locations that will auto-post a notice to the communal board
const COMMUNAL_LOCATIONS = new Set([
  'Kitchen', 'Bathroom (ground floor)', 'Bathroom (first floor)',
  'Living Room', 'Hallway (ground floor)', 'Hallway (first floor)',
  'Stairs', 'Front entrance', 'Back / garden', 'Communal area', 'Outside / exterior',
])

interface PhotoFile { file: File; preview: string; isLabel?: boolean }
interface LabelData { make?: string | null; model?: string | null; serial?: string | null; type?: string | null }

// ── Self-fix triage patterns ──────────────────────────────────────────────────

const TRIAGE_PATTERNS: Array<{
  match: (desc: string, cat: string) => boolean;
  tip: string;
  steps: string[];
}> = [
  {
    match: (d) => /radiator.*(cold|not heat|top|warm bottom)/i.test(d) || /(cold at top|hot bottom).*(radiator|rad)/i.test(d),
    tip: 'A radiator that\'s cold at the top (but warm at the bottom) usually just needs bleeding — takes about 2 minutes.',
    steps: [
      'Turn heating on, let it run for 15 minutes.',
      'Turn heating OFF and let radiators cool for 5 minutes.',
      'Find the bleed valve — small square nut at the top corner of the radiator.',
      'Hold a cloth underneath. Turn the valve anticlockwise a quarter-turn with a bleed key or flat-head screwdriver.',
      'Air hisses out. When water starts dripping, close the valve.',
      'Check the boiler pressure gauge — if below 1 bar, repressurise.',
      'Turn heating back on. If the radiator still isn\'t heating evenly, report it.',
    ],
  },
  {
    match: (d, cat) => (cat === 'heating-cooling' || /boiler/i.test(d)) && /pressure.*(low|drop|fell)|low pressure/i.test(d),
    tip: 'Low boiler pressure is common and usually easy to fix yourself — no tools needed.',
    steps: [
      'Find the filling loop: a silver flexible hose connecting two taps under or near the boiler.',
      'Make sure the boiler is off and cool.',
      'Open both filling loop taps (turn them so the slot aligns with the pipe).',
      'Watch the pressure gauge rise to between 1 and 1.5 bar.',
      'Close both taps firmly.',
      'Switch the boiler back on — it should restart normally.',
      'If pressure drops again within a few days, there may be a leak — report it.',
    ],
  },
  {
    match: (d, cat) => (cat === 'electrical' || /fuse|circuit|breaker/i.test(d)) && /trip|tripped|no power|cut out/i.test(d),
    tip: 'A tripped circuit breaker is usually safe to reset yourself in 30 seconds.',
    steps: [
      'Find the fuse box / consumer unit (usually under the stairs, hallway, or kitchen).',
      'Look for any switches in the middle or pointing down.',
      'Switch it fully OFF then firmly back ON.',
      'If it trips again immediately: unplug all devices on that circuit, then reset.',
      'Plug devices back in one at a time to find the culprit.',
      'If it trips with nothing plugged in, or there\'s a burning smell — don\'t keep resetting. Report it.',
    ],
  },
  {
    match: (d) => /drain.*(slow|block|clog|gurgl)|block.*(drain|sink|shower)|slow.*drain|shower.*block/i.test(d),
    tip: 'A slow or blocked drain is often easy to clear yourself first.',
    steps: [
      'Remove any visible hair or debris from the plughole.',
      'Pour a full kettle of boiling water slowly down the drain.',
      'If still slow: pour in 3 tbsp of baking soda, then 100ml of white vinegar. Cover and wait 15 minutes, then flush with hot water.',
      'For a tougher block: use a plunger — cover the overflow hole with a cloth and plunge 15 times firmly.',
      'If none of this works, report it and we\'ll send a plumber.',
    ],
  },
  {
    match: (d) => /smoke alarm.*(beep|chirp|bleep|pip)|alarm.*(beep|battery|chirp)/i.test(d),
    tip: 'A smoke alarm beeping every 30–60 seconds almost always means the battery is low.',
    steps: [
      'Locate the smoke alarm — usually on the ceiling in hallways or bedrooms.',
      'Twist or slide the cover off (varies by model).',
      'Replace the 9V battery inside.',
      'Press the test button — it should beep once to confirm.',
      'If it still beeps with a new battery, let us know and we\'ll replace the unit.',
    ],
  },
  {
    match: (d, cat) => cat === 'electrical' && /light.*(not work|not on|out|stopped|dead)|bulb/i.test(d),
    tip: 'Before we book an electrician, it\'s worth checking if it\'s just the bulb.',
    steps: [
      'Check if other lights on the same switch work — if yes, it\'s likely just the bulb.',
      'Note the fitting type (bayonet = push-and-twist, or screw cap) and shape.',
      'Replace with a matching LED bulb from any supermarket.',
      'If the new bulb doesn\'t work, or other lights on the circuit are out too, report it.',
    ],
  },
  {
    match: (d) => /toilet.*(run|constantly|always|won.t stop|keep.*(run|go)|non.stop)/i.test(d),
    tip: 'A constantly running toilet is usually a simple valve issue — sometimes fixable without a plumber.',
    steps: [
      'Lift the cistern lid (the tank behind/above the toilet).',
      'Check the rubber flapper at the bottom — if it\'s lifted or warped, press it back into place.',
      'Check the float: if water is above the overflow pipe, gently bend the float arm down.',
      'Flush and watch — if it refills and stops correctly, you\'re done.',
      'If the cistern doesn\'t fill at all, or keeps running no matter what, report it.',
    ],
  },
  {
    match: (d) => /window.*(condensa|steam|mist|fog)|condensa.*window/i.test(d),
    tip: 'Condensation on windows is usually caused by humidity — often manageable without a repair.',
    steps: [
      'Open windows for 10–15 minutes each morning to ventilate.',
      'Use extractor fans when cooking or showering, and for 20 minutes after.',
      'Avoid drying clothes indoors where possible.',
      'Wipe condensation with a cloth and dry the sill to prevent mould.',
      'If condensation is between the panes of a double-glazed window, the seal has failed — report it.',
    ],
  },
];

// ── Category definitions ───────────────────────────────────────────────────────
// Each category has a primaryId (the first chip question shown ABOVE the textarea)
// and followUps (shown below the textarea). This prevents the user from describing
// the appliance/fixture in free text and then being asked again by a chip question.

interface Question {
  id: string;
  label: string;
  type: 'chips' | 'yesno' | 'text';
  options?: string[];
  hint?: string;
  urgentIf?: string;
  conditionalOn?: { field: string; values: string[] };
}

const CATEGORY_QUESTIONS: Record<string, { primary: Question; followUps: Question[] }> = {
  appliances: {
    primary: { id: 'appliance_type', type: 'chips', label: 'Which appliance?', options: ['Washing Machine', 'Oven', 'Hob / Cooker', 'Fridge / Freezer', 'Dishwasher', 'Tumble Dryer', 'Microwave', 'Other'] },
    followUps: [
      { id: 'appliance_symptom', type: 'chips', label: 'What is it doing?', options: ['Won\'t turn on', 'Making noise', 'Not heating or cooling', 'Leaking water', 'Error code showing', 'Takes too long', 'Other'] },
      { id: 'appliance_duration', type: 'chips', label: 'When did this start?', options: ['Just now', 'Today', 'This week', 'A while ago'] },
      { id: 'error_code', type: 'text', label: 'Error code shown?', hint: 'Write it exactly, e.g. "E3" or "F08"', conditionalOn: { field: 'appliance_symptom', values: ['Error code showing'] } },
    ],
  },
  plumbing: {
    primary: { id: 'fixture', type: 'chips', label: 'Which fixture?', options: ['Tap', 'Toilet', 'Shower', 'Bath', 'Sink drain', 'Under-sink pipe', 'Ceiling / floor leak', 'Other'] },
    followUps: [
      { id: 'plumbing_flow', type: 'chips', label: 'Amount of water?', options: ['Occasional drip', 'Steady drip / trickle', 'Flowing continuously', 'Full flow / flooding'], urgentIf: 'Full flow / flooding' },
      { id: 'water_damage', type: 'yesno', label: 'Any visible water damage? (wet floor, ceiling stain, swelling)', urgentIf: 'yes' },
      { id: 'plumbing_duration', type: 'chips', label: 'How long has this been happening?', options: ['Just started', 'A few days', 'Over a week', 'Longer'] },
    ],
  },
  'heating-cooling': {
    primary: { id: 'heating_scope', type: 'chips', label: 'What\'s affected?', options: ['One radiator', 'My room only', 'Whole house', 'Hot water only', 'Boiler itself'] },
    followUps: [
      { id: 'boiler_error', type: 'text', label: 'Boiler error code (if shown)', hint: 'Look at the boiler display — write it exactly, e.g. "E1" or "F75"' },
      { id: 'heating_duration', type: 'chips', label: 'When did this start?', options: ['Just now', 'This morning', 'Yesterday', 'Over a week'] },
      { id: 'tried_reset', type: 'yesno', label: 'Have you tried pressing the reset button on the boiler?' },
    ],
  },
  electrical: {
    primary: { id: 'electrical_type', type: 'chips', label: 'What\'s the issue?', options: ['Light not working', 'Socket not working', 'Fuse / circuit tripped', 'Flickering', 'No power in area', 'Extractor fan', 'Other'] },
    followUps: [
      { id: 'fuse_checked', type: 'yesno', label: 'Have you checked the fuse box?', conditionalOn: { field: 'electrical_type', values: ['Fuse / circuit tripped', 'No power in area'] } },
      { id: 'electrical_smell', type: 'yesno', label: 'Any burning smell, sparks, or visible scorch marks?', urgentIf: 'yes' },
      { id: 'electrical_scope', type: 'chips', label: 'How widespread?', options: ['Just one light or socket', 'A whole room', 'Multiple areas', 'Whole property'] },
    ],
  },
  structure: {
    primary: { id: 'structure_type', type: 'chips', label: 'Type of issue', options: ['Damp / mould', 'Crack in wall or ceiling', 'Leaking ceiling', 'Broken window', 'Door problem', 'Flooring damage', 'Other'] },
    followUps: [
      { id: 'structure_duration', type: 'chips', label: 'How long has this been visible?', options: ['Just noticed', 'A few weeks', 'A few months', 'Longer'] },
      { id: 'structure_worsening', type: 'yesno', label: 'Is it getting noticeably worse?' },
    ],
  },
  safety: {
    primary: { id: 'safety_type', type: 'chips', label: 'What\'s the issue?', options: ['Broken lock', 'Door won\'t open / close', 'Window won\'t close', 'Banister / staircase', 'Entry system / intercom', 'Fire door', 'Other'] },
    followUps: [
      { id: 'security_risk', type: 'yesno', label: 'Can you not lock your room or the front door right now?', urgentIf: 'yes' },
    ],
  },
  cleanliness: {
    primary: { id: 'pest_type', type: 'chips', label: 'What have you seen or noticed?', options: ['Mice / rats', 'Cockroaches', 'Ants', 'Bed bugs', 'Wasps / bees', 'Mould only', 'Persistent bad smell', 'Other'] },
    followUps: [
      { id: 'pest_duration', type: 'chips', label: 'How long have you noticed this?', options: ['Just now', 'A few days', 'Over a week', 'Longer'] },
    ],
  },
  furniture: {
    primary: { id: 'furniture_item', type: 'chips', label: 'Which item?', options: ['Bed frame', 'Mattress', 'Wardrobe / drawers', 'Chair / desk', 'Sofa / seating', 'Shelving', 'Other'] },
    followUps: [
      { id: 'furniture_issue', type: 'chips', label: 'What\'s wrong with it?', options: ['Broken / snapped', 'Damaged / scratched', 'Wobbly / unstable', 'Missing part', 'Won\'t open / close', 'Other'] },
    ],
  },
  decoration: {
    primary: { id: 'decoration_type', type: 'chips', label: 'Type of issue', options: ['Paint peeling / flaking', 'Damaged tiles', 'Damaged flooring', 'Wallpaper lifting', 'Marks / stains', 'Other'] },
    followUps: [
      { id: 'decoration_cause', type: 'chips', label: 'Any idea what caused it?', options: ['Damp / water', 'Normal wear', 'Accidental damage', 'Not sure'] },
    ],
  },
};

const LOCATION_OPTIONS = [
  'My Room / Bedroom', 'Kitchen', 'Bathroom (ground floor)', 'Bathroom (first floor)',
  'Living Room', 'Hallway (ground floor)', 'Hallway (first floor)', 'Stairs',
  'Front entrance', 'Back / garden', 'Communal area', 'Outside / exterior', 'Other',
];

const URGENCY_OPTIONS: Array<{ id: UrgencyLevel; label: string; sub: string; color: string }> = [
  { id: 'routine', label: 'Not urgent', sub: 'Whenever suits — next few weeks is fine', color: '#4B6358' },
  { id: 'soon', label: 'Soon please', sub: 'Within the next week', color: '#6B6B30' },
  { id: 'urgent', label: 'As soon as possible', sub: 'It\'s affecting my daily life', color: '#C25F00' },
  { id: 'emergency', label: '🚨 Emergency', sub: 'Safety risk or urgent flooding / no heat', color: '#B91C1C' },
];

// ── Tenant responsibility notes ───────────────────────────────────────────────

const TENANT_RESPONSIBILITY_NOTES: Array<{
  match: (desc: string, cat: string, loc: string) => boolean
  clause: string
  note: string
}> = [
  {
    match: (d, cat) => cat === 'electrical' && /light bulb|bulb|lamp|tube|fluorescent/i.test(d),
    clause: 'Clause 2.36',
    note: 'Replacing light bulbs and batteries is the tenant\'s responsibility. If you\'re happy to do it yourself, go ahead. If it\'s more than a bulb, keep going.',
  },
  {
    match: (_, cat, loc) => cat === 'cleanliness' && /my room|bedroom/i.test(loc),
    clause: 'Clause 2.34',
    note: 'Tenants are responsible for keeping their room clean. If this is a maintenance or pest issue, continue below.',
  },
  {
    match: (d) => /shower waste|plug hole|drain.*block|blocked drain|hair.*plug/i.test(d),
    clause: 'Clause 2.34',
    note: 'Blocked drains caused by hair or debris are a tenant responsibility. A hair trap or drain snake (a couple of pounds) usually sorts it. If there\'s a deeper blockage, continue below.',
  },
  {
    match: (_, __, loc) => /garden|back|outdoor|grass/i.test(loc),
    clause: 'Clause 2.39',
    note: 'Tenants are responsible for garden tidiness and mowing. For structural issues (broken fence, damaged paving), continue below.',
  },
];

function getTenantNote(desc: string, cat: string, loc: string) {
  return TENANT_RESPONSIBILITY_NOTES.find(r => r.match(desc, cat, loc)) || null;
}

// ── Label scan helper ─────────────────────────────────────────────────────────

async function scanLabel(file: File): Promise<LabelData> {
  const reader = new FileReader();
  return new Promise((resolve) => {
    reader.onload = async (e) => {
      try {
        const base64 = (e.target?.result as string).split(',')[1];
        const res = await fetch('/api/maintenance/scan-label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
        });
        const data = await res.json();
        resolve(data);
      } catch {
        resolve({});
      }
    };
    reader.readAsDataURL(file);
  });
}

// ── Chip component ────────────────────────────────────────────────────────────

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '9px 18px', borderRadius: 24,
        border: selected ? '2px solid #181614' : '1.5px solid #D4D4D4',
        background: selected ? '#181614' : '#FAFAF9',
        color: selected ? '#fff' : '#374151',
        fontSize: 14, fontWeight: selected ? 600 : 400,
        cursor: 'pointer', transition: 'all 0.12s ease', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: '#F3F4F6', margin: '4px 0' }} />;
}

// ── Main wizard ───────────────────────────────────────────────────────────────

function ReportWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryId = searchParams.get('category') || '';

  const CATEGORY_LABEL: Record<string, string> = {
    appliances: 'Appliances', plumbing: 'Plumbing', 'heating-cooling': 'Heating & Cooling',
    electrical: 'Electrical', structure: 'Structure & Building', safety: 'Safety & Security',
    cleanliness: 'Cleanliness & Pests', furniture: 'Furniture', decoration: 'Decoration',
  };
  const categoryLabel = CATEGORY_LABEL[categoryId] || 'Maintenance';
  const catDef = CATEGORY_QUESTIONS[categoryId];

  const [step, setStep] = useState<Step>('form');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('My Room / Bedroom');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [labelPhoto, setLabelPhoto] = useState<PhotoFile | null>(null);
  const [labelData, setLabelData] = useState<LabelData>({});
  const [labelScanState, setLabelScanState] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [urgency, setUrgency] = useState<UrgencyLevel>('routine');
  // emergencies: is it contained until morning? and what CROS did about it (shown on the done screen)
  const [controlled, setControlled] = useState<boolean | null>(null);
  const [emStatus, setEmStatus] = useState<string | null>(null);
  const [triageResult, setTriageResult] = useState<{ tip: string; steps: string[] } | null>(null);
  const [triageExpanded, setTriageExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [errorLookupLoading, setErrorLookupLoading] = useState(false);
  const [errorLookupResult, setErrorLookupResult] = useState<{
    severity: string; explanation: string; self_fix_steps: string[] | null; escalate: boolean; escalate_reason: string | null;
  } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // ── Error code AI lookup ──────────────────────────────────────────────────

  async function handleErrorCodeLookup() {
    const errorCode = answers['error_code'] || answers['boiler_error'];
    if (!errorCode?.trim()) return;
    setErrorLookupLoading(true);
    setErrorLookupResult(null);
    try {
      const res = await fetch('/api/maintenance/error-code-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode: errorCode.trim(),
          applianceType: answers['appliance_type'] || null,
          make: labelData.make || null,
          model: labelData.model || null,
        }),
      });
      const data = await res.json();
      setErrorLookupResult(data);
    } catch {
      setErrorLookupResult({
        severity: 'unknown',
        explanation: `Error code ${errorCode} noted — our team will investigate when they visit.`,
        self_fix_steps: null, escalate: false, escalate_reason: null,
      });
    } finally {
      setErrorLookupLoading(false);
    }
  }

  // ── Triage ────────────────────────────────────────────────────────────────

  function runTriage(desc: string): { tip: string; steps: string[] } | null {
    const match = TRIAGE_PATTERNS.find(p => p.match(desc, categoryId));
    return match ? { tip: match.tip, steps: match.steps } : null;
  }

  function handleFormNext() {
    if (description.trim().length < 6) return;
    const result = runTriage(description);
    setTriageResult(result);
    if (result) {
      setStep('triage');
    } else {
      setStep('photos');
    }
  }

  // ── Auto-urgent logic ─────────────────────────────────────────────────────

  function checkAutoUrgent(): boolean {
    const allQs = catDef ? [catDef.primary, ...catDef.followUps] : [];
    for (const q of allQs) {
      if (q.urgentIf && answers[q.id] === q.urgentIf) return true;
    }
    return false;
  }

  // ── Visible follow-up questions ───────────────────────────────────────────

  const visibleFollowUps = (catDef?.followUps || []).filter(q => {
    if (!q.conditionalOn) return true;
    const dep = answers[q.conditionalOn.field];
    return dep ? q.conditionalOn.values.includes(dep) : false;
  });

  // ── Photo handlers ────────────────────────────────────────────────────────

  function addPhotos(files: FileList) {
    const newPhotos = Array.from(files).slice(0, 4 - photos.length)
      .map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setPhotos(prev => [...prev, ...newPhotos]);
  }

  function removePhoto(i: number) {
    setPhotos(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[i].preview);
      next.splice(i, 1);
      return next;
    });
  }

  async function handleLabelPhoto(files: FileList) {
    if (!files[0]) return;
    const f = files[0];
    setLabelPhoto({ file: f, preview: URL.createObjectURL(f), isLabel: true });
    setLabelScanState('scanning');
    const data = await scanLabel(f);
    setLabelData(data);
    setLabelScanState('done');
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setLoading(true);
    setSubmitError('');
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) { router.push('/login'); return; }

      const userData = await getCurrentUser();
      if (!userData) { router.push('/login'); return; }

      // Build structured description for contractor
      const allQs = catDef ? [catDef.primary, ...catDef.followUps] : [];
      const lines: string[] = [description.trim(), ''];
      for (const q of allQs) {
        const ans = answers[q.id];
        if (ans) lines.push(`${q.label.replace(/\?$/, '')}: ${ans}`);
      }
      if (labelData.make) lines.push(`Make: ${labelData.make}`);
      if (labelData.model) lines.push(`Model: ${labelData.model}`);
      if (labelData.serial) lines.push(`Serial: ${labelData.serial}`);
      lines.push('', `Location: ${location}`);
      const fullDescription = lines.join('\n').trim();

      // Title
      const primaryAns = answers[catDef?.primary.id || ''];
      const shortDesc = description.slice(0, 70) + (description.length > 70 ? '…' : '');
      const title = primaryAns ? `${primaryAns} — ${shortDesc}` : shortDesc;

      // an emergency stays an emergency — the auto check only ever raises routine reports to urgent
      const finalUrgency = urgency === 'emergency' ? 'emergency' : checkAutoUrgent() ? 'urgent' : urgency;
      const priority = finalUrgency === 'emergency' ? 'emergency' : finalUrgency === 'urgent' ? 'medium' : 'low';

      const { data: ticketData, error: ticketErr } = await supabase
        .from('maintenance_tickets')
        .insert([{
          reporter_id: userData.user.id,
          title,
          description: fullDescription,
          category: categoryLabel,
          location,
          priority,
          status: 'reported',
          property_id: userData.assignment?.property_id,
          room_id: userData.assignment?.room_id,
        }])
        .select();

      if (ticketErr) throw ticketErr;
      const ticketId = ticketData?.[0]?.id;

      // Upload photos
      const allPhotos = [...(labelPhoto ? [labelPhoto] : []), ...photos];
      if (ticketId && allPhotos.length > 0) {
        for (const photo of allPhotos) {
          const fileName = `${ticketId}/${Date.now()}-${photo.file.name}`;
          const { error: uploadErr } = await supabase.storage.from('maintenance-photos').upload(fileName, photo.file);
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('maintenance-photos').getPublicUrl(fileName);
            await supabase.from('attachments').insert([{
              ticket_id: ticketId, attachment_type: 'photo',
              file_name: photo.isLabel ? `[appliance label] ${photo.file.name}` : photo.file.name,
              file_path: fileName, file_size: photo.file.size, storage_url: urlData.publicUrl,
              uploaded_by: userData.user.id,
            }]);
          }
        }
      }

      // emergencies: CROS texts the emergency contractors (or gives 999 advice / books the morning) straight away
      if (ticketId && finalUrgency === 'emergency') {
        try {
          const r = await fetch('/api/emergencies/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
            body: JSON.stringify({ ticketId, kind: emKind, controlled: !!controlled }),
          });
          const d = await r.json().catch(() => ({}));
          setEmStatus(r.ok ? (d.status ?? 'collecting') : 'failed');
        } catch { setEmStatus('failed'); }
      }

      if (ticketId) {
        fetch('/api/notify-job-raised', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId }),
        }).catch(() => {});

        if (COMMUNAL_LOCATIONS.has(location) && sessionData.session?.access_token) {
          fetch('/api/tenant/notices/maintenance-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
            body: JSON.stringify({ ticketId, location, category: categoryLabel, description: description.slice(0, 120) }),
          }).catch(() => {});
        }
      }

      setStep('done');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong — please try again');
    } finally {
      setLoading(false);
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 20, border: '1px solid #E5E7EB',
    maxWidth: 540, margin: '0 auto', overflow: 'hidden',
  };
  const section: React.CSSProperties = { padding: '20px 20px' };
  const label12: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'block' };
  const nextBtn: React.CSSProperties = {
    width: '100%', padding: '14px 0', borderRadius: 12,
    background: '#181614', color: '#fff', border: 'none',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
  };

  // contextual textarea placeholder based on primary selection
  const primaryAnswer = catDef ? (answers[catDef.primary.id] || '') : '';
  const textareaPlaceholder = primaryAnswer
    ? `What's happening with your ${primaryAnswer.toLowerCase()}?`
    : `Describe the problem in a sentence or two`;

  // Tenant note (non-blocking)
  const tenantNote = step === 'form' ? getTenantNote(description, categoryId, location) : null;

  // Progress
  const STEPS_ORDER: Step[] = triageResult
    ? ['form', 'triage', 'photos', 'urgency']
    : ['form', 'photos', 'urgency'];
  const stepIdx = STEPS_ORDER.indexOf(step);
  const progress = step === 'done' ? 100 : stepIdx >= 0 ? Math.round(((stepIdx + 1) / STEPS_ORDER.length) * 100) : 0;

  // Emergency
  const emKind = urgency === 'emergency' ? kindFrom(description, `${categoryId} ${categoryLabel}`) : null;
  const emInfo = emKind ? KINDS[emKind] : null;
  const needsControlAnswer = !!emInfo?.trade && controlled === null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>
      <AppBar
        left={<BackButton
          href={step === 'form' ? '/tenant/maintenance' : undefined}
          onClick={step !== 'form' ? () => {
            const prev: Record<Step, Step> = {
              triage: 'form', photos: triageResult ? 'triage' : 'form',
              urgency: 'photos', done: 'urgency', form: 'form',
            };
            setStep(prev[step] || 'form');
          } : undefined}
        />}
        center={<span style={{ fontSize: 13, fontWeight: 600, color: '#fff', opacity: 0.75 }}>{categoryLabel}</span>}
      />

      {/* Progress bar */}
      {step !== 'done' && (
        <div style={{ height: 3, background: '#E5E7EB' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#181614', transition: 'width 0.3s ease' }} />
        </div>
      )}

      <div style={{ padding: '20px 16px 64px', maxWidth: 560, margin: '0 auto' }}>

        {/* ── STEP: form ──────────────────────────────────────────────────── */}
        {step === 'form' && (
          <div style={card}>

            {/* Primary question — shown FIRST so they pick appliance/fixture before typing */}
            {catDef && (
              <div style={{ ...section, paddingBottom: 16 }}>
                <span style={label12}>{catDef.primary.label}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {catDef.primary.options?.map(opt => (
                    <Chip key={opt} label={opt} selected={answers[catDef.primary.id] === opt}
                      onClick={() => setAnswers(prev => ({ ...prev, [catDef.primary.id]: opt }))} />
                  ))}
                </div>
              </div>
            )}

            <Divider />

            {/* Location */}
            <div style={{ ...section, paddingTop: 16, paddingBottom: 16 }}>
              <label style={label12}>Where is the problem?</label>
              <select
                value={location}
                onChange={e => setLocation(e.target.value)}
                style={{
                  width: '100%', padding: '11px 12px', borderRadius: 10,
                  border: '1.5px solid #E5E7EB', fontSize: 14,
                  background: '#fff', fontFamily: 'inherit', color: '#181614',
                }}
              >
                {LOCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <Divider />

            {/* Description */}
            <div style={{ ...section, paddingTop: 16, paddingBottom: 16 }}>
              <label style={label12}>What's happening?</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={textareaPlaceholder}
                autoFocus={!catDef}
                rows={3}
                style={{
                  width: '100%', borderRadius: 10, border: '1.5px solid #E5E7EB',
                  padding: '11px 14px', fontSize: 14, resize: 'none',
                  fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
                  outline: 'none', color: '#181614',
                }}
              />
            </div>

            {/* Follow-up questions (shown only when relevant) */}
            {visibleFollowUps.length > 0 && (
              <>
                <Divider />
                <div style={{ ...section, paddingTop: 16, paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {visibleFollowUps.map(q => (
                    <div key={q.id}>
                      <label style={label12}>{q.label}</label>
                      {q.hint && <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8, marginTop: -6 }}>{q.hint}</p>}

                      {q.type === 'chips' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {q.options?.map(opt => (
                            <Chip key={opt} label={opt} selected={answers[q.id] === opt}
                              onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))} />
                          ))}
                        </div>
                      )}

                      {q.type === 'yesno' && (
                        <div style={{ display: 'flex', gap: 10 }}>
                          {['Yes', 'No'].map(opt => (
                            <Chip key={opt} label={opt} selected={answers[q.id] === opt.toLowerCase()}
                              onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.toLowerCase() }))} />
                          ))}
                        </div>
                      )}

                      {q.type === 'text' && (
                        <>
                          <input
                            type="text"
                            value={answers[q.id] || ''}
                            onChange={e => {
                              setAnswers(prev => ({ ...prev, [q.id]: e.target.value }));
                              if (q.id === 'error_code' || q.id === 'boiler_error') setErrorLookupResult(null);
                            }}
                            placeholder={q.hint || ''}
                            style={{
                              width: '100%', padding: '11px 12px', borderRadius: 10,
                              border: '1.5px solid #E5E7EB', fontSize: 14,
                              fontFamily: 'inherit', boxSizing: 'border-box', color: '#181614',
                            }}
                          />

                          {/* AI error code lookup */}
                          {(q.id === 'error_code' || q.id === 'boiler_error') && answers[q.id]?.trim() && (
                            <div style={{ marginTop: 10 }}>
                              {!errorLookupResult && (
                                <button type="button" onClick={handleErrorCodeLookup} disabled={errorLookupLoading}
                                  style={{
                                    padding: '8px 14px', borderRadius: 8,
                                    background: errorLookupLoading ? '#9CA3AF' : '#181614',
                                    color: '#fff', border: 'none', fontSize: 13, fontWeight: 600,
                                    cursor: errorLookupLoading ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {errorLookupLoading ? '⏳ Looking up…' : '🤖 What does this code mean?'}
                                </button>
                              )}
                              {errorLookupResult && (
                                <div style={{
                                  marginTop: 8, padding: '14px 16px', borderRadius: 12,
                                  background: errorLookupResult.severity === 'easy' ? '#F0FDF4' : errorLookupResult.severity === 'moderate' ? '#FFFBEB' : '#FEF2F2',
                                  border: `1.5px solid ${errorLookupResult.severity === 'easy' ? '#BBF7D0' : errorLookupResult.severity === 'moderate' ? '#FDE68A' : '#FECACA'}`,
                                }}>
                                  <p style={{
                                    fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                                    color: errorLookupResult.severity === 'easy' ? '#166534' : errorLookupResult.severity === 'moderate' ? '#92400E' : '#B91C1C',
                                  }}>
                                    {errorLookupResult.severity === 'easy' ? '✅ Possibly fixable yourself' :
                                     errorLookupResult.severity === 'moderate' ? '⚠️ May need professional help' :
                                     errorLookupResult.severity === 'serious' ? '🚨 Needs a professional' : '🔍 Code looked up'}
                                  </p>
                                  <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{errorLookupResult.explanation}</p>
                                  {errorLookupResult.self_fix_steps && (
                                    <ol style={{ paddingLeft: 18, marginTop: 10, marginBottom: 0 }}>
                                      {errorLookupResult.self_fix_steps.map((s, i) => (
                                        <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4, lineHeight: 1.5 }}>{s}</li>
                                      ))}
                                    </ol>
                                  )}
                                  {errorLookupResult.escalate_reason && (
                                    <p style={{ fontSize: 12, color: '#6B7280', marginTop: 10, fontStyle: 'italic' }}>{errorLookupResult.escalate_reason}</p>
                                  )}
                                  <button type="button" onClick={() => setErrorLookupResult(null)}
                                    style={{ marginTop: 10, fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    Look up again
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Tenant responsibility note */}
            {tenantNote && (
              <>
                <Divider />
                <div style={{ ...section, paddingTop: 14, paddingBottom: 14, background: '#FFFBEB' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>📋 {tenantNote.clause}</p>
                  <p style={{ fontSize: 13, color: '#78350F', lineHeight: 1.6, margin: 0 }}>{tenantNote.note}</p>
                </div>
              </>
            )}

            {/* Auto-urgent notice */}
            {checkAutoUrgent() && (
              <>
                <Divider />
                <div style={{ ...section, paddingTop: 14, paddingBottom: 14, background: '#FEF3C7' }}>
                  <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>⚡ Based on your answers, we'll flag this as urgent.</p>
                </div>
              </>
            )}

            {/* Continue button */}
            <div style={{ ...section, paddingTop: 20 }}>
              <button
                style={{ ...nextBtn, opacity: description.trim().length < 6 ? 0.4 : 1, cursor: description.trim().length < 6 ? 'not-allowed' : 'pointer' }}
                disabled={description.trim().length < 6}
                onClick={handleFormNext}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: triage ────────────────────────────────────────────────── */}
        {step === 'triage' && triageResult && (
          <div style={card}>
            <div style={{ ...section, paddingBottom: 0 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💡</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#181614', marginBottom: 8 }}>You might be able to fix this yourself</h2>
              <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0 }}>{triageResult.tip}</p>
            </div>

            <div style={section}>
              <button type="button" onClick={() => setTriageExpanded(e => !e)}
                style={{ background: 'none', border: 'none', color: '#4B6358', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: triageExpanded ? 12 : 0 }}>
                {triageExpanded ? '▲ Hide steps' : '▼ Show me how'}
              </button>
              {triageExpanded && (
                <ol style={{ paddingLeft: 20, margin: '8px 0 0', lineHeight: 1.9 }}>
                  {triageResult.steps.map((s, i) => (
                    <li key={i} style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>{s}</li>
                  ))}
                </ol>
              )}
            </div>

            <Divider />
            <div style={section}>
              <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>Tried it and still need help?</p>
              <button type="button" onClick={() => setStep('photos')} style={nextBtn}>
                I still need a repair →
              </button>
              <button type="button" onClick={() => router.push('/tenant')}
                style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: '#9CA3AF', cursor: 'pointer', background: 'none', border: 'none', width: '100%' }}>
                Back to dashboard
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: photos ────────────────────────────────────────────────── */}
        {step === 'photos' && (
          <div style={card}>
            <div style={section}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#181614', marginBottom: 6 }}>Add photos</h2>
              <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>
                Optional — but they really help. The contractor arrives prepared, which means a faster fix.
              </p>

              {/* Issue photos */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ position: 'relative', width: 88, height: 88 }}>
                    <img src={p.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, border: '1px solid #E5E7EB' }} />
                    <button type="button" onClick={() => removePhoto(i)}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, background: '#EF4444', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ×
                    </button>
                  </div>
                ))}
                {photos.length < 4 && (
                  <button type="button" onClick={() => photoInputRef.current?.click()}
                    style={{ width: 88, height: 88, borderRadius: 10, border: '2px dashed #D1D5DB', background: '#F9FAFB', color: '#9CA3AF', fontSize: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    +
                  </button>
                )}
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={e => e.target.files && addPhotos(e.target.files)} />
            </div>

            {/* Appliance label scan */}
            {categoryId === 'appliances' && (
              <>
                <Divider />
                <div style={{ ...section, background: '#F0FDF4' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 4 }}>
                    📋 Got access to the appliance label?
                  </p>
                  <p style={{ fontSize: 12, color: '#4B7C5E', marginBottom: 12 }}>
                    Usually inside the door or on the back. We'll read the make, model & serial — helps order the right part before we arrive.
                  </p>
                  {!labelPhoto ? (
                    <button type="button" onClick={() => labelInputRef.current?.click()}
                      style={{ padding: '8px 16px', borderRadius: 10, background: '#166534', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      📷 Scan appliance label
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <img src={labelPhoto.preview} alt="Label" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid #BBF7D0' }} />
                      <div style={{ fontSize: 13, color: '#166534' }}>
                        {labelScanState === 'scanning' && <p>🔍 Reading label…</p>}
                        {labelScanState === 'done' && (
                          <>
                            {labelData.make && <div>Make: <strong>{labelData.make}</strong></div>}
                            {labelData.model && <div>Model: <strong>{labelData.model}</strong></div>}
                            {labelData.serial && <div>Serial: <strong>{labelData.serial}</strong></div>}
                            {!labelData.make && !labelData.model && !labelData.serial && <div>Couldn't read label — photo saved anyway</div>}
                          </>
                        )}
                        <button type="button" onClick={() => { setLabelPhoto(null); setLabelData({}); setLabelScanState('idle'); }}
                          style={{ marginTop: 8, fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                  <input ref={labelInputRef} type="file" accept="image/*" hidden onChange={e => e.target.files && handleLabelPhoto(e.target.files)} />
                </div>
              </>
            )}

            <div style={section}>
              <button style={nextBtn} onClick={() => setStep('urgency')}>Continue →</button>
              <button type="button" onClick={() => setStep('urgency')}
                style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: '#9CA3AF', cursor: 'pointer', background: 'none', border: 'none', width: '100%' }}>
                Skip photos
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: urgency ───────────────────────────────────────────────── */}
        {step === 'urgency' && (
          <div style={card}>
            <div style={section}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#181614', marginBottom: 18 }}>How urgent is this?</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {URGENCY_OPTIONS.map(opt => (
                  <button key={opt.id} type="button" onClick={() => setUrgency(opt.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                      borderRadius: 12, border: urgency === opt.id ? `2px solid ${opt.color}` : '1.5px solid #E5E7EB',
                      background: urgency === opt.id ? `${opt.color}10` : '#fff',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    <div style={{ width: 14, height: 14, borderRadius: 7, border: `2px solid ${opt.color}`, background: urgency === opt.id ? opt.color : 'transparent', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#181614' }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{opt.sub}</div>
                    </div>
                  </button>
                ))}
              </div>

              {urgency === 'emergency' && emInfo && (
                <div style={{ marginTop: 16, padding: '16px', borderRadius: 12, background: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#B91C1C', marginBottom: 8 }}>🚨 {emInfo.label}</p>
                  {emInfo.callServices && <p style={{ fontSize: 14, fontWeight: 700, color: '#7F1D1D', marginBottom: 8 }}>{emInfo.callServices}</p>}
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>Do this now:</p>
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    {emInfo.steps.map((s, i) => (
                      <li key={i} style={{ fontSize: 13, color: '#7F1D1D', marginBottom: 4 }}>{s}</li>
                    ))}
                  </ol>
                  {emInfo.trade && (
                    <div style={{ marginTop: 14 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#181614', marginBottom: 8 }}>Right now, is it under control?</p>
                      {([[true, 'Yes — it’s contained until morning'], [false, 'No — it’s still happening / not safe']] as const).map(([v, l]) => (
                        <button key={String(v)} type="button" onClick={() => setControlled(v)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', marginBottom: 6, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                            border: controlled === v ? '2px solid #B91C1C' : '1.5px solid #FECACA', background: controlled === v ? '#fff' : '#FFF7F7', color: '#181614' }}>
                          {l}
                        </button>
                      ))}
                      <p style={{ fontSize: 12, color: '#7F1D1D', marginTop: 4 }}>
                        {controlled === false ? 'We’ll text our emergency contractors as soon as you submit, and tell you who’s coming.' : controlled === true ? 'We’ll arrange someone first thing — tell us straight away if it gets worse.' : 'This tells us whether to send someone tonight.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {submitError && (
                <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 13, color: '#B91C1C' }}>
                  {submitError}
                </div>
              )}

              <button
                style={{ ...nextBtn, marginTop: 20, background: loading ? '#9CA3AF' : '#181614', cursor: loading ? 'not-allowed' : 'pointer' }}
                onClick={handleSubmit}
                disabled={loading || (urgency === 'emergency' && needsControlAnswer)}
              >
                {loading ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: done ──────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#181614', marginBottom: 8 }}>{emStatus && emStatus !== 'failed' ? 'We’re on it' : 'Report submitted'}</h2>
            <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, marginBottom: 32 }}>
              {emStatus === 'collecting' ? 'We’re sorry you’re dealing with this. We’re texting our emergency contractors now and will let you know who is coming and when — usually within 15 minutes. Keep following the steps until they arrive.'
                : emStatus === 'morning' ? 'Thanks for making it safe. We’ll arrange someone first thing in the morning. If it gets worse, report it again as “still happening”.'
                : emStatus === 'call_999' ? `${emInfo?.callServices ?? 'Please call the emergency services.'} We’ve told the office.`
                : emStatus === 'failed' ? 'Your report is in, but we couldn’t start the emergency call-out automatically — the office has your report. If it’s not safe, call us.'
                : 'We\'ll review it and be in touch to arrange a visit. You\'ll get a notification when a contractor is booked.'}
            </p>
            <button style={{ ...nextBtn, maxWidth: 240, margin: '0 auto' }} onClick={() => router.push('/tenant')}>
              Back to dashboard
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
        <div style={{ color: '#9CA3AF' }}>Loading…</div>
      </div>
    }>
      <ReportWizardContent />
    </Suspense>
  );
}
