import { ReactNode } from 'react'

/**
 * Standard content wrapper for every admin page.
 * Matches Dashboard: bg-neutral-100 background, max-w-6xl, px-lg py-xl.
 */
export default function AdminPageContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-full bg-neutral-100">
      <div className={`mx-auto max-w-6xl px-lg py-xl${className ? ` ${className}` : ''}`}>
        {children}
      </div>
    </div>
  )
}
