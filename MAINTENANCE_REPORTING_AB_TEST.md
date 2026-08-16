# Maintenance Reporting A/B Test Design

**Goal:** Test two reporting approaches to see which tenants prefer  
**Approach:** Run both simultaneously, gather usage metrics, iterate

---

## OPTION A: Current Flow (Keep as-is)

**Path:** Tenant dashboard → "Report Maintenance" → Direct form submission

**User experience:**
- Category picker (plumbing, electrical, etc.)
- Free-text description
- Submit → ticket created
- ✅ Fast and simple
- ❌ Low diagnostic info, might spam professional

**Use case:** Users who know they need a professional

---

## OPTION B: New AI-Powered Flow (NEW)

**Path:** Tenant dashboard → "Get Help First" → Interactive diagnosis

**Step 1: Category Selection**
- Pick category (plumbing, electrical, heating, appliances, etc.)
- See emoji icon + description

**Step 2: Initial Description**
- "What's happening?" (open text)
- Example: "Water dripping from pipe under sink"

**Step 3: AI Smart Follow-up (3-4 questions)**
- Question generation based on category + description
- Examples:
  - Plumbing: "Is it dripping constantly or only when you use the sink?"
  - Electrical: "When did this start? After a power outage?"
  - Heating: "Have you adjusted the thermostat? Is it on?"

**Step 4: AI Diagnosis**
- Analyzes answers and responds with:
  - 🟢 **DIY Fix** - "This might be a loose fitting. Here's how to check..."
  - 🟡 **Maybe DIY** - "Try this first, but if it continues, we'll send a professional"
  - 🔴 **Professional Needed** - "This needs a licensed plumber. We're booking..."

**Step 5: User Choice**
- 🟢 **Try DIY** → Shows step-by-step guide + "Report if it doesn't work" button
- 🟡 **Try DIY or Escalate** → Both options available
- 🔴 **Call Professional** → Auto-escalates to ticket

**Step 6: Ticket Submission**
- Auto-populated with diagnosis + user's answers
- Rich context for contractor
- Tracks if it was DIY-preventable

---

## COMPARISON TABLE

| Aspect | Option A (Report) | Option B (Get Help First) |
|--------|------------------|-------------------------|
| **Speed** | 30 seconds | 2-3 minutes |
| **Information quality** | Basic | Rich (with diagnosis) |
| **Professional waste** | High | Low |
| **User education** | None | High |
| **Engagement** | None | High |
| **When to use** | "I know I need help" | "What should I do?" |

---

## NAMING OPTIONS

**Option B Flow Names:**
1. **"Get Help First"** ← Friendly, implies diagnosis before calling
2. **"Troubleshoot First"** ← Action-oriented
3. **"Smart Diagnosis"** ← Technical
4. **"Try This First"** ← Empowering
5. **"Ask an Expert"** ← Implies AI help

**Recommendation:** "Get Help First" - implies "let's figure this out together"

---

## UI Layout

```
Tenant Maintenance Hub
═══════════════════════════════════════════

┌─────────────────────────────────────────┐
│  Report a problem at your property      │
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │   Report     │    │  Get Help    │  │
│  │ Maintenance  │    │    First     │  │
│  │              │    │              │  │
│  │ 30 seconds   │    │ 2-3 minutes  │  │
│  │ Direct form  │    │ Smart Q&A    │  │
│  │              │    │ AI guidance  │  │
│  └──────────────┘    └──────────────┘  │
│                                         │
│  [Both paths appear on same screen]     │
│                                         │
└─────────────────────────────────────────┘

Your recent reports:
[List of submitted maintenance requests]
```

---

## DATA TRACKING (A/B Metrics)

Track for each path:
- **Adoption:** % users choosing each path
- **Time to submit:** Average time to completion
- **Ticket quality:** Amount of info provided
- **Professional dispatch rate:** % escalated vs DIY
- **DIY success rate:** % who tried fix + reported back
- **User satisfaction:** NPS per path (future)

---

## DATABASE SCHEMA

### New tables:
```
maintenance_diagnostic_attempts
├── id (PK)
├── tenant_id (FK)
├── property_id (FK)
├── room_id (FK)
├── category (enum: plumbing, electrical, etc.)
├── initial_description (text)
├── ai_questions (jsonb) - [Q1, Q2, Q3, Q4]
├── user_answers (jsonb) - [A1, A2, A3, A4]
├── ai_recommendation (enum: diy, maybe_diy, professional_needed)
├── ai_guidance (text) - Step-by-step or reasoning
├── user_choice (enum: try_diy, escalate_to_pro)
├── maintenance_ticket_id (FK) - If escalated
├── created_at
└── resolved_at (when user submits final)
```

---

## PHASE 1 ROLLOUT

**Week 1-2:** Both buttons available, track which users click what  
**Week 3-4:** Analyze metrics, refine AI questions if needed  
**Week 5+:** Decision time
- Remove one? (unlikely)
- Optimize both?
- Combine best of both?

---

## TECHNICAL IMPLEMENTATION

**Option A (Existing):**
- Keep `/app/tenant/maintenance/page.tsx` as-is
- Button label: "Report Maintenance"

**Option B (New):**
- Create `/app/tenant/maintenance-diagnose/page.tsx`
- Button label: "Get Help First"
- Uses Anthropic API for AI Q&A generation
- Integrates with existing ticket system

**Both buttons on:** `/app/tenant/page.tsx` (maintenance section)

---

## AI QUESTION GENERATION LOGIC

**Input to Claude API:**
```
Category: Plumbing
User description: "Water dripping from pipe under sink"

Generate 3-4 diagnostic questions for a tenant with no plumbing knowledge.
Questions should help determine if this is:
- A simple fix (loose fitting)
- DIY-possible (weak shut-off valve)
- Professional-only (pipe corrosion)

Make questions simple, with yes/no or multiple choice.
```

**Claude Response:**
```
Q1: Is the water dripping constantly, or only when you use the sink?
Q2: Have you noticed the pipe is wet in other places too?
Q3: Does it drip faster or slower when water is hot vs cold?
Q4: Can you reach under the sink without moving things?
```

---

## NEXT DECISION

**Should I build both paths now?**

Option 1: Build "Get Help First" flow with AI (comprehensive)  
Option 2: Build simple version first without AI (just capture more questions)  
Option 3: Build "Get Help First" with mock AI responses (test UX before API)

**Recommendation:** Option 1 - Full AI-powered flow
- More interesting to test
- Better demonstrates value
- Can toggle AI on/off per question if needed

---

**Ready to build? This will be a new page + API endpoint + database table.**
