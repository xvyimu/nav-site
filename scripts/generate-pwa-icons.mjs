/**
 * Regenerate PWA icons from a solid brand color (no image deps).
 * Dual-B Claude absorb · wave7 — reproducibility for public/icon-192|512.png.
 *
 * Usage:
 *   node scripts/generate-pwa-icons.mjs
 *   pnpm run icons:pwa
 *
 * Does not touch production CSP/env. Overwrites public/icon-192.png and icon-512.png.
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')

// Brand-ish blue matching theme_color in app/manifest.ts (#5b8def)
const R = 0x5b
const G = 0x8d
const B = 0xef

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** Solid RGBA PNG (no filter complexity beyond None). */
function solidPng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = 1 + size * 4
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    const row = y * stride
    raw[row] = 0 // filter None
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4
      // soft rounded-square look: margin transparent
      const m = Math.floor(size * 0.08)
      const inBox = x >= m && x < size - m && y >= m && y < size - m
      if (inBox) {
        raw[i] = R
        raw[i + 1] = G
        raw[i + 2] = B
        raw[i + 3] = 255
      } else {
        raw[i] = 0
        raw[i + 1] = 0
        raw[i + 2] = 0
        raw[i + 3] = 0
      }
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function writeIcon(size, name) {
  const out = path.join(publicDir, name)
  fs.writeFileSync(out, solidPng(size))
  console.log(`wrote ${path.relative(root, out)} (${size}x${size})`)
}

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
writeIcon(192, 'icon-192.png')
writeIcon(512, 'icon-512.png')
console.log('OK generate-pwa-icons')
