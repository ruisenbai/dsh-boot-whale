/** Host plugin: insert the opening before client modules load and serve its frame atlas. */
import { readFileSync } from 'node:fs'

export const name = 'boot-whale'
export const inject = []

const route = '/dsh-boot-whale/boot-whale-atlas-962a22048588.webp'
const css = readFileSync(new URL('./runtime/boot.css', import.meta.url), 'utf8')
const script = readFileSync(new URL('./runtime/boot.js', import.meta.url), 'utf8')
const atlas = readFileSync(new URL('./assets/boot-whale-atlas-962a22048588.webp', import.meta.url))

if (/<\/style/iu.test(css) || /<\/script/iu.test(script)) {
  throw new Error('dsh-boot-whale: runtime cannot be inserted into index.html')
}

/** Register one index injection and the image route for this plugin. */
export function apply(ctx) {
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'style', text: css })
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
