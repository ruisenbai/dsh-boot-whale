import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const runtime = readFileSync(new URL('../runtime/boot.js', import.meta.url), 'utf8')
const geometry = JSON.parse(readFileSync(new URL('../assets/pixel-rise.json', import.meta.url)))
const art = { opening: '/opening.webm', ripples: '/ripples.webm',
  settledAt: geometry.settledFrame / geometry.fps, exitAt: geometry.exitFrame / geometry.fps }

function scene({ desktop = false, reduced = false, rejectPlay = false } = {}) {
  let clock = 0, id = 0, shown, check
  const timers = new Map()
  const videos = []
  class Element extends EventTarget {
    children = []
    dataset = {}
    attributes = new Map()
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child) } }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this) }
    setAttribute(key, value) { this.attributes.set(key, value) }
    hasAttribute(key) { return this.attributes.has(key) }
    removeAttribute(key) { this.attributes.delete(key) }
    querySelector(selector) {
      assert.equal(selector, ':scope > [data-dsh-boot]')
      return this.children.find(child => child.hasAttribute('data-dsh-boot'))
    }
  }
  class Video extends Element {
    currentTime = 0
    plays = 0
    pauses = 0
    loads = 0
    set src(url) { this.setAttribute('src', url) }
    get src() { return this.attributes.get('src') }
    play() { this.plays++; return rejectPlay ? Promise.reject(Error('Playback denied')) : Promise.resolve() }
    pause() { this.pauses++ }
    load() { this.loads++ }
    time(seconds) { this.currentTime = seconds; this.dispatchEvent(new Event('timeupdate')) }
    end() { this.ended = true; this.time(geometry.frames / geometry.fps); this.dispatchEvent(new Event('ended')) }
    fail() { this.error = {}; this.dispatchEvent(new Event('error')) }
  }
  class MutationObserver {
    constructor(callback) { check = callback }
    observe() {}
    disconnect() { check = undefined }
  }
  const root = new Element(), boot = new Element()
  const svg = new Element()
  const template = { content: { cloneNode(deep) { assert.equal(deep, true); return svg } } }
  boot.setAttribute('data-dsh-boot', '')
  root.append(boot)
  const document = Object.assign(new EventTarget(), {
    body: new Element(), hidden: false, getElementById: id => ({ root, 'dsbw-logo-template': template })[id],
    createElement(tag) {
      if (tag !== 'video') return new Element()
      const video = new Video(); videos.push(video); return video
    },
  })
  const window = Object.assign(new EventTarget(), {
    setTimeout(callback, delay) { timers.set(++id, { callback, at: clock + delay }); return id },
  })
  const motion = Object.assign(new EventTarget(), { matches: reduced })
  const globals = { window, document, MutationObserver, __DSH_BOOT_WHALE_ARTWORK__: art,
    matchMedia: () => motion, clearTimeout: id => timers.delete(id) }
  if (desktop) globals.dshDesktopBoot = {
    onWindowShown(callback) { shown = callback; return () => { shown = undefined } },
  }
  vm.runInNewContext(runtime, globals)
  return {
    layer: document.body.children[0], stage: document.body.children[0].children[0], body: document.body,
    opening: videos[0], ripples: videos[1], motion, svg,
    show() { shown() },
    ready() { root.children = [new Element()]; check?.() },
    fail() { boot.setAttribute('data-dsh-boot-failed', ''); check?.() },
    hide() { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')) },
    navigate() { window.dispatchEvent(new Event('pagehide')) },
    step(target) {
      let next
      while ((next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0])) {
        timers.delete(next[0]); clock = next[1].at; next[1].callback()
      }
      clock = target
    },
    scheduled: () => timers.size,
  }
}

