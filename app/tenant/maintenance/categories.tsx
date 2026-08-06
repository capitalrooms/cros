'use client';

import Link from 'next/link';

export const MAINTENANCE_CATEGORIES = [
  {
    id: 'appliances',
    title: 'Appliances',
    description: 'Dishwasher, oven, cooker, fridge, washing machine, microwave',
    icon: '🍽️',
    color: 'from-orange-500 to-orange-600',
  },
  {
    id: 'furniture',
    title: 'Furniture',
    description: 'Bed, table, chair, sofa, cabinet, damaged pieces',
    icon: '🪑',
    color: 'from-amber-500 to-amber-600',
  },
  {
    id: 'plumbing',
    title: 'Plumbing',
    description: 'Leaking taps, pipes, drains, water pressure, hot water',
    icon: '🚰',
    color: 'from-blue-500 to-blue-600',
  },
  {
    id: 'electrical',
    title: 'Electrical',
    description: 'Light switches, sockets, circuit breakers, power issues',
    icon: '⚡',
    color: 'from-yellow-500 to-yellow-600',
  },
  {
    id: 'heating-cooling',
    title: 'Heating & Cooling',
    description: 'Boiler, radiators, thermostat, AC, temperature control',
    icon: '🌡️',
    color: 'from-red-500 to-red-600',
  },
  {
    id: 'structure',
    title: 'Structure & Building',
    description: 'Cracks, damp, mold, roof leaks, windows, doors',
    icon: '🏗️',
    color: 'from-gray-600 to-gray-700',
  },
  {
    id: 'safety',
    title: 'Safety & Security',
    description: 'Broken locks, loose railings, hazards, emergency issues',
    icon: '🔒',
    color: 'from-red-600 to-red-700',
  },
  {
    id: 'cleanliness',
    title: 'Cleanliness & Pests',
    description: 'Pest infestation, unclean areas, odors, vermin',
    icon: '🪲',
    color: 'from-green-600 to-green-700',
  },
  {
    id: 'decoration',
    title: 'Decoration & Finishes',
    description: 'Paint, wallpaper, tiles, flooring, scratches, marks',
    icon: '🎨',
    color: 'from-purple-500 to-purple-600',
  },
];

export default function CategorySelection() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <nav className="border-b border-neutral-200 bg-white">
        <div className="px-lg py-md flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Report Maintenance Issue</h1>
          <Link href="/tenant" className="text-sm text-neutral-600 hover:text-neutral-900">
            Back to Dashboard
          </Link>
        </div>
      </nav>

      <main className="px-lg py-xl">
        <div className="max-w-5xl mx-auto">
          <div className="mb-xl text-center">
            <h2 className="text-2xl font-bold text-neutral-900 mb-sm">
              What needs to be fixed?
            </h2>
            <p className="text-neutral-600">
              Select the category that best describes the issue you want to report
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {MAINTENANCE_CATEGORIES.map((category) => (
              <Link
                key={category.id}
                href={`/tenant/maintenance/report?category=${category.id}`}
                className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all hover:border-transparent hover:shadow-lg"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${category.color} opacity-0 transition-opacity group-hover:opacity-5`} />

                <div className="relative p-lg">
                  <div className="text-4xl mb-md">{category.icon}</div>

                  <h3 className="text-lg font-semibold text-neutral-900 mb-sm group-hover:text-neutral-950">
                    {category.title}
                  </h3>

                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {category.description}
                  </p>

                  <div className="mt-md pt-md border-t border-neutral-100">
                    <span className="inline-flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                      Report issue
                      <span className="ml-sm">→</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
