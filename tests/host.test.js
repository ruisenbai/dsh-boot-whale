import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../index.js'
import { wordmarkSweep } from '../runtime/sweep.js'

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

test('the early document receives the original SVG and a reveal for each frame of the light', () => {
  const { routes, rows } = install()
  assert.deepEqual(rows.map(row => row.kind), ['style', 'global', 'html', 'script'])
  const [style, art, template, script] = rows
  const scene = JSON.parse(readFileSync(new URL('../assets/pixel-rise.json', import.meta.url)))
  const { fps, restoreStart, settledFrame, exitFrame } = scene
  assert.equal(art.name, '__DSH_BOOT_WHALE_ARTWORK__')
  assert.deepEqual(art.value, { opening: routes[0].path, ripples: routes[1].path,
    settledAt: settledFrame / fps, exitAt: exitFrame / fps,
    sweep: { startAt: restoreStart / fps, fps, positions: wordmarkSweep(scene).positions } })
  assert.equal(art.value.sweep.positions.length, settledFrame - restoreStart + 1)
  const logo = readFileSync(new URL('../assets/harness-logo.svg', import.meta.url), 'utf8')
  assert.equal(template.html, '<template id="dsbw-logo-template">' + logo + '</template>')
  assert.equal(template.placement, 'body')
  assert.match(style.text, /left: 20\.3125%;/)
  assert.match(style.text, /width: 60\.9375%;/)
  assert.equal(script.placement, 'body')
  assert.match(script.text, /data-dsh-boot-failed/)
})

test('in Chromium the original SVG covers only the swept side halfway through the opening', {
  skip: spawnSync('chromium', ['--version']).status !== 0,
}, t => {
  const dir = mkdtempSync(join(tmpdir(), 'dsbw-browser-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const { rows: [style, art, template, script] } = install()
  const file = join(dir, 'opening.html')
  writeFileSync(file, `<!doctype html><style>${style.text}
    .dsbw-stage { pointer-events: auto; }</style><body><div id="root"><div data-dsh-boot></div></div>
    ${template.html}<script>
    globalThis.__DSH_BOOT_WHALE_ARTWORK__ = ${JSON.stringify(art.value)}
    HTMLMediaElement.prototype.play = () => Promise.resolve()
    </script><script>${script.text}</script><script>
    const video = document.querySelector('video'), still = document.querySelector('.dsbw-still')
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true })
    function sides(time) {
      video.currentTime = time
      video.dispatchEvent(new Event('timeupdate'))
      const rect = still.getBoundingClientRect()
      return [0.25, 0.75].map(x => Number(still.firstElementChild.contains(
        document.elementFromPoint(rect.left + x * rect.width, rect.top + rect.height / 2)))).join('')
    }
    const art = globalThis.__DSH_BOOT_WHALE_ARTWORK__
    document.documentElement.dataset.reveal = [sides(art.sweep.startAt),
      sides((art.sweep.startAt + art.settledAt) / 2), sides(art.settledAt)].join(' ')
    </script></body>`)
  const html = execFileSync('chromium', ['--headless', '--disable-background-networking', '--no-first-run',
    '--user-data-dir=' + join(dir, 'profile'), '--dump-dom', file], { encoding: 'utf8', timeout: 15000 })
  assert.match(html, /<html data-reveal="00 10 11">/)
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
