// Copies the OCR engine, WASM cores and English model out of node_modules into public/ocr,
// so image text is read entirely on this device (no CDN, no network at run time).
// Run automatically before `npm run dev` and `npm run build`.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'ocr')
const nm = join(root, 'node_modules')

const files = [
  [join(nm, 'tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js'],
  [join(nm, 'tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(nm, 'tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
]

if (!files.every(([src]) => existsSync(src))) {
  console.warn('[ocr] tesseract.js packages not installed; image OCR will be unavailable')
  process.exit(0)
}
mkdirSync(out, { recursive: true })
for (const [src, name] of files) cpSync(src, join(out, name))
console.log(`[ocr] copied ${files.length} files to public/ocr`)
