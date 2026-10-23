// Netrika-Trace Content Script v15 — UI + analysis bridge

function isLLMHost(hostname) {
    const h = (hostname || location.hostname || '').toLowerCase();
    return h.includes('chatgpt.com') || h.includes('openai.com') ||
           h.includes('claude.ai') || h.includes('anthropic.com') ||
           h.includes('gemini.google.com') || h.includes('copilot.microsoft.com') ||
           h.includes('perplexity.ai') || h === 'localhost' || h === '127.0.0.1';
}

function findCreditCards(text) {
    const candidates = text.match(/\b(?:\d[ -]?){13,19}\b/g) || []
    return candidates.filter(candidate => {
        const digits = candidate.replace(/\D/g, '')
        if (digits.length < 13 || digits.length > 19) return false
        let sum = 0
        let doubleDigit = false
        for (let index = digits.length - 1; index >= 0; index--) {
            let digit = Number(digits[index])
            if (doubleDigit) {
                digit *= 2
                if (digit > 9) digit -= 9
            }
            sum += digit
            doubleDigit = !doubleDigit
        }
        return sum % 10 === 0
    })
}

if (!isLLMHost()) {
    console.debug('[Netrika DLP] Skipped — not an LLM site:', location.hostname);
} else {

let _scanning = false;
let _scanOverlaySince = 0;
const MIN_OVERLAY_MS = 600;

function isMetadataScan(data) {
    const name = data?.fileName || '';
    const len = (data?.text || '').length;
    return (name === 'upload' || name === 'blob') && len < 2048;
}

function preprocessPdfText(text) {
    if (!text) return '';
    let t = text.replace(/\x00/g, '');
    t = t.replace(/<([0-9A-Fa-f\s]+)>/g, (_, hex) => {
        const clean = hex.replace(/\s/g, '');
        if (clean.length < 4 || clean.length % 2 !== 0) return _;
        let out = '';
        for (let i = 0; i < clean.length; i += 2) {
            const code = parseInt(clean.slice(i, i + 2), 16);
            if (code >= 32 && code <= 126) out += String.fromCharCode(code);
        }
        return out.length >= 2 ? out : _;
    });
    return t;
}

function normalizeTextForPII(text) {
    if (!text) return '';
    return text
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findLooseAadhaar(text) {
    const spaced = text.match(/\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b/g);
    if (spaced?.length) return spaced;
    return text.match(/\b[2-9]\d{11}\b/g) || [];
}

// Only these entity types trigger a block — NOT person/date/org/location/ip/etc.
const BLOCK_POLICY_TYPES = new Set([
    'AADHAAR', 'PAN', 'UPI_ID', 'IFSC',
    'EMAIL_ADDRESS', 'PHONE_NUMBER', 'CREDIT_CARD',
    'AWS_KEY', 'AWS_ACCESS_KEY', 'SENSITIVE_AWS_KEY',
    'PRIVATE_KEY', 'SENSITIVE_PRIVATE_KEY',
    'DATABASE_CRED', 'DATABASE_URL', 'SENSITIVE_DATABASE_CRED',
    'SECRET_KEY', 'SENSITIVE_SECRET_KEY', 'GENERIC_API_KEY', 'API_KEY',
]);

const ENTITY_TYPE_ALIASES = {
    'UPI ID': 'UPI_ID',
    AWS_ACCESS_KEY: 'SENSITIVE_AWS_KEY',
    DATABASE_URL: 'SENSITIVE_DATABASE_CRED',
    PRIVATE_KEY: 'SENSITIVE_PRIVATE_KEY',
    AWS_KEY: 'SENSITIVE_AWS_KEY',
    SECRET_KEY: 'SENSITIVE_SECRET_KEY',
    DATABASE_CRED: 'SENSITIVE_DATABASE_CRED',
    GENERIC_API_KEY: 'SENSITIVE_SECRET_KEY',
    API_KEY: 'SENSITIVE_SECRET_KEY',
    JWT_TOKEN: 'SENSITIVE_SECRET_KEY',
    GITHUB_TOKEN: 'SENSITIVE_SECRET_KEY',
    SLACK_TOKEN: 'SENSITIVE_SECRET_KEY',
    BEARER_TOKEN: 'SENSITIVE_SECRET_KEY',
};

function normalizeEntityType(type) {
    const raw = String(type || '').trim();
    const upper = raw.toUpperCase().replace(/\s+/g, '_');
    return ENTITY_TYPE_ALIASES[raw] || ENTITY_TYPE_ALIASES[upper] || upper;
}

function filterPolicyEntities(entities) {
    const seen = new Set();
    const out = [];
    for (const e of entities || []) {
        const canonical = normalizeEntityType(e.type);
        if (!BLOCK_POLICY_TYPES.has(canonical) && !BLOCK_POLICY_TYPES.has(String(e.type || '').toUpperCase())) continue;
        const key = canonical;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...e, type: canonical });
    }
    return out;
}

