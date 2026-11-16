/* The index injection runs before client modules, so this opening has no framework dependency. */
(() => {
  if (globalThis.__DSH_BOOT_WHALE_STARTED__) return
  globalThis.__DSH_BOOT_WHALE_STARTED__ = true

  if (document.body === null) return

  const overlay = document.createElement('div')
  overlay.className = 'dsbw-boot'
  overlay.dataset.phase = 'opening'
  overlay.dataset.dshBootWhale = ''

  const canvas = document.createElement('canvas')
  canvas.className = 'dsbw-whale'
  canvas.setAttribute('aria-hidden', 'true')
  const brand = document.createElement('div')
  brand.className = 'dsbw-brand'
  brand.setAttribute('role', 'status')
  const name = document.createElement('span')
  name.className = 'dsbw-brand-name'
  name.textContent = 'DeepSeek'
  const rule = document.createElement('span')
  rule.className = 'dsbw-brand-rule'
  rule.setAttribute('aria-hidden', 'true')
  const subtitle = document.createElement('span')
  subtitle.className = 'dsbw-brand-subtitle'
  subtitle.textContent = 'HARNESS'
  brand.append(name, rule, subtitle)
  overlay.append(canvas, brand)
  document.body.append(overlay)

  const atlas = { width: 384, height: 216, columns: 12, frames: 137 }
  const duration = 5700
  const image = new Image()
  const context = canvas.getContext('2d')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const asset = '/dsh-boot-whale/boot-whale-atlas-962a22048588.webp'
  let appReady = false
  let shown = false
  let ended = false
  let disposed = false
  let loaded = false
  let startedAt
  let frame = 0
  let imageTimeout = 0
  let playbackTimeout = 0
  let exitTimeout = 0
  let showStop
  let width = 0
  let height = 0

  const observer = new MutationObserver(checkHost)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dsh-boot-failed'] })
  const sizeObserver = new ResizeObserver(resize)
  sizeObserver.observe(canvas)
  document.addEventListener('visibilitychange', onVisibility)
  motion.addEventListener('change', onMotion)
  window.addEventListener('pagehide', remove)

  function remove() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    clearTimeout(imageTimeout)
    clearTimeout(playbackTimeout)
    clearTimeout(exitTimeout)
    image.onload = null
    image.onerror = null
    image.removeAttribute('src')
    observer.disconnect()
    sizeObserver.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    motion.removeEventListener('change', onMotion)
    window.removeEventListener('pagehide', remove)
    showStop?.()
    overlay.remove()
  }

  function leave() {
    if (disposed || overlay.dataset.phase === 'leaving') return
    overlay.dataset.phase = 'leaving'
    exitTimeout = window.setTimeout(remove, motion.matches ? 0 : 420)
  }

  function finish() {
    if (disposed || ended) return
    ended = true
    cancelAnimationFrame(frame)
    clearTimeout(playbackTimeout)
    if (appReady) leave()
    else overlay.dataset.phase = 'brand'
  }

  function checkHost() {
    if (disposed) return
    const host = document.getElementById('root')
    if (host === null) return
    const boot = host.querySelector(':scope > [data-dsh-boot]')
    if (boot?.hasAttribute('data-dsh-boot-failed')) {
      remove()
      return
    }
    if ([...host.children].some(child => !child.hasAttribute('data-dsh-boot'))) {
      appReady = true
      if (ended) leave()
    }
  }

  function resize() {
    if (disposed || ended || context === null) return
    width = canvas.clientWidth
    height = canvas.clientHeight
    if (width === 0 || height === 0) return
    const density = Math.min(devicePixelRatio, 2, Math.max(1, 840 / width))
    canvas.width = Math.round(width * density)
    canvas.height = Math.round(height * density)
    context.setTransform(density, 0, 0, density, 0, 0)
    context.imageSmoothingEnabled = false
  }

  function paint(now) {
    if (context === null || !loaded || width === 0 || height === 0) return
    const progress = Math.min(1, (now - startedAt) / duration)
    const index = Math.min(atlas.frames - 1, Math.floor(progress * atlas.frames))
    const x = (index % atlas.columns) * atlas.width
    const y = Math.floor(index / atlas.columns) * atlas.height
    const scale = Math.min(width / atlas.width, height / atlas.height)
    const left = (width - atlas.width * scale) / 2
    const top = (height - atlas.height * scale) / 2
    const fade = Math.min(1, progress * 30, (1 - progress) * 10)
    context.clearRect(0, 0, width, height)
    context.globalAlpha = fade
    context.drawImage(image, x, y, atlas.width, atlas.height,
      left, top, atlas.width * scale, atlas.height * scale)
    context.globalAlpha = 1
    context.globalCompositeOperation = 'source-in'
    context.fillStyle = getComputedStyle(canvas).color
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = 'source-over'
  }

  function tick(now) {
    if (disposed || ended) return
    if (document.hidden || motion.matches) { finish(); return }
    if (width === 0 || height === 0) resize()
    startedAt ??= now
    if (now - startedAt >= duration) { finish(); return }
    paint(now)
    frame = requestAnimationFrame(tick)
  }

  function onVisibility() {
    if (shown && document.hidden) finish()
  }

  function onMotion() {
    if (motion.matches) finish()
  }

  function start() {
    if (disposed || shown) return
    shown = true
    if (document.hidden || motion.matches || context === null) { finish(); return }
    image.onload = () => {
      if (disposed || ended) return
      clearTimeout(imageTimeout)
      if (image.naturalWidth !== atlas.width * atlas.columns
        || image.naturalHeight !== atlas.height * Math.ceil(atlas.frames / atlas.columns)) {
        finish()
        return
      }
      loaded = true
      resize()
      playbackTimeout = window.setTimeout(finish, duration + 2000)
      frame = requestAnimationFrame(tick)
    }
    image.onerror = finish
    imageTimeout = window.setTimeout(finish, 8000)
    image.src = asset
  }

  checkHost()
  const desktop = globalThis.dshDesktopBoot
  if (typeof desktop?.onWindowShown === 'function') showStop = desktop.onWindowShown(start)
  else start()
})()
