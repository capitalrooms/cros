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
}

module.exports = nextConfig
