/** Host plugin: insert the opening before client modules load and serve its frame atlas. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const name = 'boot-whale'
export const inject = []

const atlas = readFileSync(new URL('./assets/pixel-rise.webp', import.meta.url))
const fingerprint = createHash('sha256').update(atlas).digest('hex').slice(0, 12)
const route = `/dsh-boot-whale/pixel-rise-${fingerprint}.webp`
const geometry = JSON.parse(readFileSync(new URL('./assets/pixel-rise.json', import.meta.url), 'utf8'))
const still = readFileSync(new URL('./assets/pixel-wordmark.png', import.meta.url)).toString('base64')
const stylesheet = readFileSync(new URL('./runtime/boot.css', import.meta.url), 'utf8')
const css = `${stylesheet}\n.dsbw-still { mask-image: url("data:image/png;base64,${still}"); }`
const script = readFileSync(new URL('./runtime/boot.js', import.meta.url), 'utf8')

if (/<\/style/iu.test(css) || /<\/script/iu.test(script)) {
  throw new Error('dsh-boot-whale: runtime cannot be inserted into index.html')
}

/** Register one index injection and the image route for this plugin. */
export function apply(ctx) {
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'style', text: css })
    table.push({ kind: 'global', name: '__DSH_BOOT_WHALE_ARTWORK__', value: { ...geometry, url: route } })
    table.push({ kind: 'script', placement: 'body', text: script })
  })

  ctx.inject(['webServer'], child => {
    child.effect(() => child.webServer.register({
      kind: 'exact',
      path: route,
      handler(req, res) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' })
          res.end()
          return
        }
        res.writeHead(200, {
          'Content-Type': 'image/webp',
          'Content-Length': atlas.length,
          'Cache-Control': 'public, max-age=31536000, immutable',
        })
        res.end(req.method === 'HEAD' ? undefined : atlas)
      },
    }))
  })
}
