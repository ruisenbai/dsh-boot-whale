import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../index.js'

test('injects the opening before client boot and serves the atlas', () => {
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
  assert.deepEqual(table.map(row => row.kind), ['style', 'script'])
  assert.equal(table[1].placement, 'body')
  assert.match(table[1].text, /data-dsh-boot-failed/)
  assert.equal(route.kind, 'exact')
  assert.match(route.path, /^\/dsh-boot-whale\/boot-whale-atlas-[0-9a-f]+\.webp$/)

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
  assert.equal(request('HEAD').body, undefined)
  assert.equal(request('POST').status, 405)
})
