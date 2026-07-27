/**
 * Renders public/icon.svg to the PNG sizes the manifest and iOS need.
 *
 * The PNGs are committed rather than generated at build time: they change
 * about never, and this keeps sharp — a large native dependency — off the
 * build path and out of CI. Run `npm run icons` after editing icon.svg.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'public', 'icon.svg')
const outputDir = join(root, 'public', 'icons')

/**
 * There is no separate maskable file: icon.svg is drawn full-bleed with its
 * content inside the middle 60%, so icon-512 is declared for both `any` and
 * `maskable` in the manifest rather than shipping the same bytes twice.
 *
 * `apple-touch-icon` is the odd one out: iOS ignores the manifest and reads
 * this tag instead, and it composites onto white if the PNG has alpha — hence
 * the opaque background in icon.svg rather than a transparent one.
 */
const TARGETS = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

const svg = await readFile(source)
await mkdir(outputDir, { recursive: true })

for (const { name, size } of TARGETS) {
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer()

  await writeFile(join(outputDir, name), png)
  console.log(`${name.padEnd(22)} ${size}x${size}  ${png.length} bytes`)
}
