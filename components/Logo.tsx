import Image from 'next/image'

/**
 * The Capital Rooms mark.
 *
 * The source artwork (public/logo.png, 910x849) stacks the key/skyline emblem
 * ABOVE the "CAPITAL ROOMS" wordmark. Three variants:
 *  - `full`    renders the whole stacked lockup (splash / login hero).
 *  - `emblem`  CSS-crops JUST the key/skyline emblem out of the artwork so it can
 *              sit beside real text in a horizontal header lockup, sharp at any
 *              height and never squashed.
 *  - `mark`    kept for backwards-compatibility; aliases `emblem`.
 */

// Bounding boxes measured within the 910x849 source artwork.
const SRC_W = 910
const SRC_H = 849
// key/skyline emblem (top)
const EMB = { x: 20, y: 19, w: 872, h: 430 }
// "CAPITAL ROOMS" wordmark (bottom, two lines)
const WORD = { x: 43, y: 528, w: 833, h: 306 }

export default function Logo({
  className = 'h-9 w-auto',
  priority = false,
  variant = 'full',
  invert = false,
  height = 32,
}: {
  className?: string
  priority?: boolean
  variant?: 'full' | 'mark' | 'emblem' | 'wordmark'
  invert?: boolean
  /** Rendered height in px — used by the cropped `emblem`/`mark`/`wordmark` variants. */
  height?: number
}) {
  if (variant === 'mark' || variant === 'emblem' || variant === 'wordmark') {
    const box = variant === 'wordmark' ? WORD : EMB
    const scale = height / box.h
    return (
      <span
        role="img"
        aria-label="Capital Rooms"
        className={className}
        style={{
          display: 'inline-block',
          width: box.w * scale,
          height: box.h * scale,
          backgroundImage: 'url(/logo.png)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${SRC_W * scale}px ${SRC_H * scale}px`,
          backgroundPosition: `${-box.x * scale}px ${-box.y * scale}px`,
          filter: invert ? 'brightness(0) invert(1)' : undefined,
        }}
      />
    )
  }

  return (
    <Image
      src="/logo.png"
      alt="Capital Rooms"
      width={910}
      height={849}
      priority={priority}
      className={`${className} ${invert ? 'brightness-0 invert' : ''}`}
    />
  )
}
