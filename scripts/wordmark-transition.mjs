/** Offline rendering of the traveling light and the SVG contours it reveals. */
const clamp = value => Math.max(0, Math.min(1, value))
const mix = (from, to, progress) => from + (to - from) * progress
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t) }

export const themeInks = [
  { dots: [17, 38, 59], logo: [15, 17, 21], badgeText: [255, 255, 255],
    reflection: [36, 109, 177], glint: [158, 212, 245], halo: [57, 135, 204], surface: [255, 255, 255],
    badgeGlint: 0.70, innerGlow: 0.37, outerGlow: 0.55 },
  { dots: [237, 245, 255], logo: [249, 250, 251], badgeText: [53, 54, 56],
    reflection: [105, 188, 252], glint: [250, 255, 255], halo: [92, 183, 252], surface: [21, 21, 23],
    badgeGlint: 0.99, innerGlow: 0.90, outerGlow: 1.65 },
]

// Blur only the glyph silhouette. Empty space between letters stays outside the reflection.
function blur(mask, width, height, sigma) {
  const radius = Math.ceil(3 * sigma)
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-0.5 * ((i - radius) / sigma) ** 2))
  const sum = kernel.reduce((a, b) => a + b, 0)
  const rows = new Float32Array(mask.length), result = new Float32Array(mask.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0
      for (let dx = Math.max(-x, -radius); dx <= Math.min(width - 1 - x, radius); dx++) {
        value += mask[y * width + x + dx] * kernel[dx + radius]
      }
      rows[y * width + x] = value / sum
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0
      for (let dy = Math.max(-y, -radius); dy <= Math.min(height - 1 - y, radius); dy++) {
        value += rows[(y + dy) * width + x] * kernel[dy + radius]
      }
      result[y * width + x] = value / sum
    }
  }
  return result
}

// Two dot cells cover the differences between the traced stroke and the sampled edge.
function contour(coverage, width, height, scale) {
  const radius = 2 * scale + 1
  const neighbors = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const distance = Math.hypot(dx, dy)
      if (distance && distance <= radius) neighbors.push({ dx, dy, distance })
    }
  }
  neighbors.sort((a, b) => a.distance - b.distance)
  return coverage.map((alpha, i) => {
    const solid = alpha >= 0.5
    const x = i % width, y = Math.floor(i / width)
    for (const { dx, dy, distance } of neighbors) {
      const px = x + dx, py = y + dy
      const inside = px >= 0 && px < width && py >= 0 && py < height && coverage[py * width + px] >= 0.5
      if (inside !== solid) return (solid ? 1 : -1) * (distance - 0.5)
    }
    return solid ? radius : -radius
  })
}

// Recover the seven letter bounds inside the reversed badge. The SVG and dot font use different spacing.
function badgeLetters(mask, width, bounds) {
  const letters = []
  for (let x = bounds.left; x <= bounds.right; x++) {
    let top = Infinity, bottom = -1
    for (let y = bounds.top; y <= bounds.bottom; y++) {
      if (mask[y * width + x] < 0.5) { top = Math.min(top, y); bottom = y }
    }
    if (bottom < 0) continue
    const last = letters.at(-1)
    if (last?.right === x - 1) {
      last.right = x
      last.top = Math.min(last.top, top)
      last.bottom = Math.max(last.bottom, bottom)
    } else letters.push({ left: x, right: x, top, bottom })
  }
  if (letters.length !== 7) throw new Error('Expected seven distinct letters in the HARNESS badge')
  return letters
}

function inverseMap(coordinate, anchors, progress) {
  for (let i = 1; i < anchors.length; i++) {
    const [a, b] = anchors[i - 1], [c, d] = anchors[i]
    const start = mix(a, b, progress), end = mix(c, d, progress)
    if (coordinate <= end) {
      const fraction = clamp((coordinate - start) / (end - start))
      return [mix(a, c, fraction), mix(b, d, fraction)]
    }
  }
  return [coordinate, coordinate]
}

function sample(mask, width, x, y) {
  const left = Math.floor(x), top = Math.floor(y), i = top * width + left
  return mix(mix(mask[i], mask[i + 1], x - left),
    mix(mask[i + width], mask[i + width + 1], x - left), y - top)
}

