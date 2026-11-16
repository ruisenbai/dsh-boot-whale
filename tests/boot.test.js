import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const runtime = readFileSync(new URL('../runtime/boot.js', import.meta.url), 'utf8')

function scene({ desktop = false, reducedMotion = false, rootInitiallyMissing = false } = {}) {
  const drawnFrames = []
  class Element {
    constructor(tag) {
      this.tag = tag
      this.children = []
      this.dataset = {}
      this.attributes = new Map()
      this.style = { setProperty() {} }
      this.clientWidth = tag === 'canvas' ? 840 : 0
      this.clientHeight = tag === 'canvas' ? 472.5 : 0
      this.textContent = ''
    }
    append(...children) {
      for (const child of children) { child.parent = this; this.children.push(child) }
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this)
    }
    setAttribute(name, value) { this.attributes.set(name, value) }
    hasAttribute(name) { return this.attributes.has(name) }
    removeAttribute(name) { this.attributes.delete(name) }
    querySelector(selector) {
      assert.equal(selector, ':scope > [data-dsh-boot]')
      return this.children.find(child => child.hasAttribute('data-dsh-boot')) ?? null
    }
    getContext() {
      return {
        setTransform() {}, clearRect() {}, fillRect() {},
        drawImage(_image, x, y) { drawnFrames.push(y / 216 * 12 + x / 384) },
        imageSmoothingEnabled: false, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '',
      }
    }
  }

  const body = new Element('body')
  const logoTemplate = new Element('template')
  logoTemplate.content = new Element('fragment')
  body.append(logoTemplate)
  const host = new Element('div')
  const boot = new Element('div')
  boot.setAttribute('data-dsh-boot', '')
  host.append(boot)
  let rootExists = !rootInitiallyMissing
  const observers = []
  let clock = 0
  let nextId = 1
  const timers = new Map()
  const frames = new Map()
  const imageInstances = []
  const motion = { matches: reducedMotion, addEventListener() {}, removeEventListener() {} }
  let onWindowShown

  class Image {
    constructor() {
      imageInstances.push(this)
      this.naturalWidth = 4608
      this.naturalHeight = 2592
    }
    set src(value) { this.source = value }
    get src() { return this.source }
    removeAttribute(name) { if (name === 'src') this.source = undefined }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe() {}
    disconnect() {}
  }
  class ResizeObserver {
    observe() {}
    disconnect() {}
  }
  const schedule = (callback, delay) => {
    const id = nextId++
    timers.set(id, { callback, at: clock + delay })
    return id
  }
  const window = {
    setTimeout: schedule, addEventListener() {}, removeEventListener() {},
  }
  const globals = {
    document: {
      body, hidden: false,
      getElementById(id) {
        if (id === 'dsbw-logo-template') return logoTemplate
        return id === 'root' && rootExists ? host : null
      },
      createElement(tag) { return new Element(tag) },
      addEventListener() {}, removeEventListener() {},
    },
    window,
    Image,
    MutationObserver,
    ResizeObserver,
    matchMedia() { return motion },
    devicePixelRatio: 1,
    getComputedStyle() { return { color: '#11263b' } },
    requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
    clearTimeout(id) { timers.delete(id) },
  }
  if (desktop) globals.dshDesktopBoot = {
    onWindowShown(callback) { onWindowShown = callback; return () => { onWindowShown = undefined } },
  }
  vm.runInNewContext(runtime, globals, { filename: 'runtime/boot.js' })
  const overlay = body.children[0]
  assert.equal(overlay?.dataset.dshBootWhale, '')

  return {
    overlay, body, boot, imageInstances, drawnFrames,
    attachRoot() {
      rootExists = true
      for (const observer of observers) observer.callback()
    },
    show() { assert.ok(onWindowShown); onWindowShown() },
    load() { assert.equal(imageInstances.length, 1); imageInstances[0].onload() },
    step(time) {
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) callback(time)
    },
    advance(ms) {
      clock += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock) { timers.delete(id); timer.callback() }
      }
    },
    ready() {
      host.children = [new Element('main')]
      for (const observer of observers) observer.callback()
    },
    fail() {
      boot.setAttribute('data-dsh-boot-failed', '')
      for (const observer of observers) observer.callback()
    },
  }
}

test('plays only visible atlas frames and blends the final ripple into the wordmark', () => {
  const s = scene({ desktop: true })
  assert.equal(s.overlay.dataset.phase, 'opening')
  assert.equal(s.imageInstances[0].src, undefined)
  s.show()
  assert.match(s.imageInstances[0].src, /boot-whale-atlas.*\.webp$/)
  s.load()
  s.step(0)
  s.step(16)
  s.step(42)
  assert.deepEqual(s.drawnFrames, [8, 9])
  s.step(3900)
  assert.equal(s.overlay.dataset.phase, 'opening')
  s.step(4030)
  assert.equal(s.overlay.dataset.phase, 'crossfade')
  s.step(4329)
  assert.equal(s.overlay.dataset.phase, 'crossfade')
  assert.equal(s.drawnFrames.at(-1), 111)
  s.step(4331)
  s.advance(5000)
  assert.equal(s.overlay.dataset.phase, 'brand')
  s.ready()
  assert.equal(s.overlay.dataset.phase, 'leaving')
  s.advance(420)
  assert.equal(s.body.children.length, 0)
})

test('a fast launch gives the fully revealed logo one complete breath', () => {
  const s = scene()
  s.load()
  s.step(0)
  s.ready()
  assert.equal(s.overlay.dataset.phase, 'opening')
  s.step(4030)
  s.step(4331)
  assert.equal(s.overlay.dataset.phase, 'brand')
  s.advance(1599)
  assert.equal(s.overlay.dataset.phase, 'brand')
  s.advance(1)
  assert.equal(s.overlay.dataset.phase, 'leaving')
  s.advance(420)
  assert.equal(s.body.children.length, 0)
})

test('a delayed animation frame still allows the entire crossfade', () => {
  const s = scene()
  s.load()
  s.step(0)
  s.step(3800)
  s.step(4900)
  assert.equal(s.overlay.dataset.phase, 'crossfade')
  s.step(5199)
  assert.equal(s.overlay.dataset.phase, 'crossfade')
  s.step(5201)
  assert.equal(s.overlay.dataset.phase, 'brand')
})

test('reduced motion shows the wordmark immediately and failures reveal the native report', () => {
  const s = scene({ reducedMotion: true })
  assert.equal(s.overlay.dataset.phase, 'brand')
  assert.deepEqual(s.drawnFrames, [])
  s.fail()
  s.advance(1600)
  assert.equal(s.body.children.length, 0)
})

test('an image failure shows the wordmark until the application is ready', () => {
  const s = scene()
  s.imageInstances[0].onerror()
  assert.equal(s.overlay.dataset.phase, 'brand')
  s.advance(500)
  s.ready()
  assert.equal(s.overlay.dataset.phase, 'brand')
  s.advance(1100)
  assert.equal(s.overlay.dataset.phase, 'leaving')
})

test('served HTML can inject the opening before the application root is parsed', () => {
  const s = scene({ rootInitiallyMissing: true })
  assert.equal(s.overlay.dataset.phase, 'opening')
  s.attachRoot()
  s.ready()
  s.load()
  s.step(0)
  s.step(4030)
  s.step(4331)
  s.advance(1600)
  assert.equal(s.overlay.dataset.phase, 'leaving')
})
