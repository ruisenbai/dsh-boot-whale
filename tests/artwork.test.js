import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const asset = name => new URL('../assets/' + name, import.meta.url)
const scene = JSON.parse(readFileSync(asset('pixel-rise.json'), 'utf8'))
const atlasWidth = scene.width * scene.columns
const atlasHeight = scene.height * Math.ceil(scene.frames / scene.columns)
const hasImageMagick = spawnSync('magick', ['-version']).status === 0

test('the reference scene, loop and static dot grid have matching dimensions and timing', () => {
  const png = readFileSync(asset('pixel-wordmark.png'))
  assert.equal(png.readUInt32BE(16), 3 * scene.width)
  assert.equal(png.readUInt32BE(20), 3 * scene.height)
  const webp = readFileSync(asset('pixel-rise.webp'))
  assert.equal(webp.toString('ascii', 12, 16), 'VP8L')
  const packed = webp.readUInt32LE(21)
  assert.equal(1 + (packed & 0x3fff), atlasWidth)
  assert.equal(1 + ((packed >>> 14) & 0x3fff), atlasHeight)
  assert.ok(0 < scene.pixelSettledFrame && scene.pixelSettledFrame < scene.restoreStart)
  assert.equal((scene.settledFrame - scene.restoreStart) / scene.fps, 1.8)
  assert.ok(scene.settledFrame < scene.loopStart && scene.exitFrame < scene.frames)
  assert.equal((scene.exitFrame - scene.settledFrame) / scene.fps, 0.72)
  assert.equal((scene.frames - scene.loopStart) / scene.fps, 2.4)
})

test('the ascent matches the whale and waiting water never moves the pixel lettering', { skip: !hasImageMagick }, () => {
  const decode = file => execFileSync('magick', [fileURLToPath(asset(file)), '-alpha', 'extract', '-depth', '8', 'gray:-'], { maxBuffer: 24 * 1024 * 1024 })
  const alpha = decode('pixel-rise.webp')
  const source = decode('boot-whale-atlas-962a22048588.webp')
  const still = decode('pixel-wordmark.png')
  function region(frame, x, y, w, h) {
    const x0 = frame % scene.columns * scene.width + x
    const y0 = Math.floor(frame / scene.columns) * scene.height + y
    return Buffer.concat(Array.from({ length: h }, (_, row) => {
      const off = (y0 + row) * atlasWidth + x0
      return alpha.subarray(off, off + w)
    }))
  }
  // Before contact the whole scene contains only the inset native whale.
  for (const index of [0, 15, 45]) {
    const native = index < 34 ? 8 + Math.floor(index / 25 / (5.7 / 137)) : 40 + Math.floor((index - 34) / 25 / (5.7 / 137))
    const got = region(index, 0, 0, scene.width, scene.height)
    const expected = Buffer.alloc(got.length)
    for (let y = 0; y < 108; y++) {
      const row = (Math.floor(native / 12) * 216 + 2 * y) * 4608 + native % 12 * 384
      for (let x = 0; x < 192; x++) expected[(y + 6) * scene.width + x + 32] = Math.round(0.98 * source[row + 2 * x])
    }
    assert.ok(expected.some(Boolean))
    assert.deepEqual(got, expected)
  }
  // The bright badge is distinguishable from the receding spray at the waterline.
  function inkRows(frame) {
    const band = region(frame, 160, 58, 44, 34)
    return Array.from({ length: 34 }, (_, row) => row + 58)
      .filter(y => band.subarray((y - 58) * 44, (y - 57) * 44).some(v => v > 240))
  }
  const emerging = inkRows(34 + 44)
  const settled = inkRows(scene.pixelSettledFrame)
  assert.ok(emerging.length > 0 && settled.length > 0)
  assert.ok(emerging[0] >= settled[0] + 12)
  const steady = region(scene.pixelSettledFrame, 48, 60, 164, 20)
  assert.ok(steady.some(v => v >= 250))
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 164; x++) assert.equal(still[(60 + y) * 3 * scene.width * 3 + (48 + x) * 3], steady[y * 164 + x])
  }
  const water = []
  for (let n = scene.loopStart; n < scene.frames; n++) {
    assert.deepEqual(region(n, 48, 60, 164, 20), steady)
    water.push(region(n, 0, 80, scene.width, 22))
  }
  assert.ok(new Set(water.map(b => createHash('sha256').update(b).digest('hex'))).size >= water.length - 1)
  const delta = (a, b) => a.reduce((total, value, i) => total + Math.abs(value - b[i]), 0)
  const interior = water.slice(1).map((value, i) => delta(value, water[i]))
  assert.ok(delta(water.at(-1), water[0]) <= Math.max(...interior) * 1.1)
})

