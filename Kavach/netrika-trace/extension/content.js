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

/* ── Overlay UI ───────────────────────────────────────────────────
 * Same visual language as the Netrika Trace dashboard: soft cool background, white rounded card,
 * indigo accent, drifting pastel aurora, and the Sentinel guard robot. Rendered in a shadow root so
 * the host page's CSS cannot restyle it. Palette for states: indigo = scanning, peach = warning,
 * pink-red = blocked. */

var NTK_CSS =
    ':host{all:initial}' +
    '*{box-sizing:border-box}' +
    '.wrap{--bg:rgba(246,247,251,.72);--surface:#fff;--line:#E5E7EB;--fg:#111827;--muted:#6B7280;--subtle:#F3F4F8;--accent:#4F46E5;--accent-soft:#E0E7FF;--accent-fg:#4338CA;' +
    '--danger:#EF4444;--danger-soft:#FEE2E2;--danger-fg:#B91C1C;--warn:#F97316;--warn-soft:#FFEDD5;--warn-fg:#7C2D12;--ok-soft:#D1FAE5;--ok-fg:#065F46;' +
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
    'font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg);animation:fade .25s ease-out}' +
    '@media (prefers-color-scheme:dark){.wrap{--bg:rgba(8,10,17,.72);--surface:#12141C;--line:#262A36;--fg:#F3F4F6;--muted:#9CA3AF;--subtle:#1B1E28;--accent:#818CF8;--accent-soft:#312E81;--accent-fg:#C7D2FE;' +
    '--danger:#F87171;--danger-soft:#7F1D1D;--danger-fg:#FECACA;--warn:#FB923C;--warn-soft:#7C2D12;--warn-fg:#FED7AA;--ok-soft:#064E3B;--ok-fg:#A7F3D0}}' +
    '.card{position:relative;overflow:hidden;width:min(520px,100%);background:var(--surface);border:1px solid var(--line);border-radius:28px;' +
    'box-shadow:0 24px 60px rgba(16,24,40,.22),0 4px 12px rgba(16,24,40,.08);padding:28px;text-align:center;animation:rise .35s cubic-bezier(.22,1,.36,1)}' +
    '.aurora{position:absolute;inset:0;pointer-events:none;opacity:.55}' +
    '@media (prefers-color-scheme:dark){.aurora{opacity:.28}}' +
    '.aurora i{position:absolute;display:block;border-radius:50%}' +
    '.aurora i:nth-child(1){width:70%;height:90%;left:-20%;top:-45%;background:radial-gradient(closest-side,rgba(147,197,253,.95),rgba(147,197,253,0));animation:d1 14s ease-in-out infinite}' +
    '.aurora i:nth-child(2){width:65%;height:90%;right:-20%;top:-30%;background:radial-gradient(closest-side,rgba(249,168,212,.95),rgba(249,168,212,0));animation:d2 18s ease-in-out infinite}' +
    '.aurora i:nth-child(3){width:60%;height:80%;left:25%;bottom:-55%;background:radial-gradient(closest-side,rgba(110,231,183,.9),rgba(110,231,183,0));animation:d1 20s ease-in-out infinite}' +
    '.in{position:relative;max-height:calc(100vh - 104px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}' +
    '.chip{display:flex;width:fit-content;margin:0 auto;align-items:center;gap:6px;border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:600;border:1px solid transparent}' +
    '.chip.scan{background:var(--accent-soft);color:var(--accent-fg);border-color:rgba(79,70,229,.25)}' +
    '.chip.block{background:var(--danger-soft);color:var(--danger-fg);border-color:rgba(239,68,68,.3)}' +
    '.chip.warn{background:var(--warn-soft);color:var(--warn-fg);border-color:rgba(249,115,22,.3)}' +
    '.chip i{width:7px;height:7px;border-radius:50%;background:currentColor;display:block}' +
    '.chip.scan i{animation:pulse 1.2s ease-in-out infinite}' +
    'h1{margin:10px 0 6px;font-size:23px;line-height:1.2;font-weight:800;letter-spacing:-.02em}' +
    '.sub{margin:0 auto;max-width:400px;font-size:14px;color:var(--muted);line-height:1.5}' +
    '.file{display:inline-flex;max-width:100%;align-items:center;gap:8px;margin-top:14px;background:var(--subtle);border:1px solid var(--line);border-radius:12px;padding:8px 12px;font-size:13px;font-weight:500}' +
    '.file span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.bar{position:relative;height:6px;border-radius:999px;background:var(--subtle);overflow:hidden;margin:18px auto 0;max-width:340px}' +
    '.bar i{position:absolute;inset:0 auto 0 0;width:38%;border-radius:999px;background:linear-gradient(90deg,var(--accent),#EC4899);animation:slide 1.3s ease-in-out infinite}' +
    '.step{height:20px;margin-top:12px;font-size:13px;color:var(--muted)}' +
    '.step b{font-weight:600;color:var(--fg)}' +
    '.note{margin:16px 0 0;font-size:12px;color:var(--muted)}' +
    '.panel{margin:18px 0 0;text-align:left;background:var(--subtle);border:1px solid var(--line);border-radius:18px;padding:14px 16px}' +
    '.panel h2{margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}' +
    '.panel ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}' +
    '.panel li{display:flex;gap:10px;font-size:14px;line-height:1.45}' +
    '.panel li svg{flex:none;margin-top:2px}' +
    '.row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px}' +
    'button{font:600 14px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;border-radius:12px;padding:11px 20px;border:1px solid var(--line);background:var(--surface);color:var(--fg);transition:transform .15s,background .15s}' +
    'button:hover{background:var(--subtle)}button:active{transform:scale(.97)}' +
    'button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
    'button.primary{background:var(--accent);border-color:transparent;color:#fff}' +
    'button.primary:hover{background:var(--accent);filter:brightness(1.08)}' +
    '.robot{display:block;margin:0 auto}' +
    '@keyframes fade{from{opacity:0}to{opacity:1}}' +
    '@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}' +
    '@keyframes d1{50%{transform:translate(8%,6%) scale(1.12)}}@keyframes d2{50%{transform:translate(-8%,-4%) scale(.94)}}' +
    '@keyframes pulse{50%{opacity:.35}}@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(280%)}}' +
    '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}' +
    '@keyframes beam{0%,100%{transform:translateX(0)}50%{transform:translateX(46px)}}' +
    '@keyframes blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}' +
    '@keyframes stamp{0%{opacity:0;transform:scale(2) rotate(-16deg)}60%{opacity:1;transform:scale(.94) rotate(-8deg)}100%{opacity:1;transform:scale(1) rotate(-8deg)}}' +
    '@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}' +
    '.bob{animation:bob 3s ease-in-out infinite}.beam{animation:beam 1.1s ease-in-out infinite}' +
    '.blink{animation:blink 4.6s infinite;transform-box:fill-box;transform-origin:center}' +
    '.stamp{transform-origin:60px 60px;animation:stamp .5s cubic-bezier(.22,1,.36,1) both}' +
    '.shake{animation:shake .4s ease-in-out 2}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.stamp{opacity:1;transform:rotate(-8deg)}}';

