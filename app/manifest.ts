import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Capital Rooms',
    short_name: 'Capital Rooms',
    description:
      'Manage properties, maintenance, viewings and cleans — for tenants, contractors, cleaners, lettings and admins.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Web Share Target — makes CROS appear in the iOS/Android share sheet.
    // When a user shares a photo, PDF, or URL from any app, it lands here.
    // Requires the app to be installed (Add to Home Screen) to activate.
    ...({
      share_target: {
        action: '/api/share-target',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: {
          title: 'title',
          text: 'text',
          url: 'url',
          files: [
            { name: 'media', accept: ['image/*', 'application/pdf'] },
          ],
        },
      },
    } as any),
  }
}
