# Capital Rooms Design System & Brand Guidelines

## Overview

This document ensures visual consistency and continuity across the entire Capital Rooms platform. All pages must follow these standards.

---

## 1. Logo & Branding

### Logo Placement
- **AppBar (Header):** Logo appears at the left of the sticky header on EVERY page
- **Logo Size:** 48px height (h-12) for consistent visual weight
- **Logo Variant:** "mark" variant (icon only, for header space efficiency)
- **Invert:** Always inverted (white) against dark background

### Rules
✅ Logo ALWAYS in AppBar  
✅ Same size on all pages (48px height)  
✅ Consistent padding and alignment  
✅ Never resize or reposition per page  

### Logo Display Code
```tsx
<Logo variant="mark" className="h-12 w-auto" invert priority />
```

---

## 2. Page Layout Structure

### Every Page Must Follow This Structure

```
┌─────────────────────────────────────┐
│         AppBar with Logo            │  ← Fixed height, sticky, z-50
├─────────────────────────────────────┤
│                                     │
│   Main Content (max-width: 6xl)     │  ← px-lg (16px), py-2xl (32px)
│                                     │
└─────────────────────────────────────┘
```

### Spacing Standards
- **Container max-width:** `max-w-6xl` (1280px)
- **Container padding:** `px-lg` (16px on each side)
- **Top padding:** `py-2xl` (32px)
- **Bottom padding:** `pb-3xl` (48px)
- **Section spacing:** `mt-3xl` (48px) between sections
- **Card padding:** `p-lg` (16px)

### Layout Template
```tsx
<div className="min-h-screen bg-neutral-100 pb-3xl">
  <AppBar right={rightContent} />
  
  <main className="mx-auto max-w-6xl px-lg py-2xl">
    {/* Page content */}
  </main>
</div>
```

---

## 3. Dashboard Consistency

### All Dashboards Must Have:

1. **Consistent AppBar**
   - Logo (48px height)
   - Optional title
   - Right content (sign out button, etc.)

2. **Consistent Main Container**
   - `max-w-6xl` width
   - `px-lg` padding
   - `py-2xl` top padding
   - `pb-3xl` bottom padding

3. **Consistent Section Spacing**
   - `mt-3xl` between sections (48px)
   - `pt-md` (8px) for section top padding

4. **Consistent Card Styling**
   - `rounded-2xl` for border radius
   - `border border-neutral-200` for borders
   - `bg-white` for background
   - `p-lg` for padding
   - `shadow-sm` for subtle shadow

### Dashboard Types

#### Type A: Header Band + Content (Tenant, Contractor)
```
┌─────────────────────┐
│   AppBar with Logo  │
├─────────────────────┤
│  Dark Header Band   │  ← bg-neutral-950, pb-3xl
│  (Tenancy/Job info) │
├─────────────────────┤
│   Main Content      │  ← Normal spacing
└─────────────────────┘
```

#### Type B: Simple Dashboard (Admin, Agent, Landlord)
```
┌─────────────────────┐
│   AppBar with Logo  │
├─────────────────────┤
│   Main Content      │  ← py-2xl from top
│   (Grid of cards)   │
└─────────────────────┘
```

---

## 4. Color Palette

