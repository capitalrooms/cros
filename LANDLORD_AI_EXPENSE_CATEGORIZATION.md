# AI-Powered Expense Categorization for Landlords

**Status:** ✅ Feasible & Recommended  
**Safety Level:** Requires "human-in-the-loop" confirmation  
**Use Case:** Financial insights & tax reporting assistance

---

## 🎯 WHAT THIS DOES

Automatically analyze expense descriptions and:
- ✅ Categorize "Community Fibre Broadband 1Gbps" → **Utilities/Internet**
- ✅ Categorize "6 hours cleaning" → **Cleaning**
- ✅ Categorize "Washer machine cover" → **Maintenance**
- ✅ Aggregate yearly: "Total spent on Internet: £384" (12 × £32)
- ✅ Show trends: "Cleaning costs increased 20% YoY"
- ✅ Tax reporting: "Deductible expenses this year: £2,145"

**Example Report (for 71 Alloa Road):**
```
EXPENSE SUMMARY - 12 MONTHS (Aug 2025 - Jul 2026)

📺 Subscriptions                    £227.88
   Netflix:           £227.88 (12 × £18.99)

💡 Utilities/Internet              £384.00
   Broadband:         £384.00 (12 × £32.00)

🧹 Cleaning                        £1,080.00
   Professional:      £1,080.00 (12 × £90.00)

🛠️ Maintenance & Repairs           £431.76
   Equipment:         £71.88 (washer covers)
   Grounds/Garden:    £359.88 (weedkiller)

TOTAL EXPENSES:                    £2,123.64
```

---

## ⚠️ BULLETPROOF APPROACH (Human-in-the-Loop)

This is **NOT** auto-categorizing and storing. It's a **verification tool**.

### Architecture

```
User uploads statement
        ↓
AI analyzes each expense
        ↓
Suggests category + confidence
        ↓
Landlord reviews & confirms
        ↓
Only CONFIRMED data used for reports
        ↓
Audit trail shows: original → AI suggestion → confirmed category
```

### Step 1: AI Analysis (Claude API)

```typescript
// Input
{
  description: "Community Fibre Broadband 1Gbps",
  amount: 32.00
}

// Claude analyzes and returns
{
  suggested_category: "utilities",
  subcategory: "internet",
  confidence: 0.98,
  reasoning: "Broadband is internet connectivity, falls under utilities",
  keywords_matched: ["broadband", "fibre", "connectivity"],
  alternatives: ["subscriptions"] // in case user disagrees
}
```

### Step 2: User Confirmation (UI)

```
┌─────────────────────────────────────────────────┐
│ EXPENSE CATEGORIZATION                          │
├─────────────────────────────────────────────────┤
│ Description: Community Fibre Broadband 1Gbps    │
│ Amount: £32.00                                  │
│                                                 │
│ AI Suggests: 💡 Utilities (98% confident)      │
│                                                 │
│ ✓ Confirm  ✗ Disagree (choose different)      │
└─────────────────────────────────────────────────┘

If ✗ Disagree:
  [Subscriptions] [Maintenance] [Other]
```

### Step 3: Store Only Confirmed Data

```
CONFIRMED EXPENSES (Only these used for reports)
├─ Original: "Community Fibre Broadband 1Gbps"
├─ AI Suggested: utilities (98%)
├─ Landlord Confirmed: utilities ✓
├─ Date Confirmed: 2026-08-14
└─ Audit Trail: AI → Human → Confirmed
```

### Step 4: Generate Reports from Confirmed Data Only

```
"Based on 87 confirmed expense categorizations"
(not on AI suggestions alone)
```

---

## 🔒 MAKING IT BULLETPROOF

### 1. **Confidence Scoring**
```
High Confidence (95%+)
- "6 hours cleaning" → Cleaning ✓ Auto-confirm option
- "Netflix" → Subscriptions ✓

Medium Confidence (80-94%)
- "Property maintenance" → Maintenance (requires review)
- "Cleaning supplies" → Cleaning (could be supplies vs labor)

Low Confidence (<80%)
- "Professional services £500" → ??? (could be anything)
- "Misc expenses" → ??? (too vague)
```