test('each new desktop document starts once from frame zero after its window signal', () => {
  for (const s of [scene({ desktop: true }), scene({ desktop: true })]) {
    s.ready()
    assert.equal(s.opening.src, undefined)
    s.show(); s.show()
    assert.equal(s.opening.src, art.opening)
    assert.equal(s.opening.currentTime, 0)
    assert.equal(s.opening.plays, 1)
    assert.ok(s.opening.muted && s.opening.defaultMuted && s.opening.playsInline)
    s.opening.time(geometry.restoreStart / geometry.fps + 0.9)
    assert.equal(s.layer.dataset.phase, 'opening', 'video remains visible throughout the contour transition')
    s.opening.time(art.settledAt - 0.01)
    assert.equal(s.layer.dataset.phase, 'opening')
    s.opening.time(art.settledAt)
    assert.equal(s.layer.dataset.phase, 'brand')
    s.opening.time(art.exitAt - 0.01)
    assert.equal(s.layer.dataset.phase, 'brand')
    s.opening.time(art.exitAt)
    assert.equal(s.layer.dataset.phase, 'leaving')
    assert.equal(s.opening.pauses, 0, 'video continues through the fade')
    assert.equal(s.ripples.src, undefined)
    s.step(400)
    assert.equal(s.opening.src, undefined)
    assert.equal(s.opening.loads, 1)
    assert.equal(s.body.children.length, 0)
    assert.equal(s.scheduled(), 0)
  }
})

test('a delayed host readiness callback observes the video clock without restarting the hold', () => {
  const s = scene()
  s.opening.currentTime = art.exitAt + 0.4
  s.ready()
  assert.equal(s.layer.dataset.phase, 'leaving')
  assert.equal(s.opening.plays, 1)
  assert.equal(s.ripples.src, undefined)
})

test('slow starts preload the water, display the last opening frame until loop playback, then exit', () => {
  const s = scene()
  s.opening.time(art.exitAt)
  assert.equal(s.ripples.src, art.ripples)
  assert.equal(s.ripples.plays, 0)
  s.opening.end()
  assert.equal(s.ripples.loop, true)
  assert.equal(s.ripples.plays, 1)
  assert.equal(s.stage.dataset.looping, undefined)
  s.ripples.dispatchEvent(new Event('playing'))
  assert.equal(s.stage.dataset.looping, '')
  assert.equal(s.layer.dataset.phase, 'brand')
  s.ready(); s.step(400)
  assert.equal(s.body.children.length, 0)
  assert.equal(s.ripples.src, undefined)
})

test('reduced motion requests no moving media and holds the embedded still', () => {
  const s = scene({ reduced: true })
  assert.equal(s.layer.dataset.still, '')
  assert.equal(s.stage.children.at(-1).children[0], s.svg)
  assert.equal(s.opening.src, undefined)
  assert.equal(s.ripples.src, undefined)
  s.ready(); s.step(719)
  assert.equal(s.body.children.length, 1)
  s.step(720)
  assert.equal(s.body.children.length, 0)
})

test('media errors, rejected playback and a stalled clock all uncover the workspace', async () => {
  for (const reason of ['decode', 'denied', 'stalled', 'ripples']) {
    const s = scene({ rejectPlay: reason === 'denied' })
    if (reason === 'decode') s.opening.fail()
    if (reason === 'denied') await new Promise(resolve => setImmediate(resolve))
    if (reason === 'stalled') { s.opening.time(2); s.step(8000); assert.equal(s.layer.dataset.still, undefined); s.step(16000) }
    if (reason === 'ripples') {
      s.opening.time(art.exitAt); s.ripples.fail()
      assert.equal(s.layer.dataset.still, undefined)
      s.opening.end()
    }
    assert.equal(s.layer.dataset.still, '', reason)
    s.ready(); s.step(18000)
    assert.equal(s.body.children.length, 0, reason)
    assert.equal(s.scheduled(), 0)
  }
})

test('visibility, reduced motion, host failure and navigation release the native player', () => {
  const hidden = scene()
  hidden.hide(); hidden.ready(); hidden.step(1)
  assert.equal(hidden.body.children.length, 0)
  const motion = scene()
  motion.motion.matches = true; motion.motion.dispatchEvent(new Event('change'))
  assert.equal(motion.layer.dataset.still, '')
  const failed = scene()
  failed.fail()
  assert.equal(failed.body.children.length, 0)
  for (const s of [motion, scene()]) {
    s.navigate()
    assert.equal(s.opening.src, undefined)
    assert.equal(s.scheduled(), 0)
    assert.equal(s.body.children.length, 0)
  }
})
