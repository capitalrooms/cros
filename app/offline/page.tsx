export const dynamic = 'force-static'

export const metadata = {
  title: 'Offline — Capital Rooms',
}

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-lg text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-lg w-16 h-16 rounded-2xl bg-white flex items-center justify-center">
          <span className="text-2xl font-black text-neutral-900">CR</span>
        </div>
        <h1 className="text-2xl font-bold text-white">You&apos;re offline</h1>
        <p className="mt-md text-neutral-400">
          Capital Rooms needs a connection to load your latest bookings and jobs. Check your
          signal and try again.
        </p>
        <a
          href="/"
          className="mt-2xl inline-block rounded-xl bg-white px-lg py-md font-bold text-neutral-900"
        >
          Try again
        </a>
      </div>
    </div>
  )
}
