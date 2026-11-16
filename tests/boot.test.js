import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const runtime = readFileSync(new URL('../runtime/boot.js', import.meta.url), 'utf8')

function scene({ desktop = false, reducedMotion = false, rootInitiallyMissing = false } = {}) {
  class Element {
    constructor(tag) {
      this.tag = tag
      this.children = []
      this.dataset = {}
      this.attributes = new Map()
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
        setTransform() {}, clearRect() {}, drawImage() {}, fillRect() {},
        imageSmoothingEnabled: false, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '',
      }
    }
  }

  const body = new Element('body')
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
      getElementById(id) { return id === 'root' && rootExists ? host : null },
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
    overlay, body, boot, imageInstances,
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

test('keeps the opening textless until its first breach ends, then holds the wordmark', () => {
  const s = scene({ desktop: true })
  assert.equal(s.overlay.dataset.phase, 'opening')
  assert.equal(s.imageInstances[0].src, undefined)
  s.show()
  assert.match(s.imageInstances[0].src, /boot-whale-atlas.*\.webp$/)
  s.load()
  s.step(0)
  assert.equal(s.overlay.dataset.phase, 'opening')
  s.step(5700)
  assert.equal(s.overlay.dataset.phase, 'brand')
  s.ready()
  assert.equal(s.overlay.dataset.phase, 'leaving')
  s.advance(420)
  assert.equal(s.body.children.length, 0)
})

test('a ready application still waits for the whale, without flashing the wordmark', () => {
  const s = scene()
  s.load()
  s.step(0)
  s.ready()
  assert.equal(s.overlay.dataset.phase, 'opening')
  s.step(5700)
  assert.equal(s.overlay.dataset.phase, 'leaving')
})

test('reduced motion shows the wordmark immediately and failures reveal the native report', () => {
  const s = scene({ reducedMotion: true })
  assert.equal(s.overlay.dataset.phase, 'brand')
  s.fail()
  assert.equal(s.body.children.length, 0)
})

test('an image failure shows the wordmark until the application is ready', () => {
  const s = scene()
  s.imageInstances[0].onerror()
  assert.equal(s.overlay.dataset.phase, 'brand')
  s.ready()
  assert.equal(s.overlay.dataset.phase, 'leaving')
})

test('served HTML can inject the opening before the application root is parsed', () => {
  const s = scene({ rootInitiallyMissing: true })
  assert.equal(s.overlay.dataset.phase, 'opening')
  s.attachRoot()
  s.ready()
  s.load()
  s.step(0)
  s.step(5700)
  assert.equal(s.overlay.dataset.phase, 'leaving')
})