function applyBlockPolicy(verdict) {
    const policyEntities = filterPolicyEntities(verdict?.entities_found);
    if (policyEntities.length > 0) {
        const summary = policyEntities
            .map(e => `${e.count || 1}× ${String(e.type).replace(/_/g, ' ')}`)
            .join(', ');
        return {
            ...verdict,
            decision: 'BLOCK',
            risk_score: Math.max(verdict?.risk_score || 0, 85),
            entities_found: policyEntities,
            block_reason: `Sensitive data detected: ${summary}`,
        };
    }
    return { decision: 'ALLOW', risk_score: 0, entities_found: [], block_reason: '' };
}

const LOCAL_PII_PATTERNS = [
    { type: 'AADHAAR', re: /\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, score: 85 },
    { type: 'PAN',           re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, score: 90 },
    { type: 'EMAIL_ADDRESS', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, score: 85 },
    { type: 'PHONE_NUMBER',  re: /\b(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, score: 85 },
    { type: 'UPI_ID',        re: /\b[a-zA-Z0-9._\-]{3,}@(?:upi|paytm|okaxis|okicici|okhdfcbank|ybl|axisbank|sbi|ibl|apl|oksbi|waicici)\b/gi, score: 85 },
    { type: 'IFSC',          re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, score: 85 },
    { type: 'SENSITIVE_AWS_KEY', re: /\bAKIA[0-9A-Z]{16}\b/gi, score: 95 },
    { type: 'SENSITIVE_DATABASE_CRED', re: /(?:postgres|mysql|mongodb|redis|sqlite|mssql):\/\/[^\s]+/gi, score: 95 },
    { type: 'SENSITIVE_SECRET_KEY', re: /(?:\b(?:secret|private[_\s]?key|access[_\s]?key|api[_\s]?key|auth[_\s]?token|client[_\s]?secret)\s*[:=]\s*\S+|API\s+Key\s*:\s*\S+)/gi, score: 90 },
    { type: 'SENSITIVE_PRIVATE_KEY', re: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g, score: 95 },
];

function buildScanSources(text) {
    const pre = preprocessPdfText(text);
    const norm = normalizeTextForPII(pre);
    const normRaw = normalizeTextForPII(text);
    return [...new Set([text, pre, norm, normRaw].filter(s => s && s.length >= 3))];
}

function localPIIScan(text) {
    if (!text || text.length < 3) {
        return { decision: 'ALLOW', risk_score: 0, entities_found: [] };
    }
    const entities = [];
    const seen = new Set();
    for (const src of buildScanSources(text)) {
        for (const { type, re } of LOCAL_PII_PATTERNS) {
            re.lastIndex = 0;
            const matches = src.match(re);
            if (matches && matches.length && !seen.has(type)) {
                seen.add(type);
                entities.push({ type, count: matches.length });
            }
        }
        const aadhaarLoose = findLooseAadhaar(src);
        if (aadhaarLoose.length && !seen.has('AADHAAR')) {
            seen.add('AADHAAR');
            entities.push({ type: 'AADHAAR', count: aadhaarLoose.length });
        }
        const cards = findCreditCards(src);
        if (cards.length && !seen.has('CREDIT_CARD')) {
            seen.add('CREDIT_CARD');
            entities.push({ type: 'CREDIT_CARD', count: cards.length });
        }
    }
    return applyBlockPolicy({ decision: 'ALLOW', risk_score: 0, entities_found: entities });
}

function mergeVerdicts(backend, local) {
    const combined = [
        ...filterPolicyEntities(local?.entities_found),
        ...filterPolicyEntities(backend?.entities_found),
    ];
    const deduped = [];
    const seen = new Set();
    for (const e of combined) {
        const key = normalizeEntityType(e.type);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(e);
    }
    if (deduped.length > 0) {
        return applyBlockPolicy({ entities_found: deduped, risk_score: 90 });
    }
    return { decision: 'ALLOW', risk_score: 0, entities_found: [] };
}

function escapeHtml(v) {
    return String(v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatIntentLabel(intent) {
    if (!intent || intent === 'SAFE') return '';
    return intent.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function buildVerdictDetails(verdict) {
    const details = [];
    if (verdict.block_reason) details.push(verdict.block_reason);
    else if (verdict.reason) details.push(verdict.reason);
    const entities = verdict.entities_found || [];
    if (entities.length) {
        const summary = entities
            .slice(0, 8)
            .map(e => `${e.count || 1}× ${String(e.type || 'UNKNOWN').replace(/_/g, ' ')}`)
            .join(', ');
        details.push(`Detected: ${summary}`);
    }
    const intent = formatIntentLabel(verdict.intent_label);
    if (intent) details.push(`Classified as: ${intent}`);
    return [...new Set(details.filter(Boolean))];
}

function getMountRoot() {
    let root = document.getElementById('netrika-dlp-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'netrika-dlp-root';
        root.setAttribute('style', 'position:relative;z-index:2147483647;');
        (document.body || document.documentElement).appendChild(root);
    }
    return root;
}

function removeOverlays() {
    document.querySelectorAll('#netrika-dlp-overlay').forEach(el => el.remove());
}

async function hideScanningOverlay() {
    const elapsed = Date.now() - _scanOverlaySince;
    if (_scanOverlaySince > 0 && elapsed < MIN_OVERLAY_MS) {
        await new Promise(r => setTimeout(r, MIN_OVERLAY_MS - elapsed));
    }
    removeOverlays();
    _scanOverlaySince = 0;
}

function unscannableVerdict(fileName, fileSize, reason) {
    return {
        decision: 'BLOCK',
        risk_score: 90,
        entities_found: [],
        block_reason: reason || `Could not extract readable text from "${fileName}" (${fileSize || 0} bytes). Upload blocked for safety.`,
    };
}

function extractAllTextFromBuffer(buffer, maxLen) {
    if (!buffer || !buffer.byteLength) return '';
    const limit = Math.min(buffer.byteLength, maxLen || 500000);
    const printable = extractPrintableFromBuffer(buffer, limit);
    const bytes = new Uint8Array(buffer.slice(0, limit));
    const latin1 = Array.from(bytes, b => String.fromCharCode(b)).join('');
    return [printable, latin1].join('\n').substring(0, 500000);
}

async function extractTextForScan(buffer, fileName) {
    const binaryText = preprocessPdfText(extractAllTextFromBuffer(buffer));
    if (!isPdfFileName(fileName)) return binaryText;

    let pdfText = '';
    try {
        pdfText = preprocessPdfText(await extractPdfTextFromBuffer(buffer));
        console.log(`[Netrika DLP] pdf.js extracted ${pdfText.length} chars from "${fileName}" (binary fallback: ${binaryText.length})`);
    } catch (err) {
        console.warn('[Netrika DLP] pdf.js unavailable:', err);
    }

    if (pdfText.length >= 10) {
        return pdfText.length >= binaryText.length ? pdfText : (pdfText + '\n' + binaryText);
    }
    return binaryText;
}

function isPdfFileName(fileName) {
    return /\.pdf$/i.test(fileName || '');
}

async function handleBufferScan(data) {
    let buf = data.buffer;
    if (Array.isArray(buf)) buf = new Uint8Array(buf).buffer;
    const text = await extractTextForScan(buf, data.fileName || 'file');
    console.log(`[Netrika DLP] Buffer scan: ${data.fileName} (${text.length} chars total for scan)`);
    await respondToScan(data.requestId, data, () =>
        analyzeTextContent(text, data.fileName, data.fileSize, true)
    );
}

async function respondToScan(requestId, data, analyzeFn) {
    const isMeta = isMetadataScan(data);
    if (!isMeta) showScanning(data.fileName || 'file');
    try {
        const verdict = await analyzeFn();
        let allowed = true;
        console.log('[Netrika DLP] Verdict:', verdict.decision, verdict.entities_found);
        if (verdict.decision === 'BLOCK') {
            await showInterventionDialog({
                mode: 'BLOCK',
                subject: `"${data.fileName}" contains sensitive Indian PII or credentials (Aadhaar, PAN, UPI, IFSC, API keys).`,
                verdict,
            });
            allowed = false;
        } else if (!isMeta) {
            await hideScanningOverlay();
        }
        postScanResult(requestId, allowed);
    } catch (err) {
        console.error('[Netrika DLP] Scan error — blocking:', err);
        if (!isMeta) hideScanningOverlay();
        postScanResult(requestId, false);
    }
}

function postScanResult(requestId, allowed) {
    try {
        (window.top || window).postMessage(
            { type: 'NETRIKA_SCAN_FILES_RESULT', requestId, allowed }, '*');
    } catch (_) {
        window.postMessage(
            { type: 'NETRIKA_SCAN_FILES_RESULT', requestId, allowed }, '*');
    }
}

function showScanning(name) {
    removeOverlays();
    _scanOverlaySince = Date.now();
    const el = document.createElement('div');
    el.id = 'netrika-dlp-overlay';
    el.setAttribute('style',
        'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
        'background:rgba(10,15,30,0.96);z-index:2147483647;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;'
    );
    el.innerHTML =
        '<div style="width:72px;height:72px;border-radius:50%;border:5px solid rgba(255,255,255,0.1);' +
        'border-top-color:#38bdf8;animation:ntk-spin 0.8s linear infinite;margin-bottom:28px"></div>' +
        '<h2 style="font-size:24px;font-weight:700;margin:0 0 10px">🛡️ Netrika DLP Scanning…</h2>' +
        '<p style="font-size:15px;opacity:0.7;margin:0;max-width:400px;text-align:center">' +
        escapeHtml(name) + '</p>' +
        '<p style="font-size:13px;opacity:0.5;margin:12px 0 0">Checking for Aadhaar, PAN, UPI, IFSC, API keys…</p>' +
        '<style>@keyframes ntk-spin{to{transform:rotate(360deg)}}</style>';
    getMountRoot().appendChild(el);
}

function showInterventionDialog({ mode, subject, verdict }) {
    return new Promise(resolve => {
        removeOverlays();
        const isBlock = mode === 'BLOCK';
        const details = buildVerdictDetails(verdict);
        const accent = isBlock ? '#dc2626' : '#d97706';
        const bg = isBlock ? 'rgba(127,20,20,0.97)' : 'rgba(130,60,10,0.97)';
        const icon = isBlock ? '🛡️' : '⚠️';
        const title = isBlock ? 'POLICY VIOLATION — UPLOAD BLOCKED' : 'SENSITIVE DATA WARNING';
        const btnLabel = isBlock ? null : 'Proceed anyway';

        const el = document.createElement('div');
        el.id = 'netrika-dlp-overlay';
        el.setAttribute('style',
            'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
            `background:${bg};z-index:2147483647;` +
            'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;' +
            'padding:40px;box-sizing:border-box;overflow-y:auto;'
        );

        const detailsHtml = details.length
            ? '<ul style="margin:14px 0 0;padding-left:20px;text-align:left;max-width:600px;line-height:1.8;font-size:15px">' +
              details.map(l => `<li style="margin-bottom:6px">${escapeHtml(l)}</li>`).join('') +
              '</ul>'
            : '';

        const proceedBtnHtml = btnLabel
            ? `<button id="ntk-proceed" style="padding:14px 32px;background:#fff;color:${accent};border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">${escapeHtml(btnLabel)}</button>`
            : '';

        el.innerHTML =
            `<div style="font-size:72px;line-height:1;margin-bottom:20px">${icon}</div>` +
            `<h1 style="font-size:24px;font-weight:800;margin:0 0 14px;text-align:center;letter-spacing:.05em">${title}</h1>` +
            `<p style="font-size:16px;max-width:600px;text-align:center;margin:0;opacity:.95">${escapeHtml(subject)}</p>` +
            '<div style="width:100%;max-width:600px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:20px 24px;margin-top:22px">' +
            '<div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.7">Reason</div>' +
            detailsHtml +
            '</div>' +
            '<p style="font-size:13px;max-width:600px;text-align:center;opacity:.75;margin:18px 0 0">' +
            (isBlock
                ? 'This upload has been blocked. The incident has been logged to your Netrika DLP dashboard.'
                : 'This incident has been logged to your Netrika DLP dashboard. Cancel to protect your organisation.') +
            '</p>' +
            '<div style="display:flex;gap:16px;margin-top:30px;flex-wrap:wrap;justify-content:center">' +
            '<button id="ntk-cancel" style="padding:14px 32px;background:transparent;color:#fff;border:2px solid rgba(255,255,255,0.75);border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">' +
            (isBlock ? '✕ Close' : '✕ Cancel upload') + '</button>' +
            proceedBtnHtml +
            '</div>';

        getMountRoot().appendChild(el);
        const finish = ok => { removeOverlays(); resolve(ok); };
        document.getElementById('ntk-cancel').onclick = () => finish(false);
        const proceedBtn = document.getElementById('ntk-proceed');
        if (proceedBtn) proceedBtn.onclick = () => finish(true);
        if (isBlock) setTimeout(() => finish(false), 15000);
    });
}

function readFileAsText(file) {
    return new Promise(resolve => {
        try {
            const r = new FileReader();
            r.onload = () => resolve(r.result || '');
            r.onerror = () => resolve('');
            r.readAsText(file);
        } catch (_) { resolve(''); }
    });
}

function readFileAsArrayBuffer(file) {
    return new Promise(resolve => {
        try {
            const r = new FileReader();
            r.onload = () => resolve(r.result || new ArrayBuffer(0));
            r.onerror = () => resolve(new ArrayBuffer(0));
            r.readAsArrayBuffer(file);
        } catch (_) { resolve(new ArrayBuffer(0)); }
    });
}

function extractPrintableFromBuffer(buffer, maxLen) {
    const bytes = new Uint8Array(buffer.slice(0, maxLen || 512000));
    const chunks = [];
    let current = '';
    for (let i = 0; i < bytes.length; i++) {
        const c = bytes[i];
        if (c >= 32 && c <= 126) current += String.fromCharCode(c);
        else if (current.length >= 4) { chunks.push(current); current = ''; }
        else current = '';
    }
    if (current.length >= 4) chunks.push(current);

    const latin1 = Array.from(bytes, b => String.fromCharCode(b)).join('');
    const parenStrings = [];
    const re = /\(([^\\)]{2,300})\)/g;
    let m;
    while ((m = re.exec(latin1))) {
        const s = m[1].replace(/\\([\\()nrtbf])/g, (_, ch) => {
            if (ch === 'n') return '\n';
            if (ch === 'r') return '\r';
            if (ch === 't') return '\t';
            return ch;
        });
        if (s.trim().length >= 3) parenStrings.push(s);
    }

    return [chunks.join('\n'), parenStrings.join('\n')].filter(Boolean).join('\n');
}

function isBinaryFile(file) {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return type === 'application/pdf' || /\.pdf$/i.test(name) ||
           type.startsWith('image/') ||
           type.includes('octet-stream') ||
           type.includes('zip') || /\.(docx?|xlsx?|pptx?|zip|gz|7z)$/i.test(name);
}

async function extractFileText(file) {
    const buffer = await readFileAsArrayBuffer(file);
    if (buffer.byteLength > 0) {
        const fromBuffer = extractAllTextFromBuffer(buffer);
        if (fromBuffer.trim().length >= 3) return fromBuffer;
    }
    const textContent = (await readFileAsText(file) || '').trim();
    if (textContent.length >= 3) return textContent.substring(0, 500000);
    return '';
}

async function analyzeFile(file) {
    console.log(`[Netrika DLP] Scanning: ${file.name} (${file.size} bytes)`);
    const text = await extractFileText(file);
    return analyzeTextContent(text, file.name, file.size, true);
}

function analyzeText(text, url) {
    const localVerdict = localPIIScan(text);
    if (localVerdict.decision === 'BLOCK') {
        return Promise.resolve(localVerdict);
    }

    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(localVerdict), 15000);
        chrome.runtime.sendMessage(
            { action: 'ANALYZE_API', payload: { text, url, type: 'text' } },
            response => {
                clearTimeout(timer);
                if (response && response.decision) {
                    resolve(mergeVerdicts(applyBlockPolicy(response), localVerdict));
                } else {
                    resolve(localVerdict);
                }
            }
        );
    });
}

