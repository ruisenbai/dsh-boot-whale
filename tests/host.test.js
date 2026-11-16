import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { apply } from '../index.js'

function install() {
  let collect
  const routes = []
  const dispose = () => {}
  apply({
    on(event, listener) { assert.equal(event, 'webserver/index-inject'); collect = listener },
    inject(services, callback) {
      assert.deepEqual(services, ['webServer'])
      callback({ effect: register => assert.equal(register(), dispose),
        webServer: { register(route) { routes.push(route); return dispose } } })
    },
  })
  const rows = []
  collect(rows)
  return { routes, rows }
}

test('the early document receives media URLs, timing and an embedded static wordmark', () => {
  const { routes, rows } = install()
  assert.deepEqual(rows.map(row => row.kind), ['style', 'global', 'script'])
  const [style, art, script] = rows
  const { fps, settledFrame, exitFrame } = JSON.parse(readFileSync(new URL('../assets/pixel-rise.json', import.meta.url)))
  assert.equal(art.name, '__DSH_BOOT_WHALE_ARTWORK__')
  assert.deepEqual(art.value, { opening: routes[0].path, ripples: routes[1].path,
    settledAt: settledFrame / fps, exitAt: exitFrame / fps })
  const still = readFileSync(new URL('../assets/pixel-wordmark.png', import.meta.url))
  assert.ok(style.text.includes('data:image/png;base64,' + still.toString('base64')))
  assert.equal(script.placement, 'body')
  assert.match(script.text, /data-dsh-boot-failed/)
})

test('both fingerprinted films support full reads, seeking and suffix byte ranges', () => {
  const { routes } = install()
  for (const [i, name] of ['pixel-opening', 'pixel-ripples'].entries()) {
    const bytes = readFileSync(new URL('../assets/' + name + '.webm', import.meta.url))
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
    const route = routes[i]
    assert.equal(route.kind, 'exact')
    assert.equal(route.path, '/dsh-boot-whale/' + name + '-' + hash + '.webm')
    function request(method, range) {
      const reply = {}
      route.handler({ method, headers: { range } }, {
        writeHead(status, headers) { Object.assign(reply, { status, headers }) },
        end(body) { reply.body = body },
      })
      return reply
    }
    const full = request('GET')
    assert.equal(full.status, 200)
    assert.equal(full.headers['Content-Type'], 'video/webm')
    assert.equal(full.headers['Content-Length'], bytes.length)
    assert.equal(full.headers['Accept-Ranges'], 'bytes')
    assert.match(full.headers['Cache-Control'], /immutable/)
    assert.ok(full.body.equals(bytes))
    for (const [range, start, end] of [
      ['bytes=0-99', 0, 99], ['bytes=125-', 125, bytes.length - 1],
      ['bytes=-20', bytes.length - 20, bytes.length - 1], ['bytes=10-999999999', 10, bytes.length - 1],
    ]) {
      const part = request('GET', range)
      assert.equal(part.status, 206)
      assert.equal(part.headers['Content-Range'], 'bytes ' + start + '-' + end + '/' + bytes.length)
      assert.equal(part.headers['Content-Length'], end - start + 1)
      assert.ok(part.body.equals(bytes.subarray(start, end + 1)))
    }
    for (const range of ['bytes=' + bytes.length + '-', 'bytes=-0', 'bytes=14-5']) {
      const bad = request('GET', range)
      assert.equal(bad.status, 416)
      assert.equal(bad.headers['Content-Range'], 'bytes */' + bytes.length)
      assert.equal(bad.body, undefined)
    }
    for (const ignored of ['items=0-20', 'bytes=-', 'bytes=0-10,20-30']) assert.equal(request('GET', ignored).status, 200)
    const head = request('HEAD', 'bytes=0-99')
    assert.equal(head.status, 200)
    assert.equal(head.headers['Content-Length'], bytes.length)
    assert.equal(head.body, undefined)
    assert.equal(request('POST').status, 405)
  }
})
