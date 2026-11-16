import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { apply } from '../index.js'

test('embeds the static wordmark and serves a content-addressed opacity atlas before client boot', () => {
  let collect
  let route
  const dispose = () => {}
  apply({
    on(event, listener) {
      assert.equal(event, 'webserver/index-inject')
      collect = listener
    },
    inject(services, callback) {
      assert.deepEqual(services, ['webServer'])
      callback({ effect: register => {
        assert.equal(register(), dispose)
      }, webServer: { register(row) { route = row; return dispose } } })
    },
  })

  const table = []
  collect(table)
  assert.deepEqual(table.map(row => row.kind), ['style', 'global', 'script'])
  const [style, artwork, runtime] = table
  const still = readFileSync(new URL('../assets/pixel-wordmark.png', import.meta.url))
  assert.ok(style.text.includes('data:image/png;base64,' + still.toString('base64')))
  const geometry = JSON.parse(readFileSync(new URL('../assets/pixel-rise.json', import.meta.url), 'utf8'))
  assert.equal(artwork.name, '__DSH_BOOT_WHALE_ARTWORK__')
  assert.deepEqual(artwork.value, { ...geometry, url: route.path })
  assert.equal(runtime.placement, 'body')
  assert.match(runtime.text, /data-dsh-boot-failed/)
  assert.equal(route.kind, 'exact')

  function request(method) {
    let status
    let headers
    let body
    route.handler({ method }, {
      writeHead(code, values) { status = code; headers = values },
      end(value) { body = value },
    })
    return { status, headers, body }
  }

  const get = request('GET')
  assert.equal(get.status, 200)
  assert.equal(get.headers['Content-Type'], 'image/webp')
  assert.equal(get.body.length, get.headers['Content-Length'])
  const hash = createHash('sha256').update(get.body).digest('hex').slice(0, 12)
  assert.equal(route.path, '/dsh-boot-whale/pixel-rise-' + hash + '.webp')
  assert.equal(request('HEAD').body, undefined)
  assert.equal(request('POST').status, 405)
})
