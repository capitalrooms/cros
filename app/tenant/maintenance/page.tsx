'use client';

import Link from 'next/link';
import { MAINTENANCE_CATEGORIES } from './categories';
import AppBar from '@/components/AppBar'

export default function MaintenanceHub() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <Link href="/tenant" className="min-w-0 truncate text-sm font-semibold text-white hover:text-white/80">
            Back
          </Link>
        }
      />

      <main className="px-lg py-xl">
        <div className="max-w-5xl mx-auto">
          <div className="mb-xl text-center">
            <h2 className="text-xl font-bold text-neutral-900 mb-sm">
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

                  <h3 className="text-base font-semibold text-neutral-900 mb-sm group-hover:text-neutral-950">
                    {category.title}
                  </h3>

                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {category.description}
                  </p>

                  <div className="mt-md pt-md border-t border-neutral-100">
                    <span className="inline-flex items-center text-sm font-medium text-neutral-900 group-hover:text-blue-700">
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