### 2. **Audit Trail (Critical)**
```
Every categorization shows:
├─ Original description
├─ AI suggestion + confidence + reasoning
├─ User decision (confirm/change)
├─ Date/time of confirmation
├─ Who confirmed it (landlord email)
└─ Any manual corrections

"If there's ever a tax audit, we can prove:
 'We used AI to suggest, human verified every entry'"
```

### 3. **Category Validation**
```
Predefined categories (no freeform):
- Subscriptions (Netflix, etc.)
- Utilities (Internet, electricity, water)
- Cleaning (labor + supplies)
- Maintenance (repairs, replacements)
- Insurance
- Tax/Legal
- Miscellaneous (for edge cases)

AI must choose from this list (no custom categories)
```

### 4. **Duplicate Prevention**
```
System checks:
- "Netflix" appearing 12x in a year at £18.99 each
  → Recognizes as recurring subscription
  → Confirms all 12 at once (not individually)
  → Shows: "12 × Netflix @ £18.99 = £227.88 (Monthly subscription)"
```

### 5. **Anomaly Detection**
```
Alerts landlord to unusual patterns:
- "Netflix charged twice in July?" (flag for review)
- "Broadband costs jumped 300%?" (verify not a data error)
- "£50,000 maintenance in one month?" (likely error, confirm)
```

### 6. **Confidence Threshold for Auto-Confirm**
```
High-confidence items (95%+) can have "quick confirm" option:
✓ Netflix                   £18.99      [CONFIRM]
✓ Broadband                 £32.00      [CONFIRM]
✓ Property Cleaning (6hrs)  £90.00      [CONFIRM]

Confirm All High-Confidence → Proceed
```

### 7. **Manual Override Capability**
```
Landlord can:
- Accept AI suggestion
- Choose from alternatives
- Create new category (with warning: "This will be untracked for insights")
- Ignore (don't categorize this entry)
- Mark as "needs review later"

Each decision logged for audit trail
```

### 8. **Clear Disclaimers**
```
Report Header:
"FINANCIAL INSIGHTS (FOR INFORMATIONAL PURPOSES ONLY)

This report is generated using AI-assisted expense categorization,
reviewed and confirmed by you on [date]. 

⚠️ This is not an official accounting record.
⚠️ For tax purposes, refer to your official statement.
⚠️ Use for insights and planning only.
⚠️ Share with accountant for verification.

Generated: 2026-08-14
Confirmed entries: 87 of 92 (95%)
Unconfirmed: 5 (will not appear in reports)
"
```

### 9. **Privacy & Compliance**
```
Considerations:
- Expense data is sensitive financial information
- Only use Claude API (Anthropic won't train on it)
- Add privacy notice: "AI processing for categorization"
- Store categorizations in database (not in AI model)
- Ability to delete/purge categorizations if user requests

Database permissions:
├─ Only landlord can see their expenses
├─ Admin can see only if landlord grants access
├─ No third-party access without explicit consent
```

### 10. **Cost Optimization**
```
Don't analyze every expense individually via API.

Strategy:
1. First pass: Keyword matching (free, instant)
   - Netflix → Subscriptions
   - Broadband → Utilities
   - Cleaning → Cleaning
   
2. Only uncertain entries → Claude API
   - "Professional services" → Analyze
   - "Misc charge" → Analyze
   - Ambiguous → Analyze

Result: Only ~10% of expenses need AI, saves 90% on API calls
```

---

## 💻 IMPLEMENTATION APPROACH

### Phase 1: Simple Keyword Matching (Week 1)
```
Before using AI at all:

const categoryRules = {
  subscriptions: ['netflix', 'spotify', 'aws'],
  utilities: ['broadband', 'electricity', 'water', 'fibre', 'internet'],
  cleaning: ['cleaning', 'cleaner', 'janitorial'],
  maintenance: ['repair', 'maintenance', 'fix', 'replace'],
  insurance: ['insurance', 'cover'],
}

Match expense description against keywords
→ If match found, use that category (high confidence)
→ If no match, send to Claude API
```