let _scanQueue = Promise.resolve();

async function scanFilesWithUI(files, source) {
    if (!files || files.length === 0) {
        console.error('[Netrika DLP] No files received for scan — blocking (fail-closed)');
        return false;
    }

    const run = async () => {
        if (_scanning) {
            console.warn('[Netrika DLP] Scan already in progress, waiting…');
        }
        _scanning = true;

        const list = Array.from(files);
        showScanning(list[0]?.name || 'file');
        let allow = true;

        try {
            for (const file of list) {
                const verdict = file._ntkText != null
                    ? await analyzeTextContent(file._ntkText, file.name, file.size)
                    : await analyzeFile(file);
                console.log(`[Netrika DLP] ${file.name} → ${verdict.decision}`, verdict.entities_found);

                if (verdict.decision === 'BLOCK') {
                    await showInterventionDialog({
                        mode: 'BLOCK',
                        subject: `"${file.name}" contains sensitive Indian PII or credentials (Aadhaar, PAN, UPI, IFSC, API keys).`,
                        verdict,
                    });
                    allow = false;
                    break;
                }
            }
        } finally {
            removeOverlays();
            _scanning = false;
        }
        return allow;
    };

    _scanQueue = _scanQueue.then(run, run);
    return _scanQueue;
}

async function queryBackend(text, fileName, fileSize) {
    if (!text || text.length < 3) return null;
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), 45000);
        chrome.runtime.sendMessage({
            action: 'ANALYZE_API',
            payload: {
                text: text.substring(0, 500000),
                url: location.href,
                type: 'file',
                file_name: fileName,
                file_size: fileSize || text.length,
            }
        }, response => {
            clearTimeout(timer);
            if (!response || response.error) {
                resolve(null);
                return;
            }
            resolve(applyBlockPolicy(response));
        });
    });
}

