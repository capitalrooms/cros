'use client'

/**
 * A deliberately minimal map: CARTO's "Positron (no labels)" basemap with only
 * Capital Rooms pins drawn on top.
 *
 * Google's embed was rejected because it renders every restaurant and shop in
 * the area — the equivalent of an Uber map showing a giant McDonald's pin next
 * to your driver. This basemap has no POIs at all, so the only thing on it is
 * our own work. No API key, no JS map library, no tracking.
 */

export interface MapPin {
  id: string
  lat: number
  lng: number
  label: string
  sublabel?: string
  /** Filled = the next/active job, hollow = other jobs. */
  primary?: boolean
}

const TILE_SIZE = 256

/** Web-Mercator: lat/lng -> fractional tile coordinates at a zoom level. */
function project(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom
  const x = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { x, y }
}

export default function JobMap({
  pins,
  zoom = 14,
  height = 300,
  cols = 3,
  rows = 2,
}: {
  pins: MapPin[]
  zoom?: number
  height?: number
  cols?: number
  rows?: number
}) {
  if (pins.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white text-sm text-neutral-400"
        style={{ height }}
      >
        No job locations to show yet
      </div>
    )
  }

  // Centre on the average of all pins.
  const centre = {
    lat: pins.reduce((s, p) => s + p.lat, 0) / pins.length,
    lng: pins.reduce((s, p) => s + p.lng, 0) / pins.length,
  }

  const c = project(centre.lat, centre.lng, zoom)
  const width = cols * TILE_SIZE
  const gridHeight = rows * TILE_SIZE

  // Top-left tile of the grid, so the centre sits in the middle.
  const originX = c.x - cols / 2
  const originY = c.y - rows / 2

  const tiles = []
  for (let dy = 0; dy < rows; dy++) {
    for (let dx = 0; dx < cols; dx++) {
      const tx = Math.floor(originX) + dx
      const ty = Math.floor(originY) + dy
      tiles.push({
        key: `${tx}-${ty}`,
        // Light, label-free basemap — nothing but streets and water.
        src: `https://basemaps.cartocdn.com/light_nolabels/${zoom}/${tx}/${ty}.png`,
        left: (Math.floor(originX) - originX + dx) * TILE_SIZE,
        top: (Math.floor(originY) - originY + dy) * TILE_SIZE,
      })
    }
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100"
      style={{ height }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width,
          height: gridHeight,
          transform: `translate(-${width / 2}px, -${gridHeight / 2}px)`,
        }}
      >
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={t.src}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            className="absolute select-none"
            style={{ left: t.left, top: t.top }}
            draggable={false}
          />
        ))}

        {pins.map((pin) => {
          const p = project(pin.lat, pin.lng, zoom)
          const left = (p.x - originX) * TILE_SIZE
          const top = (p.y - originY) * TILE_SIZE
          return (
            <div
              key={pin.id}
              className="absolute flex flex-col items-center"
              style={{ left, top, transform: 'translate(-50%, -100%)' }}
            >
              <div className="whitespace-nowrap rounded-lg bg-neutral-900 px-sm py-xs text-xs font-semibold text-white shadow-lg">
                {pin.label}
                {pin.sublabel && (
                  <span className="ml-xs font-normal text-white/60">{pin.sublabel}</span>
                )}
              </div>
              <div
                className={`-mt-px h-3 w-3 rotate-45 border-2 border-neutral-900 ${
                  pin.primary ? 'bg-neutral-900' : 'bg-white'
                }`}
              />
            </div>
          )
        })}
      </div>

      <p className="absolute bottom-1 right-2 text-[9px] text-neutral-400">
        © OpenStreetMap · CARTO
      </p>
    </div>
  )
}
