import Image from 'next/image'

/**
 * The Capital Rooms mark.
 *
 * The source artwork stacks the key/skyline icon ABOVE the "CAPITAL ROOMS"
 * wordmark. Scaling the whole lockup down to header height renders the wordmark
 * as an illegible smudge, so `variant="mark"` clips to just the icon by showing
 * the top portion of the image inside a fixed-height window.
 */
export default function Logo({
  className = 'h-9 w-auto',
  priority = false,
  variant = 'full',
  invert = false,
}: {
  className?: string
  priority?: boolean
  variant?: 'full' | 'mark'
  invert?: boolean
}) {
  if (variant === 'mark') {
    // Use object-cover to crop the image, showing just the icon from the top
    return (
      <Image
        src="/logo.png"
        alt="Capital Rooms"
        width={156}
        height={100}
        priority={priority}
        className={className}
        style={invert ? { filter: 'brightness(2) invert(1)' } : {}}
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