/** Sentinel, the guard robot (same character as the dashboard): pose is 'scan' | 'suspect' | 'blocked'. */
function ntkSentinel(pose) {
    var eye = pose === 'blocked' ? '#EF4444' : pose === 'suspect' ? '#FDBA74' : '#C4B5FD';
    var alarmed = pose === 'blocked' || pose === 'suspect';
    var INK = '#312E81';
    var face;
    if (pose === 'scan') {
        face = '<ellipse cx="46" cy="49" rx="5.5" ry="5.5" fill="' + eye + '"/><ellipse cx="74" cy="49" rx="5.5" ry="5.5" fill="' + eye + '"/>' +
            '<rect class="beam" x="34" y="37" width="5" height="24" rx="2.5" fill="#4F46E5" opacity=".9"/>';
    } else {
        face = '<g class="blink"><ellipse cx="46" cy="49" rx="6.5" ry="7.5" fill="' + eye + '"/><ellipse cx="74" cy="49" rx="6.5" ry="7.5" fill="' + eye + '"/></g>';
    }
    var arm = pose === 'blocked'
        ? '<path d="M86 86c8-2 12-8 12-14" stroke="' + INK + '" stroke-width="5.5" stroke-linecap="round" fill="none"/>' +
          '<rect x="88" y="52" width="22" height="20" rx="5" fill="#EF4444" stroke="' + INK + '" stroke-width="2.5"/>' +
          '<rect x="95" y="44" width="8" height="10" rx="3" fill="#FDE68A" stroke="' + INK + '" stroke-width="2.5"/>'
        : pose === 'suspect'
            ? '<path d="M86 84c10-4 14-16 10-28" stroke="' + INK + '" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M96 56 100 40" stroke="' + INK + '" stroke-width="4.5" stroke-linecap="round"/>'
            : '<path d="M86 86c8 2 10 10 8 16" stroke="' + INK + '" stroke-width="5.5" stroke-linecap="round" fill="none"/>';
    return '<svg class="robot ' + (pose === 'blocked' ? 'shake' : 'bob') + '" width="132" height="132" viewBox="0 0 120 120" role="img" aria-label="Sentinel the guard robot" style="overflow:visible">' +
        '<ellipse cx="60" cy="113" rx="26" ry="4" fill="rgba(107,114,128,.25)"/>' +
        '<path d="M60 24V12" stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round"/>' +
        '<circle cx="60" cy="9" r="5.5" fill="' + (alarmed ? '#EF4444' : '#FDE68A') + '" stroke="' + INK + '" stroke-width="3"/>' +
        '<rect x="34" y="76" width="52" height="30" rx="14" fill="#93C5FD" stroke="' + INK + '" stroke-width="3"/>' +
        '<circle cx="60" cy="91" r="5" fill="' + eye + '" stroke="' + INK + '" stroke-width="2"/>' +
        '<path d="M34 86c-8 2-10 10-8 16" stroke="' + INK + '" stroke-width="5.5" stroke-linecap="round" fill="none"/>' + arm +
        '<rect x="26" y="24" width="68" height="52" rx="22" fill="#93C5FD" stroke="' + INK + '" stroke-width="3"/>' +
        '<rect x="33" y="37" width="54" height="24" rx="12" fill="' + INK + '"/>' + face +
        (alarmed ? '<ellipse cx="60" cy="68" rx="4" ry="3.5" fill="' + INK + '"/>' : '<path d="M54 68h12" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>') +
        '<circle cx="30" cy="62" r="3.5" fill="#F9A8D4" opacity=".7"/><circle cx="90" cy="62" r="3.5" fill="#F9A8D4" opacity=".7"/>' +
        '</svg>';
}

