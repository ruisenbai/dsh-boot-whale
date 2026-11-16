/** Render the reference dot grid, transparent playback films and reduced-motion wordmark. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWordmarkTransition, themeInks } from './wordmark-transition.mjs'

const assets = new URL('../assets/', import.meta.url)
const asset = name => new URL(name, assets)
const sourceWhale = { width: 384, height: 216, columns: 12, first: 8, last: 111, step: 5.7 / 137 }
const width = 256
const height = 144
const wordmark = { x: 52, y: 60, width: 156, height: 20 }
const impactX = 70
const impact = (67 - 40) * sourceWhale.step
const riseStart = impact - 0.43
const riseDuration = 2.7
const fps = 25
// The approved landing starts at source frame 40. Prepend the original ascent at its own cadence.
const ascentFrames = Math.ceil((40 - sourceWhale.first) * sourceWhale.step * fps)
const pixelSettledFrame = ascentFrames + Math.ceil((riseStart + riseDuration + 0.18) * fps)
const restoreStart = pixelSettledFrame + Math.round(0.16 * fps)
const settledFrame = restoreStart + Math.round(1.8 * fps)
const loopPeriod = 2.4
const loopStartTime = 5.92
const loopStart = ascentFrames + Math.round(loopStartTime * fps)
const scene = {
  width, height, columns: 16, wordmark, fps, pixelSettledFrame, restoreStart, settledFrame,
  exitFrame: settledFrame + Math.round(0.72 * fps),
  loopStart, frames: loopStart + Math.round(loopPeriod * fps),
}

function imageTool(command, args, input) {
  return execFileSync(command, args, { input, maxBuffer: 64 * 1024 * 1024 })
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function smooth(start, end, value) {
  const fraction = clamp((value - start) / (end - start))
  return fraction * fraction * (3 - 2 * fraction)
}

// The small reversed HARNESS badge needs whole dot cells to keep its counters open.
const chipLetters = {
  H: ['1001', '1001', '1001', '1111', '1001', '1001', '1001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  E: ['1111', '1000', '1000', '1110', '1000', '1000', '1111'],
  S: ['0111', '1000', '1000', '0110', '0001', '0001', '1110'],
}

function wordmarkSampler() {
  const samples = 12
  const sampleWidth = wordmark.width * samples
  const sampleHeight = wordmark.height * samples
  const source = readFileSync(asset('harness-logo.svg'), 'utf8')
  const solidBadge = source.replace(/<g clip-path="url\(#dsbw-logo-chip\)">[\s\S]*?<\/g>/, '')
  if (solidBadge === source) throw new Error('Missing HARNESS badge in the source wordmark')
  const svg = solidBadge.replaceAll('var(--harness-logo-foreground, #F9FAFB)', '#fff')
  const png = imageTool('rsvg-convert', ['-w', String(sampleWidth), '-h', String(sampleHeight)], svg)
  const stamp = imageTool('magick', ['png:-', '-background', 'black', '-alpha', 'remove', '-alpha', 'off',
    '-channel', 'R', '-separate', '+channel', '-depth', '8', 'gray:-'], png)

  const letters = [...'HARNESS'].map(letter => chipLetters[letter])
  const letterWidth = letters.reduce((sum, letter) => sum + letter[0].length + 1, -1)
  const tagTop = Math.round(12.5 * wordmark.height / 24 - 3.5)
  let pen = Math.round(155.348 * wordmark.width / 187 - letterWidth / 2)
  for (const letter of letters) {
    for (const [row, dots] of letter.entries()) {
      for (let col = 0; col < dots.length; col++) {
        if (dots[col] !== '1') continue
        for (let subrow = 0; subrow < samples; subrow++) {
          const offset = ((tagTop + row) * samples + subrow) * sampleWidth + (pen + col) * samples
          stamp.fill(0, offset, offset + samples)
        }
      }
    }
    pen += letter[0].length + 1
  }
  // Column sums give the coverage of a moving letter on the fixed water/whale lattice.
  const stride = sampleHeight + 1
  const sums = new Float32Array(wordmark.width * stride)
  for (let x = 0; x < wordmark.width; x++) {
    for (let y = 0; y < sampleHeight; y++) {
      let sum = 0
      for (let dx = 0; dx < samples; dx++) sum += stamp[y * sampleWidth + x * samples + dx]
      sums[x * stride + y + 1] = sums[x * stride + y] + sum / (255 * samples)
    }
  }
  return (x, y) => {
    if (x < 0 || x >= wordmark.width || y < -1 || y >= wordmark.height) return 0
    const top = Math.round(y * samples)
    const sum = sums[x * stride + clamp(top + samples, 0, sampleHeight)] - sums[x * stride + clamp(top, 0, sampleHeight)]
    return smooth(0.055, 0.89, sum / samples)
  }
}

function dot(layer, x, y, strength) {
  if (x < 0 || x >= width || strength < 0.001) return
  const row = Math.floor(y)
  const fraction = y - row
  if (row >= 0 && row < height) {
    const offset = row * width + x
    layer[offset] = Math.max(layer[offset], strength * (1 - fraction))
  }
  if (row + 1 >= 0 && row + 1 < height) {
    const offset = (row + 1) * width + x
    layer[offset] = Math.max(layer[offset], strength * fraction)
  }
}

function surfaceHeight(x, time) {
  const distance = Math.abs(x - impactX)
  const age = time - impact - distance / 149
  let y = 88 + 0.018 * (x - 128)
  if (age > 0) y -= 2.05 * Math.sin(age * 8) * Math.exp(-1.34 * age - distance / 185)
  const wake = time - riseStart - 0.78 - Math.abs(x - 128) / 132
  if (wake > 0) y += 0.81 * Math.sin(wake * 9.1) * Math.exp(-2 * wake)
  return y
}

function ripple(layer, age, cx, cy, radius, lifetime, amplitude, seed) {
  if (age <= 0 || age >= lifetime) return
  const progress = age / lifetime
  const rx = 3 + radius * (1 - (1 - progress) ** 1.52)
  const ry = 1.2 + 4.7 * (1 - Math.exp(-age * 2.15))
  const strength = amplitude * smooth(0, 0.09, age) * (1 - smooth(0.06, 1, progress))
  for (let x = Math.max(0, Math.ceil(cx - rx)); x <= Math.min(width - 1, Math.floor(cx + rx)); x++) {
    const dx = (x - cx) / rx
    const arc = Math.sqrt(Math.max(0, 1 - dx * dx))
    const grain = 0.67 + 0.32 * Math.sin(x * 0.22 + seed) + 0.2 * Math.sin(x * 0.75 + seed * 1.8)
    if (grain < 0.24) continue
    const base = cy + 0.018 * (x - 128) + 0.2 * Math.sin(x * 0.23 - age * 3 + seed)
    dot(layer, x, base + ry * arc, strength * Math.min(1, grain) * (0.7 + 0.3 * arc))
    dot(layer, x, base - ry * arc, 0.43 * strength * Math.min(1, grain))
  }
}

function landingWater(layer, surface, time) {
  const age = time - impact
  if (age > 0) {
    const extent = 7 + Math.min(77, age * 78)
    const cx = impactX + (128 - impactX) * smooth(0, 1.3, age)
    const power = (0.57 * Math.exp(-age * 1.3) + 0.27) * (1 - 0.75 * smooth(2.1, 4.2, age))
    for (let x = Math.max(0, Math.floor(cx - extent)); x < Math.min(width, Math.ceil(cx + extent)); x++) {
      const edge = 1 - smooth(0.64, 1, Math.abs(x - cx) / extent)
      const broken = 0.49 + 0.32 * Math.sin(x * 0.19 - age * 2.1) + 0.19 * Math.sin(x * 0.77 + age * 2.4)
      if (broken > 0.18) dot(layer, x, surface[x], edge * power * broken)
    }
  }
  ripple(layer, age + 0.035, impactX, 87.8, 77, 2.70, 0.68, 0.7)
  ripple(layer, age - 0.25, impactX + 12, 88.3, 78, 2.56, 0.48, 4.5)
  ripple(layer, time - riseStart - 0.88, 127, 88, 88, 2.55, 0.54, 2)
  ripple(layer, time - riseStart - 1.32, 134, 87.9, 60, 2.26, 0.40, 4.7)
  ripple(layer, time - riseStart - 2.30, 103, 88, 38, 2.40, 0.21, 1.8)
}

function writeLetters(letters, water, surface, time, coverage) {
  const tops = []
  for (let col = 0; col < wordmark.width; col++) {
    const x = wordmark.x + col
    const delay = 0.18 * Math.min(1, Math.abs(x - impactX) / 115)
    const progress = clamp((time - riseStart - delay) / riseDuration)
    const lift = 0.58 * (1 - (1 - progress) ** 1.72) + 0.42 * smooth(0, 1, progress)
    const top = 88.7 + (wordmark.y - 88.7) * lift + 0.64 * Math.sin(Math.PI * progress) * (col / wordmark.width - 0.35)
    tops[col] = top
    const line = surface[x]
    for (let y = Math.floor(top) - 1; y <= Math.min(Math.ceil(top + wordmark.height), Math.ceil(line)); y++) {
      letters[y * width + x] = coverage(col, y - top) * clamp(line - y + 0.23) * 0.99
    }
    if (progress === 0) continue
    const edge = coverage(col, line - top)
    if (edge > 0.1) {
      dot(water, x, line, 0.17 + 0.37 * edge)
      if (col % 9 === 0) dot(water, x - 1, line + 0.66, edge * 0.18)
    }
    for (let y = Math.ceil(line + 0.5); y < line + 12; y++) {
      const depth = y - line
      const shift = Math.round((0.4 + depth * 0.18) * Math.sin(depth * 1.41 - time * 3.2 + 0.025 * x))
      const reflection = coverage(col + shift, 2 * line - y - top)
      const broken = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(depth * 2.32 + 0.034 * x - time * 2.7)) ** 2
      const offset = y * width + x
      water[offset] = Math.max(water[offset], 0.27 * Math.exp(-depth / 4.3) * broken * reflection)
    }
  }
  for (const [col, release, bottom] of [[35, 1.85, 15], [68, 2.02, 17], [111, 2.20, 14]]) {
    const age = time - riseStart - release
    if (age < 0 || age > 0.42) continue
    const x = wordmark.x + col
    const y = tops[col] + bottom + 42 * age * age
    if (y < surface[x] - 0.3) dot(water, x, y, 0.36 * (1 - 0.4 * age / 0.42))
  }
}

function renderFrame(index, whale, coverage) {
  const time = (index - ascentFrames) / fps
  const source = index < ascentFrames
    ? sourceWhale.first + Math.floor(index / fps / sourceWhale.step)
    : 40 + Math.floor(time / sourceWhale.step)
  const water = new Float32Array(width * height)
  const letters = new Float32Array(width * height)
  const surface = Float64Array.from({ length: width }, (_, x) => surfaceHeight(x, time))
  landingWater(water, surface, time)
  writeLetters(letters, water, surface, time, coverage)
  // Both waiting rings fade at their own endpoints and overlap across the loop seam.
  const blend = smooth(5.12, loopStartTime, time)
  if (blend > 0) {
    const idleWater = new Float32Array(water.length)
    const phase = (time - loopStartTime + loopPeriod) % loopPeriod
    ripple(idleWater, phase, 121, 88.2, 65, loopPeriod, 0.38, 2.0)
    ripple(idleWater, (phase + 1.14) % loopPeriod, 134, 88.0, 54, loopPeriod, 0.33, 4.7)
    for (let i = 0; i < water.length; i++) water[i] += (idleWater[i] - water[i]) * blend
  }
  const result = Buffer.alloc(width * height)
  const recession = smooth(impact + 0.06, impact + 1.11, time)
  const stride = sourceWhale.width * sourceWhale.columns
  const sourceLeft = source % sourceWhale.columns * sourceWhale.width
  const sourceTop = Math.floor(source / sourceWhale.columns) * sourceWhale.height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wx = x - 32, wy = y - 6, offset = y * width + x
      const inside = source <= sourceWhale.last && wx >= 0 && wx < 192 && wy >= 0 && wy < 108
      const native = inside ? whale[(sourceTop + 2 * wy) * stride + sourceLeft + 2 * wx] / 255 : 0
      const occlusion = 0.38 * native * smooth(surface[x] - 5, surface[x] - 0.25, y)
      const strength = 0.98 - 0.69 * recession * (0.56 + 0.44 * smooth(surface[x] - 29, surface[x] - 3, y))
      result[offset] = Math.round(255 * Math.max(native * strength, water[offset], letters[offset] * (1 - occlusion)))
    }
  }
  return result
}

function encodeMask(data, w, h, options) {
  return imageTool('magick', ['-size', w + 'x' + h, '-depth', '8', 'gray:-', '-alpha', 'copy',
    '-channel', 'RGB', '-evaluate', 'set', '100%', '+channel', '-strip', ...options], data)
}

function dotGrid(cells) {
  const stride = width * 3
  const pixels = Buffer.alloc(stride * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const core = cells[y * width + x]
      if (!core) continue
      const i = y * 3 * stride + x * 3
      const edge = Math.round(core * 0.4)
      pixels[i] = pixels[i + 1] = pixels[i + stride] = pixels[i + stride + 1] = core
      pixels[i + 2] = pixels[i + stride + 2] = pixels[i + 2 * stride] = pixels[i + 2 * stride + 1] = edge
      pixels[i + 2 * stride + 2] = Math.round(core * 40 / 255)
    }
  }
  return pixels
}

function staticWordmark(coverage) {
  const cells = Buffer.alloc(width * height)
  for (let y = 0; y < wordmark.height; y++) {
    for (let x = 0; x < wordmark.width; x++) {
      cells[(wordmark.y + y) * width + wordmark.x + x] = Math.round(255 * 0.99 * coverage(x, y))
    }
  }
  return encodeMask(dotGrid(cells), width * 3, height * 3, ['-define', 'png:exclude-chunks=date,time', 'png:-'])
}

function prepareFilm(cells) {
  const scale = 3, stride = width * scale
  const patchWidth = wordmark.width * scale, patchHeight = wordmark.height * scale
  const original = readFileSync(asset('harness-logo.svg'), 'utf8')
  const svg = original.replaceAll('var(--harness-logo-foreground, #F9FAFB)', '#fff')
    .replaceAll('var(--harness-logo-chip-text, #353638)', '#000')
  const png = imageTool('rsvg-convert', ['-w', String(patchWidth), '-h', String(patchHeight)], svg)
  const vector = imageTool('magick', ['png:-', '-depth', '8', 'rgba:-'], png)
  const stamp = Buffer.concat(Array.from({ length: wordmark.height }, (_, y) => {
    const offset = (wordmark.y + y) * width + wordmark.x
    return cells[pixelSettledFrame].subarray(offset, offset + wordmark.width)
  }))
  const render = createWordmarkTransition(stamp, wordmark, scale, vector)
  const early = render(0), complete = render(1)
  return cells.map((grid, index) => {
    const alpha = dotGrid(grid)
    if (index <= restoreStart) return { alpha, colors: early.colors }
    const mark = index >= settledFrame ? complete : render((index - restoreStart) / (settledFrame - restoreStart))
    for (let y = 0; y < patchHeight; y++) {
      const offset = (wordmark.y * scale + y) * stride + wordmark.x * scale
      mark.alpha.copy(alpha, offset, y * patchWidth, (y + 1) * patchWidth)
    }
    return { alpha, colors: mark.colors }
  })
}

function encodeFilm(frames, path) {
  const size = (width * 3) + 'x' + (height * 3)
  const patchWidth = wordmark.width * 3, patchHeight = wordmark.height * 3
  const x = wordmark.x * 3, y = wordmark.y * 3
  const patchFile = path + '.rgb'
  writeFileSync(patchFile, Buffer.concat(frames.map(f => f.colors)))
  // Both theme colors share a clock. CSS crops the matching half even during a theme change.
  const background = theme => 'color=c=0x' + Buffer.from(theme.dots).toString('hex') + ':s=' + size + ':r=' + fps
  const colors = background(themeInks[0]) + '[light];' + background(themeInks[1]) + '[dark];[light][dark]vstack'
  imageTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pixel_format', 'gray', '-video_size', size, '-framerate', String(fps), '-i', 'pipe:0',
    '-f', 'lavfi', '-i', colors,
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', patchWidth + 'x' + (2 * patchHeight),
    '-framerate', String(fps), '-i', patchFile, '-filter_complex_threads', '2', '-filter_complex',
    '[0:v]split[a][b];[a][b]vstack[alpha];[2:v]split[l][d];' +
    '[l]crop=' + patchWidth + ':' + patchHeight + ':0:0[light];' +
    '[d]crop=' + patchWidth + ':' + patchHeight + ':0:' + patchHeight + '[dark];' +
    '[1:v][light]overlay=' + x + ':' + y + '[upper];' +
    '[upper][dark]overlay=' + x + ':' + (y + height * 3) + '[rgb];[rgb][alpha]alphamerge,format=yuva420p[film]',
    '-map', '[film]', '-frames:v', String(frames.length), '-an', '-c:v', 'libvpx-vp9',
    '-lossless', '1', '-auto-alt-ref', '0', '-g', String(fps), '-deadline', 'good', '-cpu-used', '6',
    '-threads', '2', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1', path],
  Buffer.concat(frames.map(f => f.alpha)))
  return readFileSync(path)
}

function generate() {
  const source = readFileSync(asset('boot-whale-atlas-962a22048588.webp'))
  const whale = imageTool('magick', ['webp:-', '-alpha', 'extract', '-depth', '8', 'gray:-'], source)
  if (whale.length !== 4608 * 2592) throw new Error('Unexpected source whale atlas dimensions')
  const coverage = wordmarkSampler()
  const atlasWidth = width * scene.columns
  const atlasHeight = height * Math.ceil(scene.frames / scene.columns)
  const atlas = Buffer.alloc(atlasWidth * atlasHeight)
  const cells = []
  for (let index = 0; index < scene.frames; index++) {
    const frame = renderFrame(index, whale, coverage)
    cells.push(frame)
    const start = Math.floor(index / scene.columns) * height * atlasWidth + index % scene.columns * width
    for (let y = 0; y < height; y++) frame.copy(atlas, start + y * atlasWidth, y * width, (y + 1) * width)
  }
  const outputs = new Map([
    ['pixel-rise.webp', encodeMask(atlas, atlasWidth, atlasHeight, ['-define', 'webp:lossless=true', 'webp:-'])],
    ['pixel-rise.json', Buffer.from(JSON.stringify(scene, null, 2) + '\n')],
    ['pixel-wordmark.png', staticWordmark(coverage)],
  ])
  const temporary = mkdtempSync(join(tmpdir(), 'dsbw-encode-'))
  try {
    const frames = prepareFilm(cells)
    // One full idle-water cycle after the reveal leaves time to buffer the identically phased loop.
    for (const [name, segment] of [['pixel-opening.webm', frames], ['pixel-ripples.webm', frames.slice(scene.loopStart)]]) {
      outputs.set(name, encodeFilm(segment, join(temporary, name)))
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
  for (const [name, data] of outputs) {
    if (existsSync(asset(name)) && readFileSync(asset(name)).equals(data)) continue
    if (process.argv.includes('--check')) throw new Error('Regenerate ' + name)
    writeFileSync(asset(name), data)
  }
}

generate()
