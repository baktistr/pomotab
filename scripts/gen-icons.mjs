// Generates the PWA/favicon PNGs from a tiny hand-rolled rasteriser so the repo
// needs no image tooling at build time. Run with `node scripts/gen-icons.mjs`
// after changing the mark; the output PNGs are committed.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [24, 24, 27] // zinc-900
const ACCENT = [244, 63, 94] // rose-500
const TRACK = [63, 63, 70] // zinc-700

const SS = 4 // supersampling factor

/** Signed distance helpers, all in supersampled pixel space. */
function roundedRectAlpha(x, y, size, radius) {
  const cx = Math.abs(x - size / 2) - (size / 2 - radius)
  const cy = Math.abs(y - size / 2) - (size / 2 - radius)
  const dx = Math.max(cx, 0)
  const dy = Math.max(cy, 0)
  const d = Math.min(Math.max(cx, cy), 0) + Math.hypot(dx, dy) - radius
  return d <= 0 ? 1 : 0
}

function ringAlpha(x, y, cx, cy, r, width, fromDeg, toDeg) {
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)
  if (Math.abs(dist - r) > width / 2) return 0
  if (fromDeg === undefined) return 1
  // 0° at 12 o'clock, sweeping clockwise.
  let a = (Math.atan2(dx, -dy) * 180) / Math.PI
  if (a < 0) a += 360
  return a >= fromDeg && a <= toDeg ? 1 : 0
}

function discAlpha(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) <= r ? 1 : 0
}

function render(size, { maskable = false } = {}) {
  const S = size * SS
  const px = new Uint8Array(size * size * 4)
  const c = S / 2
  // A maskable icon must survive a circular crop, so the mark shrinks and the
  // background bleeds to the edges.
  const scale = maskable ? 0.72 : 1
  const radius = maskable ? S : S * 0.22
  const ringR = S * 0.3 * scale
  const ringW = S * 0.1 * scale

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px_ = x * SS + sx + 0.5
          const py_ = y * SS + sy + 0.5
          const bg = roundedRectAlpha(px_, py_, S, radius)
          if (!bg) continue
          let col = BG
          if (ringAlpha(px_, py_, c, c, ringR, ringW)) col = TRACK
          if (ringAlpha(px_, py_, c, c, ringR, ringW, 0, 260)) col = ACCENT
          if (discAlpha(px_, py_, c, c, S * 0.075 * scale)) col = ACCENT
          r += col[0]
          g += col[1]
          b += col[2]
          a += 255
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      px[i] = Math.round(r / n)
      px[i + 1] = Math.round(g / n)
      px[i + 2] = Math.round(b / n)
      px[i + 3] = Math.round(a / n)
    }
  }
  return px
}

/* ---- minimal PNG encoder ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
const targets = [
  ['pwa-192x192.png', 192, {}],
  ['pwa-512x512.png', 512, {}],
  ['pwa-maskable-512x512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
  ['favicon-32x32.png', 32, {}],
]
for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT, name), png(size, render(size, opts)))
  console.log('wrote', name)
}