### Phase 2: AI for Uncertain Cases (Week 2)
```
For expenses that don't match keywords:

POST /api/categorize-expense
{
  description: "Professional services - plumbing inspection",
  amount: 150.00
}

Claude returns:
{
  category: "maintenance",
  confidence: 0.92,
  reasoning: "Plumbing inspection is preventive maintenance",
  keywords: ["plumbing", "inspection", "professional"],
  alternatives: ["maintenance - other"]
}

User confirms → Stored in database
```

### Phase 3: Batch Processing & Reports (Week 3)
```
Monthly:
1. Collect all confirmed categorizations
2. Run aggregations
3. Generate reports
4. Show year-over-year trends
5. Export for accountant
```

### Phase 4: Insights Dashboard (Week 4)
```
Landlord sees:
- Expense breakdown by category
- Month-by-month trends
- Year-over-year comparison
- Alerts (anomalies, unusual patterns)
- Tax-deductible vs non-deductible
```

---

## 🎯 WHAT THE UI LOOKS LIKE

### Screen 1: Statement Upload
```
┌─────────────────────────────────────┐
│ Import Statement (LS1001)           │
├─────────────────────────────────────┤
│ 92 expense entries found            │
│                                     │
│ Analyzing with AI...               │
│                                     │
│ ✓ 54 auto-categorized (high conf)  │
│ ⚠️ 38 need your review              │
│                                     │
│ [Review Categorizations]            │
└─────────────────────────────────────┘
```

### Screen 2: Review & Confirm
```
┌─────────────────────────────────────┐
│ Review Categorizations (38 of 38)  │
├─────────────────────────────────────┤
│                                     │
│ ✓ Netflix                           │
│   AI: Subscriptions (98%)          │
│   [CONFIRM]                        │
│                                     │
│ ⚠️ Professional services - £500    │
│   AI: Maintenance (67%)            │
│   [CONFIRM] [CHANGE] [SKIP]        │
│                                     │
│ [Confirm All Remaining]             │
│ [View Report Preview]               │
└─────────────────────────────────────┘
```

### Screen 3: Insights Report
```
┌─────────────────────────────────────┐
│ 💡 Expense Insights - 12 Months     │
├─────────────────────────────────────┤
│                                     │
│ 📊 Spending by Category             │
│                                     │
│ Utilities/Internet      ████ £384   │
│ Cleaning               ██████ £1,080│
│ Subscriptions          ███ £228     │
│ Maintenance            ████ £432    │
│                                     │
│ TOTAL:                       £2,124 │
│                                     │
│ 📈 Year-over-Year                   │
│ Internet: +£48 (14% increase)       │
│ Cleaning: -£120 (10% decrease)      │
│                                     │
│ ✓ Confirmed: 92/92 entries          │
│ ⚠️ For tax purposes, verify with     │
│    your accountant                   │
│                                     │
│ [Export for Accountant] [Print]     │
└─────────────────────────────────────┘
```

---

## 🚀 SECURITY & VALIDATION

### Before Going Live, Verify:

- [ ] **Accuracy Testing**: Run 100 test expenses, 95%+ accuracy target
- [ ] **Edge Cases**: Test unusual entries that could confuse AI
- [ ] **Consistency**: Same expense description always gets same category
- [ ] **Audit Trail**: Every decision logged with full context
- [ ] **Privacy**: No expense data retained in AI model
- [ ] **Performance**: Categorization returns in <2 seconds
- [ ] **Cost**: API usage tracked and budgeted
- [ ] **Compliance**: Privacy policy updated re: AI processing
- [ ] **User Testing**: 5 landlords test full workflow
- [ ] **Fallback**: System works fine with keyword-only (AI disabled)

---

## ⚡ CONFIDENCE LEVELS & THRESHOLDS

