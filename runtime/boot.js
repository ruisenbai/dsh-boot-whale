/* An early index injection runs before the client and its framework are available. */
(() => {
  const scene = globalThis.__DSH_BOOT_WHALE_ARTWORK__
  if (!scene || !document.body || globalThis.__DSH_BOOT_WHALE_STARTED__) return
  globalThis.__DSH_BOOT_WHALE_STARTED__ = true

  const overlay = document.createElement('div')
  overlay.className = 'dsbw-boot'
  overlay.dataset.dshBootWhale = ''
  overlay.dataset.phase = 'opening'
  const stage = document.createElement('div')
  stage.className = 'dsbw-stage'
  stage.setAttribute('role', 'img')
  stage.setAttribute('aria-label', 'DeepSeek Harness')
  const canvas = document.createElement('canvas')
  canvas.className = 'dsbw-scene'
  canvas.width = scene.width * 3
  canvas.height = scene.height * 3
  const still = document.createElement('div')
  still.className = 'dsbw-still'
  stage.append(canvas, still)
  overlay.append(stage)
  document.body.append(overlay)

  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const frameDuration = 1000 / scene.fps
  let disposed = false
  let shown = false
  let appReady = false
  let canLeave = false
  let firstFrameAt
  let lastFrame = -1
  let ink = ''
  let pattern
  let context
  let tileContext
  let image
  let frame = 0
  let guard = 0
  let hold = 0
  let exit = 0
  let stopWatchingWindow
  const observer = new MutationObserver(checkHost)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dsh-boot-failed'] })
  document.addEventListener('visibilitychange', onVisibility)
  motion.addEventListener('change', onMotion)
  canvas.addEventListener('contextlost', showStill)
  window.addEventListener('pagehide', remove)

  function stopFilm() {
    cancelAnimationFrame(frame)
    clearTimeout(guard)
    if (image) {
      image.onload = image.onerror = null
      image.removeAttribute('src')
      image = undefined
    }
  }

  function remove() {
    if (disposed) return
    disposed = true
    stopFilm()
    clearTimeout(hold)
    clearTimeout(exit)
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    motion.removeEventListener('change', onMotion)
    canvas.removeEventListener('contextlost', showStill)
    window.removeEventListener('pagehide', remove)
    stopWatchingWindow?.()
    overlay.remove()
  }

  function leaveWhenReady() {
    if (disposed || !appReady || !canLeave || overlay.dataset.phase === 'leaving') return
    overlay.dataset.phase = 'leaving'
    stopFilm()
    exit = window.setTimeout(remove, motion.matches || document.hidden ? 0 : 400)
  }

  function allowExit() {
    canLeave = true
    clearTimeout(guard)
    leaveWhenReady()
  }

  function showStill() {
    if (disposed || overlay.dataset.still !== undefined || overlay.dataset.phase === 'leaving') return
    stopFilm()
    overlay.dataset.still = ''
    overlay.dataset.phase = 'brand'
    if (canLeave) leaveWhenReady()
    else hold = window.setTimeout(allowExit, document.hidden ? 0 : (scene.exitFrame - scene.settledFrame) * frameDuration)
  }

  function checkHost() {
    const root = document.getElementById('root')
    if (disposed || !root) return
    if (root.querySelector(':scope > [data-dsh-boot]')?.hasAttribute('data-dsh-boot-failed')) {
      remove()
      return
    }
    if ([...root.children].some(child => !child.hasAttribute('data-dsh-boot'))) {
      appReady = true
      leaveWhenReady()
    }
  }

  function onVisibility() {
    if (shown && document.hidden) showStill()
  }

  function onMotion() {
    if (shown && motion.matches) showStill()
  }

  // Reuse one tinted dot across the scene. Its three-by-three pattern matches the source whale.
  function dotPattern(color) {
    tileContext.clearRect(0, 0, 3, 3)
    tileContext.fillStyle = color
    tileContext.globalAlpha = 1
    tileContext.fillRect(0, 0, 2, 2)
    tileContext.globalAlpha = 0.4
    tileContext.fillRect(2, 0, 1, 2)
    tileContext.fillRect(0, 2, 2, 1)
    tileContext.globalAlpha = 40 / 255
    tileContext.fillRect(2, 2, 1, 1)
    return context.createPattern(tileContext.canvas, 'repeat')
  }

  function paint(index) {
    const color = getComputedStyle(canvas).color
    if (index === lastFrame && ink === color) return
    if (ink !== color || !pattern) {
      ink = color
      pattern = dotPattern(color)
      if (!pattern) { showStill(); return }
    }
    const x = index % scene.columns * scene.width
    const y = Math.floor(index / scene.columns) * scene.height
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, x, y, scene.width, scene.height, 0, 0, canvas.width, canvas.height)
    context.globalCompositeOperation = 'source-in'
    context.fillStyle = pattern
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.globalCompositeOperation = 'source-over'
    lastFrame = index
  }

  function tick(now) {
    if (disposed || !image) return
    if (document.hidden || motion.matches) { showStill(); return }
    firstFrameAt ??= now
    let index = Math.floor((now - firstFrameAt) / frameDuration)
    if (index >= scene.settledFrame && overlay.dataset.phase === 'opening') {
      // A busy renderer must still present the completed wordmark before the workspace takes over.
      index = scene.settledFrame
      firstFrameAt = now - index * frameDuration
      overlay.dataset.phase = 'brand'
    }
    const tile = index < scene.frames ? index : scene.loopStart + (index - scene.loopStart) % (scene.frames - scene.loopStart)
    try {
      paint(tile)
    } catch {
      // Drawing can fail when the browser loses the canvas while the window is moving.
      showStill()
    }
    if (!image) return
    if (index >= scene.exitFrame && !canLeave) allowExit()
    if (image) frame = requestAnimationFrame(tick)
  }

  function start() {
    if (disposed || shown) return
    shown = true
    if (motion.matches || document.hidden) { showStill(); return }
    context = canvas.getContext('2d')
    const tile = document.createElement('canvas')
    tile.width = tile.height = 3
    tileContext = tile.getContext('2d')
    if (!context || !tileContext) { showStill(); return }
    context.imageSmoothingEnabled = false
    image = new Image()
    image.onerror = showStill
    image.onload = () => {
      if (disposed || !image) return
      if (image.naturalWidth !== scene.width * scene.columns ||
          image.naturalHeight !== scene.height * Math.ceil(scene.frames / scene.columns)) {
        showStill()
        return
      }
      clearTimeout(guard)
      guard = window.setTimeout(showStill, scene.exitFrame * frameDuration + 2000)
      frame = requestAnimationFrame(tick)
    }
    guard = window.setTimeout(showStill, 8000)
    image.src = scene.url
  }

  checkHost()
  if (disposed) return
  const desktop = globalThis.dshDesktopBoot
  if (typeof desktop?.onWindowShown === 'function') stopWatchingWindow = desktop.onWindowShown(start)
  else start()
})()
