/**
 * Minimal Chrome DevTools Protocol client. Node 24 ships `fetch` and a
 * `WebSocket` client, so driving a headless browser needs no dependencies.
 */
import { writeFileSync } from 'node:fs'

const PORT = process.env.CDP_PORT ?? '9222'

export async function openPage(url) {
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  ).json()

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let nextId = 1
  const pending = new Map()
  /** Browser-side errors — CSP violations land here, which is the point. */
  const errors = []

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== undefined) {
      const resolve = pending.get(msg.id)
      if (resolve) {
        pending.delete(msg.id)
        resolve(msg)
      }
      return
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(`${msg.params.entry.source}: ${msg.params.entry.text}`)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      errors.push(`exception: ${d.exception?.description ?? d.text}`)
    }
  })
  await new Promise((resolve) => ws.addEventListener('open', resolve))

  function send(method, params = {}) {
    const id = nextId++
    ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve) => pending.set(id, resolve))
  }

  const page = {
    errors,
    async evaluate(expression) {
      const msg = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (msg.result?.exceptionDetails) {
        throw new Error(msg.result.exceptionDetails.exception?.description ?? 'evaluate failed')
      }
      return msg.result?.result?.value
    },
    text: () => page.evaluate('document.body.innerText'),
    async goto(next) {
      await send('Page.navigate', { url: next })
      await wait(1200)
    },
    async reload() {
      await send('Page.reload', {})
      await wait(1500)
    },
    async screenshot(path) {
      const msg = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(path, Buffer.from(msg.result.data, 'base64'))
    },
    /** Wipes IndexedDB, localStorage and caches for an origin — a fresh device. */
    async clearStorage(origin) {
      await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' })
    },
    /** Resizes the viewport; a scale factor above 1 is useful for eyeballing detail. */
    async setViewport(width, height, deviceScaleFactor = 1) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor,
        mobile: false,
      })
    },
    /** Clicks the first element matching a CSS selector. */
    async click(selector) {
      const ok = await page.evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`,
      )
      if (!ok) throw new Error(`no element matched ${selector}`)
    },
    /** Clicks the first <button> whose trimmed text equals `label`. */
    async clickText(label) {
      const ok = await page.evaluate(`(() => {
        const el = [...document.querySelectorAll('button')].find(
          (b) => b.textContent.trim().startsWith(${JSON.stringify(label)}),
        )
        if (!el) return false
        el.click()
        return true
      })()`)
      if (!ok) throw new Error(`no button labelled ${label}`)
    },
    /** Sends real files to a hidden <input type="file">, change event included. */
    async setFileInput(selector, files) {
      const doc = await send('DOM.getDocument', { depth: -1 })
      const found = await send('DOM.querySelector', {
        nodeId: doc.result.root.nodeId,
        selector,
      })
      if (!found.result?.nodeId) throw new Error(`no file input matched ${selector}`)
      await send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files })
    },
    /** Where the browser should drop downloaded files. */
    async setDownloadPath(path) {
      await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path })
    },
    /** Pulls the network out from under the page, to prove the PWA copes. */
    async setOffline(offline) {
      await send('Network.enable')
      await send('Network.emulateNetworkConditions', {
        offline,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
    },
    async close() {
      await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`)
      ws.close()
    },
  }

  await send('Page.enable')
  await send('Log.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  return page
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