| Confidence | Action | Example |
|-----------|--------|---------|
| 95-100% | Can auto-confirm with review option | Netflix → Subscriptions |
| 85-94% | Requires user confirmation | Broadband → Utilities |
| 70-84% | Requires confirmation + shows alternatives | "Professional services" → Maintenance |
| <70% | Shows 3 options, user must choose | Ambiguous entry |

---

## 📋 DATABASE SCHEMA

```sql
CREATE TABLE expense_categorizations (
  id UUID PRIMARY KEY,
  statement_id UUID REFERENCES landlord_statements(id),
  expense_id UUID, -- internal ID of expense in statement
  
  -- Original data
  original_description VARCHAR(500),
  amount NUMERIC(10,2),
  
  -- AI Analysis
  ai_suggested_category VARCHAR(50),
  ai_confidence NUMERIC(3,2), -- 0.00 to 1.00
  ai_reasoning TEXT,
  ai_alternatives JSONB, -- ["alternative1", "alternative2"]
  
  -- User Decision
  confirmed_category VARCHAR(50),
  confirmed_by UUID REFERENCES people(id),
  confirmed_at TIMESTAMP,
  notes TEXT, -- user notes on why they changed it
  
  -- Audit
  status VARCHAR(20), -- confirmed, pending, skipped
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## 🎯 FINAL SAFEGUARDS

1. **Insurance-Grade Accuracy**
   - AI suggests, human confirms
   - Never auto-store unconfirmed AI decisions
   - Always show original + suggestion side-by-side
   - Audit trail for every decision

2. **Financial Integrity**
   - Reports clearly marked as "AI-assisted"
   - Disclaimers on every financial report
   - Export format includes confirmation status
   - Version history (can see how categorizations changed)

3. **User Control**
   - Can override any AI suggestion
   - Can disable AI and do manual categorization
   - Can delete/recategorize old entries
   - Can export raw data for accountant verification

4. **Technical Safeguards**
   - Rate limiting on API calls
   - Anomaly detection alerts user to review
   - Duplicate detection (same expense twice = flag)
   - Validation (cost shouldn't be negative, etc.)

---

## 💰 COST ESTIMATE

**Per Landlord, Per Year:**
- Statement processing: ~12 statements
- High-confidence items: ~60% (keyword match, free)
- AI analysis items: ~40% (maybe 40 expenses × £0.001 = $0.04)

**Total:** ~$0.04-0.10 per landlord per year (negligible)

---

## ✅ WHEN THIS BECOMES PRODUCTION-READY

- [x] Keyword matching implemented (Phase 1)
- [ ] AI integration tested (Phase 2)
- [ ] 95%+ accuracy verified
- [ ] Audit trail fully logged
- [ ] User testing completed
- [ ] Privacy compliance reviewed
- [ ] Disclaimer added to UI
- [ ] Fallback to manual categorization works

---

## 🎯 COMPETITIVE ADVANTAGE

This positions CROS as:
- **More than just a display tool** → Actually helps with financial planning
- **Accountant-friendly** → Provides clear categorizations for tax filing
- **Landlord-friendly** → Shows trends and insights they care about
- **Trust-building** → "AI suggests, you verify" = transparent & safe
- **Data-rich** → Enables better business decisions

Landlords get:
✅ "I spent £384 on internet this year"  
✅ "My cleaning costs went up 20%"  
✅ "Total tax-deductible expenses: £2,124"  
✅ Full audit trail for accountant  
✅ Confidence I was involved in every decision  

---

## 🚨 CRITICAL: MUST BE HUMAN-VERIFIED

**This is not:**
- Auto-categorization that stores unreviewed AI decisions
- Used for official accounting
- A replacement for accountant review

**This IS:**
- AI-assisted with human verification required
- For insights and planning only
- Fully auditable with clear trails
- Never without landlord confirmation

**Golden Rule:** Never let AI make financial decisions alone. Always: AI suggests → Human confirms → Store confirmed decision.

