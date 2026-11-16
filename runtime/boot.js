/* The index injection runs before client modules, so this opening has no framework dependency. */
(() => {
  if (globalThis.__DSH_BOOT_WHALE_STARTED__) return
  const logoTemplate = document.getElementById('dsbw-logo-template')
  if (document.body === null || logoTemplate === null) return
  globalThis.__DSH_BOOT_WHALE_STARTED__ = true

  // The 5.7-second source atlas has ink only in frames 8 through 111, inclusive.
  const atlas = { width: 384, height: 216, columns: 12, frames: 137, firstVisible: 8, lastVisible: 111 }
  const frameDuration = 5700 / atlas.frames
  const duration = (atlas.lastVisible - atlas.firstVisible + 1) * frameDuration
  const crossfadeDuration = 300
  const crossfadeAt = duration - crossfadeDuration
  const breathDuration = 1600

  const overlay = document.createElement('div')
  overlay.className = 'dsbw-boot'
  overlay.dataset.phase = 'opening'
  overlay.dataset.dshBootWhale = ''
  overlay.style.setProperty('--dsbw-crossfade-duration', `${crossfadeDuration}ms`)
  overlay.style.setProperty('--dsbw-breath-duration', `${breathDuration}ms`)

  const canvas = document.createElement('canvas')
  canvas.className = 'dsbw-whale'
  canvas.setAttribute('aria-hidden', 'true')
  const brand = document.createElement('div')
  brand.className = 'dsbw-brand'
  brand.setAttribute('role', 'status')
  brand.append(logoTemplate.content)
  logoTemplate.remove()
  overlay.append(canvas, brand)
  document.body.append(overlay)

  const image = new Image()
  const context = canvas.getContext('2d')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const asset = '/dsh-boot-whale/boot-whale-atlas-962a22048588.webp'
  let appReady = false
  let shown = false
  let disposed = false
  let startedAt
  let lastPainted = -1
  let frame = 0
  let imageTimeout = 0
  let playbackTimeout = 0
  let brandTimeout = 0
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
    clearTimeout(brandTimeout)
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

  function leaveWhenReady() {
    if (disposed || !appReady || overlay.dataset.phase !== 'brand' || brandTimeout !== 0) return
    overlay.dataset.phase = 'leaving'
    exitTimeout = window.setTimeout(remove, motion.matches ? 0 : 420)
  }

  function playingWhale() {
    return !disposed && (overlay.dataset.phase === 'opening' || overlay.dataset.phase === 'crossfade')
  }

  function finish() {
    if (!playingWhale()) return
    cancelAnimationFrame(frame)
    clearTimeout(imageTimeout)
    clearTimeout(playbackTimeout)
    overlay.dataset.phase = 'brand'
    brandTimeout = window.setTimeout(() => {
      brandTimeout = 0
      leaveWhenReady()
    }, breathDuration)
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
      leaveWhenReady()
    }
  }

  function resize() {
    if (!playingWhale() || context === null) return
    width = canvas.clientWidth
    height = canvas.clientHeight
    if (width === 0 || height === 0) return
    const density = Math.min(devicePixelRatio, 2, Math.max(1, 840 / width))
    canvas.width = Math.round(width * density)
    canvas.height = Math.round(height * density)
    context.setTransform(density, 0, 0, density, 0, 0)
    context.imageSmoothingEnabled = false
    lastPainted = -1
  }

  function paint(index) {
    if (width === 0 || height === 0 || index === lastPainted) return
    lastPainted = index
    const x = (index % atlas.columns) * atlas.width
    const y = Math.floor(index / atlas.columns) * atlas.height
    const scale = Math.min(width / atlas.width, height / atlas.height)
    const left = (width - atlas.width * scale) / 2
    const top = (height - atlas.height * scale) / 2
    context.clearRect(0, 0, width, height)
    context.drawImage(image, x, y, atlas.width, atlas.height,
      left, top, atlas.width * scale, atlas.height * scale)
    context.globalCompositeOperation = 'source-in'
    context.fillStyle = getComputedStyle(canvas).color
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = 'source-over'
  }

  function tick(now) {
    if (!playingWhale()) return
    if (document.hidden || motion.matches) { finish(); return }
    if (width === 0 || height === 0) resize()
    startedAt ??= now
    if (overlay.dataset.phase === 'opening' && now - startedAt >= crossfadeAt) {
      // Give the dissolve its full duration even if the renderer missed its first frame.
      startedAt = now - crossfadeAt
      overlay.dataset.phase = 'crossfade'
    }
    const elapsed = now - startedAt
    if (elapsed >= duration) { finish(); return }
    paint(atlas.firstVisible + Math.floor(elapsed / frameDuration))
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
      if (disposed || overlay.dataset.phase !== 'opening') return
      clearTimeout(imageTimeout)
      if (image.naturalWidth !== atlas.width * atlas.columns
        || image.naturalHeight !== atlas.height * Math.ceil(atlas.frames / atlas.columns)) {
        finish()
        return
      }
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
