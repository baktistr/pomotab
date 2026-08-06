/**
 * Dev-only helper: drives headless Chrome over the DevTools protocol to grab a
 * screenshot and the rendered text of a URL. Node 24 has both `fetch` and a
 * `WebSocket` client built in, so this needs no dependencies.
 *
 *   node scripts/shoot.mjs <url> <out.png> [waitMs]
 */
import { writeFileSync } from 'node:fs'

const [url, out, waitMs = '2500'] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: node scripts/shoot.mjs <url> <out.png> [waitMs]')
  process.exit(2)
}

const PORT = process.env.CDP_PORT ?? '9222'

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, {
  method: 'PUT',
})).json()

const ws = new WebSocket(target.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  const resolve = pending.get(msg.id)
  if (resolve) {
    pending.delete(msg.id)
    resolve(msg.result)
  }
})

function send(method, params = {}) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve) => pending.set(id, resolve))
}

await new Promise((resolve) => ws.addEventListener('open', resolve))
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await new Promise((r) => setTimeout(r, Number(waitMs)))

const text = await send('Runtime.evaluate', {
  expression: 'document.body.innerText',
  returnByValue: true,
})
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))

console.log('--- rendered text ---')
console.log(text.result?.value ?? '(empty)')
console.log(`--- screenshot: ${out}`)

await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`)
ws.close()
process.exit(0)
