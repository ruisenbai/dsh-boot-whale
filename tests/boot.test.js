import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const runtime = readFileSync(new URL('../runtime/boot.js', import.meta.url), 'utf8')
const art = { ...JSON.parse(readFileSync(new URL('../assets/pixel-rise.json', import.meta.url), 'utf8')), url: '/scene.webp' }
const ms = frame => frame * 1000 / art.fps

function scene({ desktop = false, reduced = false, missingRoot = false, drawFailure = false } = {}) {
  let clock = 0
  let nextId = 0
  let shown
  let check
  const timers = new Map()
  const frames = new Map()
  const draws = []
  const images = []
  class Element extends EventTarget {
    constructor(tag) {
      super()
      this.tag = tag
      this.children = []
      this.dataset = {}
      this.attributes = new Map()
    }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child) } }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this) }
    setAttribute(key, value) { this.attributes.set(key, value) }
    hasAttribute(key) { return this.attributes.has(key) }
    querySelector(selector) {
      assert.equal(selector, ':scope > [data-dsh-boot]')
      return this.children.find(child => child.hasAttribute('data-dsh-boot')) ?? null
    }
    getContext() {
      return {
        canvas: this, fillRect() {}, clearRect() {}, createPattern: () => ({}),
        drawImage(image, x, y) {
          if (drawFailure) throw new Error('Canvas lost')
          assert.equal(image.src, art.url)
          draws.push(y / art.height * art.columns + x / art.width)
        },
      }
    }
  }
  class Image {
    constructor() {
      this.naturalWidth = art.width * art.columns
      this.naturalHeight = art.height * Math.ceil(art.frames / art.columns)
      images.push(this)
    }
    removeAttribute(key) { if (key === 'src') delete this.src }
  }
  class MutationObserver {
    constructor(callback) { check = callback }
    observe() {}
    disconnect() { check = undefined }
  }
  const root = new Element('div')
  const boot = new Element('div')
  boot.setAttribute('data-dsh-boot', '')
  root.append(boot)
  const document = Object.assign(new EventTarget(), {
    body: new Element('body'), hidden: false, createElement: tag => new Element(tag),
    getElementById: id => id === 'root' && !missingRoot ? root : null,
  })
  const window = Object.assign(new EventTarget(), {
    setTimeout(callback, delay) {
      const id = ++nextId
      timers.set(id, { callback, at: clock + delay })
      return id
    },
  })
  const motion = Object.assign(new EventTarget(), { matches: reduced })
  const globals = {
    window, document, Image, MutationObserver, __DSH_BOOT_WHALE_ARTWORK__: art,
    matchMedia: () => motion, getComputedStyle: () => ({ color: '#11263b' }),
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id },
    cancelAnimationFrame: id => frames.delete(id), clearTimeout: id => timers.delete(id),
  }
  if (desktop) globals.dshDesktopBoot = {
    onWindowShown(callback) { shown = callback; return () => { shown = undefined } },
  }
  vm.runInNewContext(runtime, globals, { filename: 'runtime/boot.js' })
  const layer = document.body.children[0]
  return {
    layer, body: document.body, images, draws, motion,
    show() { shown() },
    load() { assert.equal(images.length, 1); images[0].onload() },
    ready() { missingRoot = false; root.children = [new Element('main')]; check?.() },
    fail() { boot.setAttribute('data-dsh-boot-failed', ''); check?.() },
    hide() { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')) },
    pagehide() { window.dispatchEvent(new Event('pagehide')) },
    step(target) {
      assert.ok(target >= clock)
      let pending
      while ((pending = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0])) {
        const [id, timer] = pending
        clock = timer.at; timers.delete(id); timer.callback()
      }
      clock = target
      const draw = [...frames.values()]
      frames.clear()
      for (const callback of draw) callback(clock)
    },
    scheduled() { return frames.size + timers.size },
  }
}

