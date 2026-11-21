// The screen shown for a moment while a tenant, contractor or cleaner page loads (21 Nov 2026).
// It uses the app's own colours and sits inside the app's layout, so the tab bar stays put and no old screen flashes.
export default function AppLoading() {
  return (
    <div className="min-h-screen" style={{ background: '#EEF2EC' }} role="status" aria-label="Loading">
      <div style={{ background: '#17332B', height: 'calc(env(safe-area-inset-top) + 56px)' }} />
      <div className="mx-auto max-w-xl px-lg py-xl">
        <div className="h-6 w-40 rounded-lg" style={{ background: '#DCE5DD' }} />
        <div className="mt-md h-24 w-full rounded-2xl" style={{ background: '#E3ECE5' }} />
        <div className="mt-md h-16 w-full rounded-2xl" style={{ background: '#E3ECE5' }} />
        <div className="mt-md h-16 w-full rounded-2xl" style={{ background: '#E3ECE5' }} />
      </div>
    </div>
  )
}