function ntkOverlay(innerHtml) {
    removeOverlays();
    var host = document.createElement('div');
    host.id = 'netrika-dlp-overlay';
    host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;');
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
        '<style>' + NTK_CSS + '</style>' +
        '<div class="wrap"><div class="card" role="dialog" aria-modal="true" aria-live="polite">' +
        '<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div><div class="in">' + innerHtml + '</div></div></div>';
    getMountRoot().appendChild(host);
    return root;
}

var NTK_STEPS = ['Reading the file', 'Looking for secrets and random keys', 'Checking Aadhaar, PAN, cards and bank IDs', 'Comparing with your registered secrets'];

function showScanning(name) {
    _scanOverlaySince = Date.now();
    var root = ntkOverlay(
        '<span class="chip scan"><i></i>Scanning</span>' +
        ntkSentinel('scan') +
        '<h1>Netrika is checking your upload</h1>' +
        '<p class="sub">Nothing is sent to the AI service until the check is done.</p>' +
        '<div class="file" title="' + escapeHtml(name) + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg><span>' + escapeHtml(name) + '</span></div>' +
        '<div class="bar" aria-hidden="true"><i></i></div>' +
        '<div class="step" id="ntk-step"></div>' +
        '<p class="note">Scanned on this device first. Raw values are never logged.</p>'
    );
    var stepEl = root.getElementById('ntk-step');
    var i = 0;
    var tick = function () {
        if (!stepEl.isConnected) return clearInterval(timer);
        stepEl.innerHTML = '<b>' + NTK_STEPS[i % NTK_STEPS.length] + '</b>…';
        i++;
    };
    var timer = setInterval(tick, 1300);
    tick();
}

function showInterventionDialog({ mode, subject, verdict }) {
    return new Promise(function (resolve) {
        var isBlock = mode === 'BLOCK';
        var details = buildVerdictDetails(verdict);
        var tone = isBlock ? 'block' : 'warn';
        var tick = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + (isBlock ? '#EF4444' : '#F97316') + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="M12 9v4M12 16h.01"/></svg>';
        var list = details.length
            ? '<div class="panel"><h2>Why</h2><ul>' + details.map(function (l) { return '<li>' + tick + '<span>' + escapeHtml(l) + '</span></li>'; }).join('') + '</ul></div>'
            : '';
        var root = ntkOverlay(
            '<span class="chip ' + tone + '"><i></i>' + (isBlock ? 'Blocked by policy' : 'Needs your decision') + '</span>' +
            '<div style="position:relative;width:132px;margin:2px auto 0">' + ntkSentinel(isBlock ? 'blocked' : 'suspect') +
            (isBlock ? '<svg class="stamp" style="position:absolute;left:50%;top:50%;margin:-22px 0 0 -62px" width="124" height="44" viewBox="0 0 124 44" aria-hidden="true"><rect x="2" y="2" width="120" height="40" rx="10" fill="rgba(255,255,255,.85)" stroke="#EF4444" stroke-width="3.5"/><text x="62" y="29" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="20" font-weight="800" letter-spacing="3" fill="#EF4444">BLOCKED</text></svg>' : '') +
            '</div>' +
            '<h1>' + (isBlock ? 'This upload was stopped' : 'Sensitive data found') + '</h1>' +
            '<p class="sub">' + escapeHtml(subject) + '</p>' +
            list +
            '<p class="note">' + (isBlock
                ? 'The incident was logged to your Netrika dashboard. The file was not sent.'
                : 'This will be logged to your Netrika dashboard. Cancelling keeps the data inside your organisation.') + '</p>' +
            '<div class="row"><button type="button" id="ntk-cancel" class="' + (isBlock ? 'primary' : '') + '">' + (isBlock ? 'Close' : 'Cancel upload') + '</button>' +
            (isBlock ? '' : '<button type="button" id="ntk-proceed" class="primary">Proceed anyway</button>') + '</div>'
        );
        var finish = function (ok) {
            document.removeEventListener('keydown', onKey, true);
            removeOverlays();
            resolve(ok);
        };
        var onKey = function (e) { if (e.key === 'Escape') finish(false); };
        document.addEventListener('keydown', onKey, true);
        var cancel = root.getElementById('ntk-cancel');
        cancel.onclick = function () { finish(false); };
        var proceed = root.getElementById('ntk-proceed');
        if (proceed) proceed.onclick = function () { finish(true); };
        cancel.focus();
        if (isBlock) setTimeout(function () { finish(false); }, 20000);
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