/** Build native-video opacity and theme color patches from a white logo with black badge text. */
export function createWordmarkTransition(cells, wordmark, scale, vector) {
  const width = wordmark.width * scale, height = wordmark.height * scale, area = width * height
  if (vector.length !== area * 4 || cells.length !== wordmark.width * wordmark.height) {
    throw new Error('Unexpected wordmark raster dimensions')
  }
  const dots = new Float32Array(area), ink = new Float32Array(area), vectorAlpha = new Float32Array(area)
  for (let i = 0; i < area; i++) {
    const x = i % width, y = Math.floor(i / width)
    dots[i] = cells[Math.floor(y / scale) * wordmark.width + Math.floor(x / scale)] / 255
    vectorAlpha[i] = vector[i * 4 + 3] / 255
    ink[i] = vector[i * 4] / 255 * vectorAlpha[i]
  }
  const fromContour = contour(dots, width, height, scale), toContour = contour(ink, width, height, scale)
  const badgeLeft = Math.floor(129 / 187 * width)
  const silhouette = vectorAlpha.map((value, i) => i % width >= badgeLeft ? value : mix(dots[i], value, 0.78))
  const innerHalo = blur(silhouette, width, height, 0.45 * scale)
  const outerHalo = blur(silhouette, width, height, 1.125 * scale)
  // This inset lies entirely inside the badge in the 187 × 24 source logo.
  const bounds = { left: Math.ceil(130.5 / 187 * width), right: Math.floor(180.3 / 187 * width),
    top: Math.ceil(7 / 24 * height), bottom: Math.floor(18 / 24 * height) }
  const from = badgeLetters(dots, width, bounds), to = badgeLetters(ink, width, bounds)
  const horizontal = [[bounds.left, bounds.left]]
  const vertical = from.map((letter, i) => {
    const target = to[i]
    horizontal.push([letter.left - 0.5, target.left - 0.5], [letter.right + 0.5, target.right + 0.5])
    return [[bounds.top, bounds.top], [letter.top - 0.5, target.top - 0.5],
      [letter.bottom + 0.5, target.bottom + 0.5], [bounds.bottom, bounds.bottom]]
  })
  horizontal.push([bounds.right, bounds.right])

  return function render(progress) {
    const alpha = Buffer.alloc(area), colors = Buffer.alloc(area * 3 * themeInks.length)
    const moving = progress > 0 && progress < 1
    const front = mix(-11 * scale, width + 11 * scale, mix(progress, smooth(progress), 0.17))
    for (let y = 0; y < height; y++) {
      const center = front + (height / 2 - y) * 0.18
      for (let x = 0; x < width; x++) {
        const distance = (x - center) / scale
        const local = moving ? clamp(0.5 - distance / 12.25) : progress
        const fill = smooth(local / 0.88), shape = smooth((local - 0.10) / 0.90)
        const reflection = moving ? 0.94 * smooth(1 - Math.abs(distance + 0.25) / 9) : 0
        const core = moving ? smooth(1 - Math.abs(distance - 0.375) / 2.75) : 0
        const aura = moving ? smooth(1 - Math.abs(distance + 0.375) / 11) : 0
        const i = y * width + x
        let source = dots[i], target = ink[i], svgAlpha = vectorAlpha[i]
        let a = fromContour[i], b = toContour[i], stroke = 0
        if (shape > 0 && shape < 1 && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
          const [sx, tx] = inverseMap(x, horizontal, shape)
          let glyph = 0
          while (glyph < from.length - 1 && x > mix(from[glyph].right, to[glyph].right, shape) + 1) glyph++
          const [sy, ty] = inverseMap(y, vertical[glyph], shape)
          source = sample(dots, width, sx, sy)
          target = sample(ink, width, tx, ty)
          svgAlpha = sample(vectorAlpha, width, tx, ty)
          a = sample(fromContour, width, sx, sy)
          b = sample(toContour, width, tx, ty)
          // Preserve narrow reversed strokes while the two letter outlines are moving into alignment.
          stroke = 0.45 * scale * shape * (1 - shape) * Math.min(1, Math.abs(a - b) / (scale / 2))
        }
        const edge = clamp(0.5 + mix(a, b, shape) - stroke)
        const coverage = clamp(edge + (1 - shape) * (source - clamp(0.5 + a)) + shape * (target - clamp(0.5 + b)))
        const right = x % scale === scale - 1, bottom = y % scale === scale - 1
        const texture = right && bottom ? 40 / 255 : right || bottom ? 0.4 : 1
        const body = local === 1 ? target : coverage * mix(texture, 1, fill)
        const label = shape * Math.max(0, svgAlpha - target)
        const opacity = body + label
        const baseAlpha = clamp(opacity)
        const free = 1 - (x >= badgeLeft ? Math.max(baseAlpha, vectorAlpha[i]) : baseAlpha)
        const feather = smooth(Math.min(x + 0.5, width - 0.5 - x, y + 0.5, height - 0.5 - y) / scale)
        const inner = innerHalo[i] * core * free * feather, outer = outerHalo[i] * aura * free * feather
        const glow = themeInks.map(theme => Math.min(1 - baseAlpha, inner * theme.innerGlow + outer * theme.outerGlow))
        // Both video halves share an alpha plane. Composite the weaker halo against its theme surface.
        const extra = Math.max(...glow)
        alpha[i] = Math.round(255 * (baseAlpha + extra))
        for (let t = 0; t < themeInks.length; t++) {
          const theme = themeInks[t], out = (t * area + i) * 3
          const highlight = core * (x >= badgeLeft ? theme.badgeGlint : 0.99)
          for (let c = 0; c < 3; c++) {
            const ink = mix(theme.dots[c], theme.logo[c], shape)
            const lit = mix(mix(ink, theme.reflection[c], reflection), theme.glint[c], highlight)
            const color = opacity > 0 ? (lit * body + theme.badgeText[c] * label) / opacity : lit
            colors[out + c] = Math.round(extra === 0 ? color :
              (color * baseAlpha + theme.halo[c] * glow[t] + theme.surface[c] * (extra - glow[t])) / (baseAlpha + extra))
          }
        }
      }
    }
    return { alpha, colors }
  }
}