const hasVideoTools = ['ffmpeg', 'ffprobe'].every(bin => spawnSync(bin, ['-version']).status === 0)

test('silent films encode the original dot opacity in both theme views, including the loop seam', {
  skip: !hasImageMagick || !hasVideoTools,
}, () => {
  const alpha = execFileSync('magick', [fileURLToPath(asset('pixel-rise.webp')), '-alpha', 'extract', '-depth', '8', 'gray:-'],
    { maxBuffer: 24 * 1024 * 1024 })
  const width = scene.width * 3, height = scene.height * 3, area = width * height
  for (const [name, offset, count, selected] of [
    ['pixel-opening', 0, scene.frames, [0, 21, 49, 80, scene.restoreStart, scene.settledFrame, scene.frames - 1]],
    ['pixel-ripples', scene.loopStart, scene.frames - scene.loopStart, [0, 29, 59]],
  ]) {
    const path = fileURLToPath(asset(name + '.webm'))
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_packets', '-show_streams', '-show_format', '-of', 'json', path]))
    assert.equal(info.streams.length, 1)
    const [stream] = info.streams
    assert.equal(stream.codec_name, 'vp9')
    assert.equal(stream.width, width)
    assert.equal(stream.height, 2 * height)
    assert.equal(stream.tags.alpha_mode, '1')
    assert.equal(stream.r_frame_rate, scene.fps + '/1')
    assert.equal(Number(stream.nb_read_packets), count)
    assert.equal(Number(info.format.duration), count / scene.fps)
    const select = "select='" + selected.map(i => 'eq(n,' + i + ')').join('+') + "'"
    const decoded = execFileSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-i', path, '-vf',
      select + ',alphaextract', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'],
    { maxBuffer: selected.length * area * 2 })
    assert.equal(decoded.length, selected.length * area * 2)
    for (const [i, relative] of selected.entries()) {
      const frame = offset + relative
      const top = Math.floor(frame / scene.columns) * scene.height * atlasWidth + frame % scene.columns * scene.width
      const light = decoded.subarray(i * 2 * area, (i * 2 + 1) * area)
      assert.ok(light.equals(decoded.subarray((i * 2 + 1) * area, (i + 1) * 2 * area)), 'theme alpha matches')
      const expected = Buffer.alloc(area)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dot = alpha[top + Math.floor(y / 3) * atlasWidth + Math.floor(x / 3)]
          const edge = (x % 3 === 2) + (y % 3 === 2)
          expected[y * width + x] = Math.round(dot * [1, 0.4, 40 / 255][edge])
        }
      }
      if (frame > scene.restoreStart) {
        const { x, y, width: w, height: h } = scene.wordmark
        for (let row = 3 * y; row < 3 * (y + h); row++) {
          const start = row * width + 3 * x
          light.copy(expected, start, start, start + 3 * w)
        }
      }
      assert.ok(light.equals(expected), name + ' retains the original whale and water at frame ' + frame)
    }
  }
})

