/**
 * Local OCR for images. The engine, WASM core and English model are served from
 * /ocr (copied from node_modules by scripts/copy-ocr-assets.mjs): nothing is
 * fetched from a CDN and the image never leaves the device.
 */

export class OcrUnavailable extends Error {}

const BASE = `${import.meta.env.BASE_URL}ocr/`.replace(/\/{2,}/g, '/')

async function assetsPresent(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}eng.traineddata.gz`, { method: 'HEAD' })
    // A single-page-app server answers unknown paths with index.html; that is not the model.
    return r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')
  } catch {
    return false
  }
}

export async function recognizeImage(file: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  if (!(await assetsPresent())) throw new OcrUnavailable('OCR files are not installed. Run "npm run ocr:assets" in the frontend folder.')
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: BASE,
    langPath: BASE,
    gzip: true,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(file)
    return data.text.trim()
  } finally {
    await worker.terminate()
  }
}