async function analyzeTextContent(text, fileName, fileSize, isFileUpload = true) {
    const preprocessed = preprocessPdfText(text);
    const normalized = normalizeTextForPII(preprocessed);
    console.log(`[Netrika DLP] Scanning text: ${fileName} (${normalized.length} chars after PDF preprocess)`);

    if (isFileUpload && (fileSize || 0) >= 100 && normalized.length < 50) {
        return unscannableVerdict(fileName, fileSize);
    }

    const backendPromise = queryBackend(normalized, fileName, fileSize);

    const localVerdict = localPIIScan(preprocessed);
    if (localVerdict.decision === 'BLOCK') {
        console.warn('[Netrika DLP] Local scan BLOCK:', localVerdict.entities_found);
        backendPromise.then(v => {
            if (v) console.log('[Netrika DLP] Incident logged to dashboard');
        }).catch(() => {});
        return localVerdict;
    }

    if (!normalized || normalized.length < 3) {
        if (isFileUpload && (fileSize || 0) >= 100) {
            return unscannableVerdict(fileName, fileSize);
        }
        backendPromise.catch(() => {});
        return { decision: 'ALLOW', risk_score: 0, entities_found: [] };
    }

    const backendVerdict = await backendPromise;

    if (isFileUpload && !backendVerdict) {
        return {
            decision: 'BLOCK',
            risk_score: 85,
            entities_found: [],
            block_reason: 'DLP backend unavailable or timed out. Upload blocked for safety.',
        };
    }

    const merged = mergeVerdicts(backendVerdict, localVerdict);
    const finalVerdict = applyBlockPolicy(merged);
    console.log('[Netrika DLP] Incident logged to dashboard:', finalVerdict.decision);
    return finalVerdict;
}