test('one highlight reveals the SVG from left to right in both themes and leaves a steady logo above the loop', {
  skip: !hasImageMagick || !hasVideoTools || spawnSync('rsvg-convert', ['--version']).status !== 0,
}, () => {
  const { width, height, x, y } = scene.wordmark
  const w = 3 * width, h = 3 * height, bytes = w * h * 4
  const svg = readFileSync(asset('harness-logo.svg'), 'utf8')
  const sweepFrame = fraction => scene.restoreStart + Math.round(fraction * (scene.settledFrame - scene.restoreStart))
  for (const [half, fg, chip, bg] of [[0, '#0f1115', '#ffffff', [255, 255, 255]], [1, '#f9fafb', '#353638', [21, 21, 23]]]) {
    const logo = svg.replaceAll('var(--harness-logo-foreground, #F9FAFB)', fg)
      .replaceAll('var(--harness-logo-chip-text, #353638)', chip)
    const png = execFileSync('rsvg-convert', ['-w', String(w), '-h', String(h)], { input: logo })
    const reference = execFileSync('magick', ['png:-', '-depth', '8', 'rgba:-'], { input: png })
    function readMarks(file, frames) {
      const select = "select='" + frames.map(i => 'eq(n,' + i + ')').join('+') + "'"
      const decoded = execFileSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-i', fileURLToPath(asset(file)),
        '-vf', select + ',format=rgba,crop=' + [w, h, x * 3, (y + half * scene.height) * 3].join(':'),
        '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: frames.length * bytes })
      assert.equal(decoded.length, frames.length * bytes)
      return frames.map((_, i) => decoded.subarray(i * bytes, (i + 1) * bytes))
    }
    function meanDifference(mark, expected = reference, left = 0, right = w) {
      let error = 0
      for (let i = 0; i < bytes; i += 4) {
        const column = i / 4 % w
        if (column < left || column >= right) continue
        for (let c = 0; c < 3; c++) {
          error += Math.abs((mark[i + c] - bg[c]) * mark[i + 3] - (expected[i + c] - bg[c]) * expected[i + 3]) / 255
        }
      }
      return error / ((right - left) * h * 3)
    }
    function highlight(mark) {
      let energy = 0, moment = 0, secondMoment = 0
      for (let i = 0; i < bytes; i += 4) {
        const opacity = mark[i + 3] / 255
        const blue = (mark[i + 2] - mark[i]) * opacity + (bg[2] - bg[0]) * (1 - opacity)
        const weight = Math.max(0, blue - 55), x = (i / 4 % w) / w
        energy += weight
        moment += weight * x
        secondMoment += weight * x * x
      }
      const center = energy ? moment / energy : 0
      return { energy, center, spread: energy ? Math.sqrt(Math.max(0, secondMoment / energy - center * center)) : 0 }
    }
    const frames = Array.from({ length: scene.settledFrame - scene.restoreStart + 1 }, (_, i) => scene.restoreStart + i)
    const marks = readMarks('pixel-opening.webm', [...frames, scene.exitFrame])
    const dot = marks[0], final = marks.at(-2), hold = marks.at(-1)
    assert.equal(highlight(dot).energy, 0)
    let furthest = 0
    const lights = marks.map(highlight)
    for (const glint of lights.filter(light => light.energy > 1000)) {
      assert.ok(glint.center >= furthest - 0.01, 'the light makes a single forward pass')
      furthest = Math.max(furthest, glint.center)
      assert.ok(glint.spread < 0.06, 'light is concentrated around one front')
    }
    for (const [fraction, position] of [[0.2, 0.15], [0.5, 0.51], [0.78, 0.83]]) {
      const index = sweepFrame(fraction) - scene.restoreStart, frame = marks[index], glint = lights[index]
      assert.ok(glint.energy > 1000, 'visible light on the mark')
      assert.ok(Math.abs(glint.center - position) < 0.06, 'light follows the reveal across the lettering')
      assert.ok(meanDifference(frame, final, 0, Math.floor(w * (position - 0.10))) < 1, 'swept strokes match the SVG')
      assert.ok(meanDifference(frame, dot, Math.ceil(w * (position + 0.10)), w) < 1, 'pixels ahead of the light stay intact')
    }
    assert.equal(highlight(final).energy, 0)
    assert.ok(meanDifference(final) < 2, 'final video matches the actual SVG including badge lettering')
    assert.ok(final.equals(hold), 'wordmark remains fixed while the opening continues')
    for (const frame of readMarks('pixel-ripples.webm', [0, scene.frames - scene.loopStart - 1])) {
      assert.ok(frame.equals(final), 'opening and loop have the same final logo')
    }
  }
})
