'use client'

/**
 * Inline document viewer drawer.
 * Shows a PDF iframe or image preview with a Download link, plus
 * an optional "Replace" callback to switch to DocUploadDrawer.
 */

interface DocViewDrawerProps {
  title: string        // e.g. tenant name or property name
  subtitle?: string    // e.g. "Tenancy Agreement"
  fileName: string
  storageUrl: string
  onClose: () => void
  onReplace?: () => void  // if provided, shows a "Replace document" button
}

export default function DocViewDrawer({
  title,
  subtitle,
  fileName,
  storageUrl,
  onClose,
  onReplace,
}: DocViewDrawerProps) {
  const isPdf =
    fileName.toLowerCase().endsWith('.pdf') ||
    storageUrl.toLowerCase().includes('.pdf') ||
    storageUrl.toLowerCase().includes('%2fpdf') ||
    storageUrl.toLowerCase().includes('pdf')

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-lg py-md border-b border-neutral-200 shrink-0">
          <div className="min-w-0 pr-md">
            <p className="text-xs text-neutral-400 font-semibold uppercase tracking-widest mb-xs truncate">{title}</p>
            {subtitle && <h2 className="text-lg font-bold text-neutral-900">{subtitle}</h2>}
            <p className="text-xs text-neutral-500 mt-xs truncate">{fileName}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none mt-xs shrink-0">×</button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-hidden bg-neutral-50">
          {isPdf ? (
            <iframe
              src={storageUrl}
              className="w-full h-full"
              title={fileName}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-lg overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={storageUrl} alt={fileName} className="max-w-full max-h-full object-contain rounded-lg" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-lg py-md border-t border-neutral-200 space-y-sm shrink-0">
          <a
            href={storageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center rounded-lg bg-neutral-900 py-md text-sm font-semibold text-white hover:bg-neutral-800 transition"
          >
            ↓ Download
          </a>
          {onReplace && (
            <button
              onClick={onReplace}
              className="w-full rounded-lg border-2 border-dashed border-neutral-300 py-sm text-sm font-semibold text-neutral-600 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition"
            >
              ↑ Replace document
            </button>
          )}
        </div>
      </div>
    </>
  )
}
