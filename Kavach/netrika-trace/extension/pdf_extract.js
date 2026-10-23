// PDF text extraction via Mozilla pdf.js (isolated world — no page hooks)
let _pdfjsPromise = null;

async function getPdfJs() {
    if (!_pdfjsPromise) {
        _pdfjsPromise = import(chrome.runtime.getURL('lib/pdf.min.mjs')).then(lib => {
            lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
            return lib;
        }).catch(err => {
            console.error('[Netrika DLP] pdf.js load failed:', err);
            _pdfjsPromise = null;
            throw err;
        });
    }
    return _pdfjsPromise;
}

async function extractPdfTextFromBuffer(buffer) {
    if (!buffer || !buffer.byteLength) return '';
    try {
        const pdfjs = await getPdfJs();
        const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const doc = await pdfjs.getDocument({
            data,
            disableFontFace: true,
            useSystemFonts: true,
        }).promise;

        const parts = [];
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
            const page = await doc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map(item => (item && item.str) ? item.str : '')
                .join(' ');
            if (pageText.trim()) parts.push(pageText);
        }
        return parts.join('\n').trim();
    } catch (err) {
        console.warn('[Netrika DLP] pdf.js extraction failed:', err.message || err);
        return '';
    }
}
