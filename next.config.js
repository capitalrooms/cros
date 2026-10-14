/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  swcMinify: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 5,
  },
  // Don't require env vars during build
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js"],
  },
  // pdfkit uses package import-map specifiers (#standard-fonts/…) that
  // Vercel's bundler doesn't resolve. Keep it external so Node resolves it
  // directly from node_modules at runtime.
  serverExternalPackages: ['pdfkit', '@react-pdf/renderer'],
  // Security (14 Oct 2026, "fort knox"): don't announce the framework, and send the browser protections on every page.
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        // no other site may put CROS in a frame (clickjacking); our own pages may frame our own PDFs
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // the camera (photos of repairs, documents) and location stay available to CROS itself; nothing else
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
      ],
    }]
  },
}

module.exports = nextConfig
