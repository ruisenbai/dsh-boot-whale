/* The opening is injected before the client framework is available. */
(() => {
  const art = globalThis.__DSH_BOOT_WHALE_ARTWORK__
  const logo = document.getElementById('dsbw-logo-template')
  if (!art || !document.body || !logo || globalThis.__DSH_BOOT_WHALE_STARTED__) return
  globalThis.__DSH_BOOT_WHALE_STARTED__ = true

  const overlay = document.createElement('div')
  overlay.className = 'dsbw-boot'
  overlay.dataset.dshBootWhale = ''
  overlay.dataset.phase = 'opening'
  const stage = document.createElement('div')
  stage.className = 'dsbw-stage'
  stage.setAttribute('role', 'img')
  stage.setAttribute('aria-label', 'DeepSeek Harness')
  const still = document.createElement('div')
  still.className = 'dsbw-still'
  still.setAttribute('aria-hidden', 'true')
  still.append(logo.content.cloneNode(true))

  function film() {
    const video = document.createElement('video')
    video.className = 'dsbw-film'
    video.muted = video.defaultMuted = video.playsInline = true
    video.preload = 'auto'
    video.setAttribute('aria-hidden', 'true')
    return video
  }

  const opening = film()
  const ripples = film()
  ripples.loop = true
  ripples.dataset.ripples = ''
  stage.append(opening, ripples, still)
  overlay.append(stage)
  document.body.append(overlay)

  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let shown = false
  let appReady = false
  let canLeave = false
  let disposed = false
  let guard = 0
  let hold = 0
  let exit = 0
  let stopWatchingWindow
  const observer = new MutationObserver(checkHost)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dsh-boot-failed'] })
  document.addEventListener('visibilitychange', onVisibility)
  motion.addEventListener('change', onMotion)
  window.addEventListener('pagehide', remove)
  opening.addEventListener('timeupdate', syncOpening)
  opening.addEventListener('ended', startRipples)
  opening.addEventListener('error', showStill)
  ripples.addEventListener('playing', revealRipples)
  ripples.addEventListener('error', onRipplesError)

  function release(video) {
    if (!video.hasAttribute('src')) return
    video.pause()
    video.removeAttribute('src')
    video.load()
  }

  function remove() {
    if (disposed) return
    disposed = true
    clearTimeout(guard)
    clearTimeout(hold)
    clearTimeout(exit)
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    motion.removeEventListener('change', onMotion)
    window.removeEventListener('pagehide', remove)
    opening.removeEventListener('timeupdate', syncOpening)
    opening.removeEventListener('ended', startRipples)
    opening.removeEventListener('error', showStill)
    ripples.removeEventListener('playing', revealRipples)
    ripples.removeEventListener('error', onRipplesError)
    stopWatchingWindow?.()
    release(opening)
    release(ripples)
    overlay.remove()
  }

  function leaveWhenReady() {
    if (disposed || !appReady || !canLeave || overlay.dataset.phase === 'leaving') return
    overlay.dataset.phase = 'leaving'
    clearTimeout(guard)
    exit = window.setTimeout(remove, motion.matches || document.hidden ? 0 : 400)
  }

  function showStill() {
    if (disposed || overlay.dataset.still !== undefined || overlay.dataset.phase === 'leaving') return
    overlay.dataset.still = ''
    overlay.dataset.phase = 'brand'
    clearTimeout(guard)
    release(opening)
    release(ripples)
    if (canLeave) leaveWhenReady()
    else hold = window.setTimeout(() => {
      canLeave = true
      leaveWhenReady()
    }, document.hidden ? 0 : Math.round((art.exitAt - art.settledAt) * 1000))
  }

  function checkHost() {
    const root = document.getElementById('root')
    if (disposed || !root) return
    if (root.querySelector(':scope > [data-dsh-boot]')?.hasAttribute('data-dsh-boot-failed')) {
      remove()
    } else if (!appReady && [...root.children].some(child => !child.hasAttribute('data-dsh-boot'))) {
      appReady = true
      syncOpening()
      leaveWhenReady()
    }
  }

  function onVisibility() {
    if (shown && document.hidden) showStill()
  }

  function onMotion() {
    if (shown && motion.matches) showStill()
  }

  // Video keeps its own presentation clock while startup JavaScript occupies the UI thread.
  function syncOpening() {
    if (disposed || overlay.dataset.still !== undefined || overlay.dataset.phase === 'leaving') return
    if (opening.currentTime >= art.settledAt && overlay.dataset.phase === 'opening') overlay.dataset.phase = 'brand'
    if (opening.currentTime < art.exitAt) return
    canLeave = true
    if (!appReady && !ripples.hasAttribute('src')) ripples.src = art.ripples
    leaveWhenReady()
  }

  function play(video) {
    clearTimeout(guard)
    function watch() {
      const at = video.currentTime
      guard = window.setTimeout(() => {
        if (video.currentTime === at) showStill()
        else watch()
      }, 8000)
    }
    watch()
    video.play().catch(showStill)
  }

  function startRipples() {
    syncOpening()
    if (disposed || overlay.dataset.still !== undefined || overlay.dataset.phase === 'leaving') return
    if (ripples.error) showStill()
    else play(ripples)
  }

  function revealRipples() {
    if (!disposed && overlay.dataset.still === undefined) stage.dataset.looping = ''
  }

  function onRipplesError() {
    if (opening.ended) showStill()
  }

  function start() {
    if (disposed || shown) return
    shown = true
    if (motion.matches || document.hidden) { showStill(); return }
    opening.src = art.opening
    play(opening)
  }

  checkHost()
  if (disposed) return
  const desktop = globalThis.dshDesktopBoot
  if (typeof desktop?.onWindowShown === 'function') stopWatchingWindow = desktop.onWindowShown(start)
  else start()
})()
