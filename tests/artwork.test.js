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

test('the shipped images contain the declared scene, loop and static dot grid', () => {
  const png = readFileSync(asset('pixel-wordmark.png'))
  assert.equal(png.readUInt32BE(16), 3 * scene.width)
  assert.equal(png.readUInt32BE(20), 3 * scene.height)
  const webp = readFileSync(asset('pixel-rise.webp'))
  assert.equal(webp.toString('ascii', 12, 16), 'VP8L')
  const packed = webp.readUInt32LE(21)
  assert.equal(1 + (packed & 0x3fff), atlasWidth)
  assert.equal(1 + ((packed >>> 14) & 0x3fff), atlasHeight)
  assert.ok(0 < scene.settledFrame && scene.settledFrame < scene.exitFrame && scene.exitFrame < scene.loopStart)
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
  const settled = inkRows(scene.settledFrame)
  assert.ok(emerging.length > 0 && settled.length > 0)
  assert.ok(emerging[0] >= settled[0] + 12)
  const steady = region(scene.settledFrame, 48, 60, 164, 20)
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
