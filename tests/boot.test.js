import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { wordmarkSweep } from '../runtime/sweep.js'

const runtime = readFileSync(new URL('../runtime/boot.js', import.meta.url), 'utf8')
const geometry = JSON.parse(readFileSync(new URL('../assets/pixel-rise.json', import.meta.url)))
const art = { opening: '/opening.webm', ripples: '/ripples.webm',
  settledAt: geometry.settledFrame / geometry.fps, exitAt: geometry.exitFrame / geometry.fps,
  sweep: { startAt: geometry.restoreStart / geometry.fps, fps: geometry.fps, positions: wordmarkSweep(geometry).positions } }

function scene({ desktop = false, reduced = false, rejectPlay = false } = {}) {
  let clock = 0, id = 0, shown, check
  const timers = new Map()
  const videos = []
  class Element extends EventTarget {
    children = []
    dataset = {}
    attributes = new Map()
    get firstElementChild() { return this.children[0] }
    animations = []
    animate(frames, timing) {
      const animation = { frames, timing, currentTime: 0, playbackRate: 1, playState: 'running',
        play() { this.playState = 'running' }, pause() { this.playState = 'paused' }, cancel() { this.playState = 'idle' } }
      this.animations.push(animation)
      return animation
    }
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
    playbackRate = 1
    readyState = 4
    paused = true
    plays = 0
    pauses = 0
    loads = 0
    set src(url) { this.setAttribute('src', url) }
    get src() { return this.attributes.get('src') }
    play() {
      this.plays++
      if (rejectPlay) return Promise.reject(Error('Playback denied'))
      this.paused = false
      return Promise.resolve()
    }
    pause() { this.pauses++; this.paused = true; this.dispatchEvent(new Event('pause')) }
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
    assert.equal(s.layer.dataset.phase, 'opening', 'the film still shows the dots ahead of the light')
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

test('the original SVG is revealed on the video clock, including pauses, seeks and resuming playback', () => {
  const s = scene()
  s.opening.dispatchEvent(new Event('playing'))
  const mask = s.stage.children.at(-1).firstElementChild
  const sweep = mask.animations[0]
  const wordmark = s.svg.animations[0]
  assert.ok(sweep, 'the original SVG layer starts its reveal with the film')
  assert.equal(mask.firstElementChild, s.svg)
  assert.equal(sweep.timing, wordmark.timing)
  assert.equal(sweep.timing.delay, art.sweep.startAt * 1000)
  assert.equal(Math.round(sweep.timing.duration), 1800)
  assert.equal(sweep.timing.fill, 'both')
  for (const [i, x] of art.sweep.positions.entries()) {
    assert.equal(sweep.frames[i].transform, 'translate3d(' + x + '%, 0, 0)')
    assert.equal(wordmark.frames[i].transform, 'translate3d(' + -x + '%, 0, 0)')
    assert.ok([sweep, wordmark].every(a => a.frames[i].easing === 'step-end'))
  }
  const mid = art.sweep.startAt + 0.9
  s.opening.time(mid)
  assert.equal(sweep.currentTime, mid * 1000)
  assert.equal(wordmark.currentTime, sweep.currentTime)
  assert.equal(sweep.playState, 'running')
  s.opening.dispatchEvent(new Event('waiting'))
  assert.equal(sweep.playState, 'paused')
  s.opening.dispatchEvent(new Event('playing'))
  assert.equal(sweep.playState, 'running')
  s.opening.pause()
  s.opening.time(art.sweep.startAt + 0.25)
  assert.equal(sweep.playState, 'paused')
  assert.equal(sweep.currentTime, s.opening.currentTime * 1000)
  s.opening.playbackRate = 0.5
  s.opening.play()
  s.opening.dispatchEvent(new Event('playing'))
  assert.equal(sweep.playbackRate, 0.5)
  s.opening.time(art.exitAt)
  assert.equal(sweep.playState, 'idle')
  assert.equal(wordmark.playState, 'idle')
  assert.equal(s.layer.dataset.phase, 'brand')
  s.opening.currentTime = mid
  s.opening.seeking = true
  s.opening.dispatchEvent(new Event('seeking'))
  const resumed = mask.animations.at(-1)
  assert.notEqual(resumed, sweep)
  assert.equal(resumed.playState, 'paused')
  s.opening.seeking = false
  s.opening.dispatchEvent(new Event('seeked'))
  assert.equal(resumed.currentTime, mid * 1000)
  assert.equal(resumed.playState, 'running')
  s.ready()
  assert.equal(s.layer.dataset.phase, 'opening', 'a seek back into the sweep restores its hold')
  s.hide()
  assert.equal(resumed.playState, 'idle')
  assert.equal(s.layer.dataset.still, '')
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
  assert.equal(s.stage.children.at(-1).firstElementChild.firstElementChild, s.svg)
  assert.equal(s.svg.animations.length, 0)
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
