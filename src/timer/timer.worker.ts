/**
 * Ticker for the timer UI.
 *
 * Browsers clamp `setInterval` in hidden tabs to roughly once a minute, but
 * workers are throttled far less aggressively. Nothing here decides *when* a
 * phase ends — the main thread derives that from timestamps. This
 * worker only says "look again now".
 */

type InMessage = { type: 'start'; intervalMs: number } | { type: 'stop' }

let handle: ReturnType<typeof setInterval> | undefined

self.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data
  if (handle !== undefined) {
    clearInterval(handle)
    handle = undefined
  }
  if (msg.type === 'start') {
    handle = setInterval(() => {
      ;(self as unknown as Worker).postMessage({ type: 'tick', now: Date.now() })
    }, msg.intervalMs)
  }
}