### Dark Mode (AppBar)
- **Background:** `bg-neutral-950` (#0a0a0a)
- **Border:** `border-neutral-800`
- **Text:** `text-white` for primary, `text-white/80` for secondary

### Light Mode (Content)
- **Background:** `bg-neutral-100` for most pages
- **Cards:** `bg-white` with `border-neutral-200`
- **Text:** `text-neutral-900` for primary, `text-neutral-600` for secondary

---

## 5. Typography

### Heading Hierarchy
```
Page Title:      text-3xl font-bold text-neutral-900
Section Header:  text-xl font-bold text-neutral-900
Card Title:      text-sm font-semibold text-neutral-900
Text:            text-sm text-neutral-600
Labels:          text-xs uppercase tracking-widest text-neutral-500
```

### Font Sizes
- `text-3xl` - Page titles
- `text-xl` - Section headers
- `text-sm` - Body text, card titles
- `text-xs` - Labels, captions

---

## 6. Components

### AppBar
- **Location:** `@/components/AppBar`
- **Usage:** On every page
- **Props:** `title` (optional), `right` (ReactNode)
- **Logo:** Automatically included, 48px height

### DashboardLayout (Optional)
- **Location:** `@/app/components/DashboardLayout`
- **Use for:** Ensuring consistent structure
- **Components included:** DashboardSection, DashboardHeader, DashboardCard, DashboardGrid

### SkeletonLoading
- **Location:** `@/app/components/SkeletonLoading`
- **Types:** TenantDashboardSkeleton, ContractorDashboardSkeleton, etc.
- **Usage:** Show during loading state

---

## 7. Responsive Design

### Breakpoints
- **Mobile:** Default (< 640px)
- **Tablet:** `sm:` (640px+)
- **Desktop:** `md:` (768px+)
- **Large:** `lg:` (1024px+)

### Container Adjustment
- All pages use `max-w-6xl` (fixed maximum)
- Padding adjusts with `px-lg` on all sizes
- Grid columns: `md:grid-cols-2 lg:grid-cols-3` (default)

---

## 8. Page Structure Checklist

Use this checklist for every dashboard/page:

- [ ] AppBar at top with Logo (48px height, inverted)
- [ ] `max-w-6xl` container with `mx-auto`
- [ ] `px-lg py-2xl` padding on main content
- [ ] `pb-3xl` bottom padding
- [ ] `bg-neutral-100` for light pages, `bg-white` for cards
- [ ] Section spacing: `mt-3xl pt-md`
- [ ] Cards use `rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm`
- [ ] Typography hierarchy followed (text-3xl, text-xl, text-sm, text-xs)
- [ ] Sticky AppBar (sticky top-0 z-50)
- [ ] SkeletonLoading shown during data fetch

---

## 9. Common Issues & Solutions

### Logo Too Small
- **Wrong:** `h-8 w-12`
- **Right:** `h-12 w-auto`

### Inconsistent Spacing
- **Wrong:** Different padding on each page
- **Right:** Always use `px-lg py-2xl pb-3xl`

### AppBar Not Sticky
- **Wrong:** No sticky property
- **Right:** `sticky top-0 z-50`

### Content Area Too Wide/Narrow
- **Wrong:** No max-width or wrong max-width
- **Right:** Always use `max-w-6xl mx-auto`

### Logo Inverted Wrong
- **Wrong:** Black logo on dark background
- **Right:** White logo (invert filter) on dark background

---

## 10. Implementation Checklist

### Before Deploying Any Page:
1. ✅ Logo displays at 48px height in AppBar
2. ✅ Main content has `max-w-6xl mx-auto`
3. ✅ Padding is `px-lg py-2xl pb-3xl`
4. ✅ Sections are spaced with `mt-3xl pt-md`
5. ✅ Cards follow standard styling
6. ✅ AppBar is sticky
7. ✅ SkeletonLoading shown during loading
8. ✅ Typography hierarchy is correct
9. ✅ Colors are consistent (dark header, light content)
10. ✅ Responsive design works on mobile/tablet/desktop

---

## Examples

### ✅ Correct: Tenant Dashboard Structure
```tsx
<div className="min-h-screen bg-neutral-100 pb-3xl">
  <AppBar right={<button>Sign out</button>} />
  
  <main className="mx-auto max-w-6xl px-lg py-2xl">
    {/* Dark band for tenancy info */}
    <section className="bg-neutral-950 pb-3xl text-white" style={{ marginInline: '-16px', paddingInline: '16px' }}>
      {/* Tenancy details */}
    </section>
    
    {/* Main content sections */}
    <section className="mt-3xl pt-md">
      <h2 className="text-xl font-bold text-neutral-900">Section Title</h2>
      <div className="mt-md grid gap-md md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm">
          {/* Card content */}
        </div>
      </div>
    </section>
  </main>
</div>
```

### ✅ Correct: Admin Dashboard Structure
```tsx
<div className="min-h-screen bg-neutral-100 pb-3xl">
  <AppBar right={<button>Sign out</button>} />
  
  <main className="mx-auto max-w-6xl px-lg py-2xl">
    <h1 className="text-3xl font-bold text-neutral-900">Admin Dashboard</h1>
    
    <section className="mt-3xl pt-md">
      <h2 className="text-xl font-bold text-neutral-900">Section</h2>
      <div className="mt-md grid gap-md md:grid-cols-2 lg:grid-cols-3">
        <DashboardCard>{/* content */}</DashboardCard>
      </div>
    </section>
  </main>
</div>
```

---

## Notes

- This design system ensures **brand consistency** across all roles
- The **logo is never resized or repositioned** per page
- **Spacing is predictable** and maintains visual hierarchy
- **Components are reusable** and standardized
- **Responsive design** works across all devices

**Last Updated:** Aug 6, 2026  
**Version:** 1.0