test('a fast desktop launch starts on show, plays the rise and holds the settled wordmark', () => {
  const s = scene({ desktop: true, missingRoot: true })
  s.ready()
  assert.equal(s.images.length, 0)
  s.show(); s.show(); s.load()
  s.step(0); s.step(16); s.step(40)
  assert.deepEqual(s.draws, [0, 1])
  s.step(ms(art.settledFrame) - 1)
  assert.equal(s.layer.dataset.phase, 'opening')
  s.step(ms(art.settledFrame))
  assert.equal(s.layer.dataset.phase, 'brand')
  s.step(ms(art.exitFrame) - 1)
  assert.equal(s.layer.dataset.phase, 'brand')
  s.step(ms(art.exitFrame))
  assert.equal(s.layer.dataset.phase, 'leaving')
  s.step(ms(art.exitFrame) + 400)
  assert.equal(s.body.children.length, 0)
  assert.equal(s.scheduled(), 0)
})

test('a long frame still allows the settled wordmark its full readable hold', () => {
  const s = scene()
  s.load(); s.ready(); s.step(0)
  const late = ms(art.exitFrame) + 200
  s.step(late)
  assert.equal(s.draws.at(-1), art.settledFrame)
  const hold = ms(art.exitFrame - art.settledFrame)
  s.step(late + hold - 1)
  assert.equal(s.layer.dataset.phase, 'brand')
  s.step(late + hold)
  assert.equal(s.layer.dataset.phase, 'leaving')
})

test('a slow launch repeats only the water under the stationary wordmark', () => {
  const s = scene()
  s.load(); s.step(0); s.step(ms(art.settledFrame)); s.step(ms(art.exitFrame))
  const checkpoints = [art.loopStart, art.frames - 1, art.frames, art.frames + 1, art.frames * 2 - art.loopStart]
  for (const [i, expected] of [art.loopStart, art.frames - 1, art.loopStart, art.loopStart + 1, art.loopStart].entries()) {
    s.step(ms(checkpoints[i]))
    assert.equal(s.draws.at(-1), expected)
  }
  assert.equal(s.layer.dataset.phase, 'brand')
  s.ready()
  assert.equal(s.layer.dataset.phase, 'leaving')
})

test('reduced motion uses the embedded still without requesting the atlas', () => {
  const s = scene({ reduced: true })
  assert.equal(s.layer.dataset.still, '')
  assert.equal(s.images.length, 0)
  s.ready()
  s.step(ms(art.exitFrame - art.settledFrame))
  assert.equal(s.body.children.length, 0)
  assert.equal(s.scheduled(), 0)
})

test('broken artwork, decoding timeouts and lost drawing all reach the workspace with the still', () => {
  for (const error of ['image', 'geometry', 'timeout', 'drawing', 'frames']) {
    const s = scene({ drawFailure: error === 'drawing' })
    s.ready()
    if (error === 'image') s.images[0].onerror()
    if (error === 'geometry') { s.images[0].naturalWidth--; s.load() }
    if (error === 'timeout') s.step(8000)
    if (error === 'drawing') { s.load(); s.step(0) }
    if (error === 'frames') { s.load(); s.step(ms(art.exitFrame) + 2000) }
    assert.equal(s.layer.dataset.still, '', error)
    s.step(10000)
    assert.equal(s.body.children.length, 0, error)
    assert.equal(s.scheduled(), 0, error)
  }
})

test('a hidden window, a motion preference change, or navigation releases the film', () => {
  const hidden = scene()
  hidden.load(); hidden.step(0); hidden.hide(); hidden.ready(); hidden.step(5)
  assert.equal(hidden.body.children.length, 0)
  const reduced = scene()
  reduced.load(); reduced.step(0); reduced.motion.matches = true; reduced.motion.dispatchEvent(new Event('change'))
  assert.equal(reduced.layer.dataset.still, '')
  reduced.pagehide()
  assert.equal(reduced.scheduled(), 0)
  assert.equal(reduced.images[0].onload, null)
})

test('a boot failure immediately exposes the host report even during the rise', () => {
  const s = scene()
  s.load(); s.step(0); s.step(2750); s.fail()
  assert.equal(s.body.children.length, 0)
  assert.equal(s.scheduled(), 0)
})
