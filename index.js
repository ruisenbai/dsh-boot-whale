/** Insert the opening before client boot and serve seekable, immutable films. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { wordmarkSweep } from './runtime/sweep.js'

export const name = 'boot-whale'
export const inject = []

function film(name) {
  const bytes = readFileSync(new URL('./assets/' + name + '.webm', import.meta.url))
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const path = '/dsh-boot-whale/' + name + '-' + hash + '.webm'
  return { kind: 'exact', path, handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      return res.end()
    }
    const headers = { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable' }
    const range = req.method === 'GET' && /^bytes=(\d*)-(\d*)$/i.exec(req.headers.range ?? '')
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(bytes.length - 1, Number(range[2])) : bytes.length - 1
      if (start > end) {
        res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + bytes.length, 'Content-Length': 0 })
        return res.end()
      }
      res.writeHead(206, { ...headers, 'Content-Range': 'bytes ' + start + '-' + end + '/' + bytes.length,
        'Content-Length': end - start + 1 })
      return res.end(bytes.subarray(start, end + 1))
    }
    res.writeHead(200, { ...headers, 'Content-Length': bytes.length })
    res.end(req.method === 'GET' ? bytes : undefined)
  } }
}

const opening = film('pixel-opening')
const ripples = film('pixel-ripples')
const scene = JSON.parse(readFileSync(new URL('./assets/pixel-rise.json', import.meta.url)))
const { fps, restoreStart, settledFrame, exitFrame, wordmark, width, height } = scene
const { positions, tilt } = wordmarkSweep(scene)
const artwork = { opening: opening.path, ripples: ripples.path, settledAt: settledFrame / fps, exitAt: exitFrame / fps,
  sweep: { startAt: restoreStart / fps, fps, positions } }
const logo = readFileSync(new URL('./assets/harness-logo.svg', import.meta.url), 'utf8')
const stylesheet = readFileSync(new URL('./runtime/boot.css', import.meta.url), 'utf8')
const css = stylesheet + '\n.dsbw-still { left: ' + (100 * wordmark.x / width) + '%; top: ' + (100 * wordmark.y / height) +
  '%; width: ' + (100 * wordmark.width / width) + '%; height: ' + (100 * wordmark.height / height) +
  '%; --dsbw-sweep-tilt: ' + tilt + '%; }'
const script = readFileSync(new URL('./runtime/boot.js', import.meta.url), 'utf8')

if (/<\/style/iu.test(css) || /<\/script/iu.test(script)) {
  throw new Error('dsh-boot-whale: runtime cannot be inserted into index.html')
}

/** Register the document injection and both media routes for this plugin's lifetime. */
export function apply(ctx) {
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'style', text: css })
    table.push({ kind: 'global', name: '__DSH_BOOT_WHALE_ARTWORK__', value: artwork })
    table.push({ kind: 'html', placement: 'body', html: '<template id="dsbw-logo-template">' + logo + '</template>' })
    table.push({ kind: 'script', placement: 'body', text: script })
  })
  ctx.inject(['webServer'], child => {
    for (const route of [opening, ripples]) child.effect(() => child.webServer.register(route))
  })
}
