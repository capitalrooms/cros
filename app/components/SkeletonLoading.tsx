'use client'

/**
 * Skeleton loading component that matches the actual layout
 * Prevents glitchy layout shifts by pre-rendering the page structure
 */

export function TenantDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl animate-pulse">
      {/* AppBar */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-lg py-md flex items-center justify-between">
          <div className="h-8 w-32 rounded bg-neutral-200" />
          <div className="h-8 w-24 rounded bg-neutral-200" />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-lg">
        {/* Header section - dark band */}
        <section className="-mb-3xl bg-neutral-900 pb-3xl text-white" style={{ marginInline: '-16px', paddingInline: '16px' }}>
          <div className="pt-lg">
            <div className="h-4 w-32 rounded bg-white/20" />
            <div className="mt-md h-8 w-96 rounded bg-white/10" />
            <div className="mt-xs h-6 w-80 rounded bg-white/10" />

            {/* Stats grid */}
            <div className="mt-lg grid grid-cols-3 gap-md border-t border-white/15 pt-lg">
              {[1, 2, 3].map(i => (
                <div key={i}>
                  <div className="h-4 w-20 rounded bg-white/20" />
                  <div className="mt-xs h-6 w-32 rounded bg-white/10" />
                  <div className="mt-xs h-4 w-24 rounded bg-white/20" />
                </div>
              ))}
            </div>

            {/* Next visit card skeleton */}
            <div className="mt-lg rounded-2xl bg-white p-lg text-neutral-900">
              <div className="h-4 w-40 rounded bg-neutral-200" />
              <div className="mt-md h-8 w-48 rounded bg-neutral-200" />
              <div className="mt-md h-6 w-64 rounded bg-neutral-200" />
              <div className="mt-lg border-t border-neutral-200 pt-md">
                <div className="h-4 w-96 rounded bg-neutral-200" />
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming section */}
        <section className="mt-3xl pt-md">
          <div className="h-6 w-40 rounded bg-neutral-200" />
          <div className="mt-md grid gap-md md:grid-cols-2">
            {[1, 2].map(i => (
              <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-lg">
                <div className="h-4 w-32 rounded bg-neutral-200" />
                <div className="mt-md space-y-md">
                  {[1, 2].map(j => (
                    <div key={j} className="border-l-2 border-neutral-200 pl-md">
                      <div className="h-4 w-48 rounded bg-neutral-200" />
                      <div className="mt-xs h-4 w-40 rounded bg-neutral-200" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Property notes section */}
        <section className="mt-3xl">
          <div className="h-6 w-32 rounded bg-neutral-200" />
          <div className="mt-md space-y-md">
            {[1, 2].map(i => (
              <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-50 p-lg">
                <div className="h-4 w-32 rounded bg-neutral-200" />
                <div className="mt-md h-4 w-64 rounded bg-neutral-200" />
                <div className="mt-md h-12 w-full rounded bg-neutral-200" />
              </div>
            ))}
          </div>
        </section>

        {/* Action cards section */}
        <section className="mt-3xl">
          <div className="h-6 w-32 rounded bg-neutral-200" />
          <div className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-lg">
                <div className="h-4 w-24 rounded bg-neutral-200" />
                <div className="mt-md h-4 w-32 rounded bg-neutral-200" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export function ContractorDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl animate-pulse">
      {/* AppBar */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-lg py-md flex items-center justify-between">
          <div className="h-8 w-32 rounded bg-neutral-200" />
          <div className="h-8 w-24 rounded bg-neutral-200" />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-lg">
        {/* Header section */}
        <section className="-mb-3xl bg-neutral-900 pb-3xl text-white" style={{ marginInline: '-16px', paddingInline: '16px' }}>
          <div className="pt-lg">
            <div className="h-4 w-32 rounded bg-white/20" />
            <div className="mt-md h-8 w-96 rounded bg-white/10" />
            <div className="mt-lg rounded-2xl bg-white p-lg text-neutral-900">
              <div className="h-6 w-40 rounded bg-neutral-200" />
              <div className="mt-md h-8 w-48 rounded bg-neutral-200" />
              <div className="mt-md grid grid-cols-3 gap-md">
                {[1, 2, 3].map(i => (
                  <div key={i}>
                    <div className="h-4 w-20 rounded bg-neutral-200" />
                    <div className="mt-md h-6 w-24 rounded bg-neutral-200" />
                  </div>
                ))}
              </div>
              <div className="mt-md flex gap-md">
                <div className="flex-1 h-10 rounded bg-neutral-200" />
                <div className="flex-1 h-10 rounded bg-neutral-200" />
              </div>
            </div>
          </div>
        </section>

        {/* Jobs section */}
        <section className="mt-3xl">
          <div className="h-6 w-32 rounded bg-neutral-200" />
          <div className="mt-md space-y-md">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-neutral-200 bg-white p-lg">
                <div className="h-4 w-40 rounded bg-neutral-200" />
                <div className="mt-md h-4 w-32 rounded bg-neutral-200" />
                <div className="mt-md flex gap-md">
                  <div className="flex-1 h-8 rounded bg-neutral-200" />
                  <div className="flex-1 h-8 rounded bg-neutral-200" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export function AdminDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl animate-pulse">
      {/* AppBar */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-lg py-md flex items-center justify-between">
          <div className="h-8 w-32 rounded bg-neutral-200" />
          <div className="h-8 w-24 rounded bg-neutral-200" />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-lg">
        <div className="mt-2xl">
          <div className="h-6 w-40 rounded bg-neutral-200" />
          <div className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-neutral-200 bg-white p-lg">
                <div className="h-4 w-32 rounded bg-neutral-200" />
                <div className="mt-md h-8 w-16 rounded bg-neutral-200" />
                <div className="mt-md h-4 w-24 rounded bg-neutral-200" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export function GenericPageSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl animate-pulse">
      {/* AppBar */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-lg py-md flex items-center justify-between">
          <div className="h-8 w-32 rounded bg-neutral-200" />
          <div className="h-8 w-24 rounded bg-neutral-200" />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="h-8 w-48 rounded bg-neutral-200 mb-lg" />
        <div className="space-y-md">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-lg border border-neutral-200 bg-white p-lg h-24" />
          ))}
        </div>
      </main>
    </div>
  )
}