window.addEventListener('message', event => {
    if (!event.data) return;
    try {
        if (event.origin !== location.origin) return;
    } catch (_) { return; }

    const data = event.data;

    const UI_MSG_TYPES = new Set([
        'NETRIKA_SCAN_FILES', 'NETRIKA_SHOW_BLOCK', 'NETRIKA_SCAN_TEXT',
        'NETRIKA_SCAN_BUFFER', 'NETRIKA_SHOW_SCANNING', 'NETRIKA_HIDE_SCANNING',
        'NETRIKA_CONFIRM_REQUEST', 'NETRIKA_LOG_SCAN',
    ]);
    if (UI_MSG_TYPES.has(data.type)) {
        if (window !== window.top) return;
    } else if (event.source !== window) {
        return;
    }

    if (data.type === 'NETRIKA_SCAN_FILES') {
        const files = data.files || [];
        scanFilesWithUI(files, data.source || 'page').then(allowed => {
            window.postMessage({ type: 'NETRIKA_SCAN_FILES_RESULT', requestId: data.requestId, allowed }, '*');
        });
        return;
    }

    if (data.type === 'NETRIKA_LOG_SCAN') {
        const normalized = normalizeTextForPII(preprocessPdfText(data.text || ''));
        queryBackend(normalized, data.fileName, data.fileSize)
            .then(() => {
                console.log('[Netrika DLP] Block incident logged to dashboard:', data.fileName);
            }).catch(() => {});
        return;
    }

    if (data.type === 'NETRIKA_SHOW_BLOCK') {
        showInterventionDialog({
            mode: 'BLOCK',
            subject: `"${data.fileName || 'file'}" contains sensitive Indian PII or credentials.`,
            verdict: {
                decision: 'BLOCK',
                entities_found: data.entities || [],
                block_reason: data.reason || 'Sensitive data detected by local DLP scan.',
            },
        });
        return;
    }

    if (data.type === 'NETRIKA_SCAN_BUFFER') {
        handleBufferScan(data);
        return;
    }

    if (data.type === 'NETRIKA_SCAN_TEXT') {
        respondToScan(data.requestId, data, () =>
            analyzeTextContent(data.text || '', data.fileName, data.fileSize, !isMetadataScan(data))
        );
        return;
    }

    if (data.type === 'NETRIKA_SHOW_SCANNING') {
        console.log('[Netrika DLP] Showing scan overlay for', data.fileName);
        showScanning(data.fileName || 'file');
        return;
    }

    if (data.type === 'NETRIKA_HIDE_SCANNING') {
        if (!_scanning) removeOverlays();
        return;
    }

    if (data.type === 'NETRIKA_CHECK') {
        analyzeText(data.payload, data.url).then(verdict => {
            window.postMessage({ type: 'NETRIKA_VERDICT', requestId: data.requestId, verdict }, '*');
        });
        return;
    }

    if (data.type === 'NETRIKA_CONFIRM_REQUEST') {
        if (window !== window.top) return;
        const { requestId, verdict, url } = data;
        const hostname = (() => { try { return new URL(url).hostname; } catch (_) { return 'this site'; } })();

        if (verdict.decision === 'BLOCK') {
            showInterventionDialog({
                mode: 'BLOCK',
                subject: `Sensitive content blocked before sending to ${hostname}.`,
                verdict,
            }).then(() => {
                window.postMessage({ type: 'NETRIKA_CONFIRM_RESPONSE', requestId, proceed: false }, '*');
            });
            return;
        }

        showInterventionDialog({
            mode: verdict.decision,
            subject: `Sensitive content detected before sending to ${hostname}.`,
            verdict,
        }).then(proceed => {
            window.postMessage({ type: 'NETRIKA_CONFIRM_RESPONSE', requestId, proceed }, '*');
        });
    }
});

console.log('[Netrika DLP] v25 UI bridge active on', location.hostname);

}
