/** Geometry shared by the baked highlight and the on-screen SVG reveal. */
export const glintOffset = 0.375
export const glintRadius = 2.75
const slope = 0.18

/** Horizontal center of the light on a row of the wordmark, in the input raster's pixels. */
export function sweepX(progress, width, height, y, scale = 1) {
  const smooth = progress * progress * (3 - 2 * progress)
  const fraction = progress + 0.17 * (smooth - progress)
  const start = -11 * scale, end = width + 11 * scale
  return start + (end - start) * fraction + (height / 2 - y) * slope
}

/** Positions of the back of the bright core, as percentages of the on-screen wordmark width. */
export function wordmarkSweep({ wordmark: { width, height }, restoreStart, settledFrame }) {
  const intervals = settledFrame - restoreStart
  const positions = Array.from({ length: intervals + 1 }, (_, i) => {
    const x = sweepX(i / intervals, width, height, height / 2) + glintOffset - glintRadius
    return Number((100 * x / width).toFixed(5))
  })
  // The two clip vertices sit one logo height above and below its center.
  return { positions, tilt: 100 * height * slope / width }
}
