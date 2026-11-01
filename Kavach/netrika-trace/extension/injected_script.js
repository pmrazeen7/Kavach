// Netrika-Trace page hook v23 — runs in MAIN world at document_start (before ChatGPT loads)
(function() {
    'use strict';

    const HOST_OK = /chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|gemini\.google|copilot\.microsoft|perplexity\.ai|^localhost$|^127\.0\.0\.1$/i;
    if (!HOST_OK.test(location.hostname)) return;

    console.log('[Netrika DLP] Page hook v25 active (MAIN world) on', location.hostname);

    // ── Instant local PII detection (no backend, no async) ─────────────────────
    const QUICK_PATTERNS = [
        { type: 'AADHAAR', re: /\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b/gi },
        { type: 'PAN', re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi },
        { type: 'EMAIL_ADDRESS', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
        { type: 'PHONE_NUMBER', re: /\b(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g },
        { type: 'UPI_ID', re: /\b[a-zA-Z0-9._\-]{3,}@(?:upi|paytm|okaxis|okicici|okhdfcbank|ybl|axisbank|sbi|ibl|apl|oksbi|waicici)\b/gi },
        { type: 'IFSC', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi },
        { type: 'SENSITIVE_AWS_KEY', re: /\bAKIA[0-9A-Z]{16}\b/gi },
        { type: 'SENSITIVE_DATABASE_CRED', re: /(?:postgres|mysql|mongodb|redis|sqlite|mssql):\/\/[^\s<>"']+/gi },
        { type: 'SENSITIVE_SECRET_KEY', re: /(?:\b(?:secret|private[_\s]?key|access[_\s]?key|api[_\s]?key)\s*[:=]\s*\S+|API\s+Key\s*:\s*\S+)/gi },
        { type: 'SENSITIVE_PRIVATE_KEY', re: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/gi },
    ];

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

    function findCreditCards(text) {
        const candidates = text.match(/\b(?:\d[ -]?){13,19}\b/g) || [];
        return candidates.filter(candidate => {
            const digits = candidate.replace(/\D/g, '');
            if (digits.length < 13 || digits.length > 19) return false;
            let sum = 0;
            let doubleDigit = false;
            for (let index = digits.length - 1; index >= 0; index--) {
                let digit = Number(digits[index]);
                if (doubleDigit) {
                    digit *= 2;
                    if (digit > 9) digit -= 9;
                }
                sum += digit;
                doubleDigit = !doubleDigit;
            }
            return sum % 10 === 0;
        });
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

    function buildScanSources(text) {
        const pre = preprocessPdfText(text);
        const norm = normalizeTextForPII(pre);
        const normRaw = normalizeTextForPII(text);
        return [...new Set([text, pre, norm, normRaw].filter(s => s && s.length >= 3))];
    }

    function quickLocalScan(text) {
        if (!text || text.length < 3) return null;
        const entities = [];
        const seen = new Set();
        for (const src of buildScanSources(text)) {
            for (const { type, re } of QUICK_PATTERNS) {
                re.lastIndex = 0;
                const m = src.match(re);
                if (m && m.length && !seen.has(type)) {
                    seen.add(type);
                    entities.push({ type, count: m.length });
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
        return entities.length ? entities : null;
    }

    // ── State ──────────────────────────────────────────────────────────────────
    const _bypassFileInputs = new WeakSet();
    let _bypassNextDrop = false;
    let _bypassNextPaste = false;
    let _uploadGatePromise = null;
    let _uploadGateResolve = null;
    let _activeScanPromise = null;
    const _scanResultCache = new Map();
    let _uploadPassUntil = 0;
    const UPLOAD_PASS_MS = 30000;
    const _allowedSizes = new Map();

    function markUploadAllowed(fileSize) {
        _uploadPassUntil = Date.now() + UPLOAD_PASS_MS;
        const size = fileSize || 0;
        if (size > 0) _allowedSizes.set(size, _uploadPassUntil);
        finishUploadGate(true);
        console.log('[Netrika DLP] Upload cleared — network hooks bypassed for 30s', size ? `(size ${size})` : '');
    }

    function canPassUploadWithoutRescan(blobOrSize) {
        if (Date.now() < _uploadPassUntil) return true;
        const size = typeof blobOrSize === 'number'
            ? blobOrSize
            : (blobOrSize && blobOrSize.size) || 0;
        if (size > 0) {
            const exp = _allowedSizes.get(size);
            if (exp && Date.now() < exp) return true;
            if (exp) _allowedSizes.delete(size);
        }
        return false;
    }

    function getCachedScan(blob) {
        const key = scanCacheKey(blob);
        if (_scanResultCache.has(key)) return _scanResultCache.get(key);
        const size = blob.size || 0;
        if (size > 0 && _scanResultCache.has(`size:${size}`)) {
            return _scanResultCache.get(`size:${size}`);
        }
        return null;
    }

    function setCachedScan(blob, promise) {
        _scanResultCache.set(scanCacheKey(blob), promise);
        const size = blob.size || 0;
        if (size > 0) _scanResultCache.set(`size:${size}`, promise);
    }

    function isBinaryFile(blob) {
        const name = (blob.name || '').toLowerCase();
        const type = (blob.type || '').toLowerCase();
        return type === 'application/pdf' || /\.pdf$/i.test(name) ||
               type.startsWith('image/') ||
               type.includes('octet-stream') ||
               type.includes('zip') || /\.(docx?|xlsx?|pptx?|zip|gz|7z)$/i.test(name);
    }

    function scanCacheKey(blob) {
        return `${blob.name || 'blob'}:${blob.size}:${blob.lastModified || 0}`;
    }

    function isMetadataBlob(blob) {
        return blob.size < 2048 &&
            (!blob.name || blob.name === 'upload' || blob.name === 'blob');
    }

    function showScanningUI(fileName) {
        postToUI({ type: 'NETRIKA_SHOW_SCANNING', fileName: fileName || 'file' });
    }

    const origFR = {
        readAsText: FileReader.prototype.readAsText,
        readAsArrayBuffer: FileReader.prototype.readAsArrayBuffer,
        readAsDataURL: FileReader.prototype.readAsDataURL,
    };

    const originalFetch = window.fetch.bind(window);
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const origBlobArrayBuffer = Blob.prototype.arrayBuffer
        ? Blob.prototype.arrayBuffer.bind(Blob.prototype)
        : null;

    function beginUploadGate() {
        if (!_uploadGatePromise) {
            _uploadGatePromise = new Promise(r => { _uploadGateResolve = r; });
        }
    }

    function finishUploadGate(allowed) {
        if (_uploadGateResolve) {
            _uploadGateResolve(!!allowed);
            _uploadGateResolve = null;
            _uploadGatePromise = null;
        }
    }

    function logScanToBackend(fileName, fileSize, text, decision, entities) {
        postToUI({
            type: 'NETRIKA_LOG_SCAN',
            fileName: fileName || 'file',
            fileSize: fileSize || 0,
            text: (text || '').substring(0, 500000),
            decision: decision || 'ALLOW',
            entities: entities || [],
        });
    }

    function postToUI(msg) {
        try {
            (window.top || window).postMessage(msg, '*');
        } catch (_) {
            window.postMessage(msg, '*');
        }
    }

    function notifyBlock(fileName, entities, reason) {
        postToUI({
            type: 'NETRIKA_SHOW_BLOCK',
            fileName: fileName || 'file',
            entities: entities || [],
            reason: reason || 'Sensitive data detected.',
        });
    }

    function extractPrintable(buffer, maxLen) {
        const bytes = new Uint8Array(buffer.slice(0, maxLen || 512000));
        const chunks = [];
        let cur = '';
        for (let i = 0; i < bytes.length; i++) {
            const c = bytes[i];
            if (c >= 32 && c <= 126) cur += String.fromCharCode(c);
            else if (cur.length >= 4) { chunks.push(cur); cur = ''; }
            else cur = '';
        }
        if (cur.length >= 4) chunks.push(cur);

        const latin1 = Array.from(bytes.slice(0, maxLen || 512000), b => String.fromCharCode(b)).join('');
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

    async function readViaText(blob) {
        return new Promise(resolve => {
            const r = new FileReader();
            r._ntkInternal = true;
            r.onload = () => resolve(r.result || '');
            r.onerror = () => resolve('');
            origFR.readAsText.call(r, blob);
        });
    }

    async function readBuffer(blob) {
        try {
            if (origBlobArrayBuffer) return await origBlobArrayBuffer.call(blob);
        } catch (_) { /* fall through */ }
        return new Promise(resolve => {
            const r = new FileReader();
            r._ntkInternal = true;
            r.onload = () => resolve(r.result || new ArrayBuffer(0));
            r.onerror = () => resolve(new ArrayBuffer(0));
            origFR.readAsArrayBuffer.call(r, blob);
        });
    }

    function extractAllTextFromBuffer(buffer, maxLen) {
        if (!buffer || !buffer.byteLength) return '';
        const limit = Math.min(buffer.byteLength, maxLen || 500000);
        const bytes = new Uint8Array(buffer.slice(0, limit));
        const latin1 = Array.from(bytes, b => String.fromCharCode(b)).join('');
        const printable = extractPrintable(buffer, limit);
        return [printable, latin1].join('\n').substring(0, 500000);
    }

    async function readBlobText(blob) {
        try {
            const buf = await readBuffer(blob);
            if (buf && buf.byteLength > 0) {
                const combined = extractAllTextFromBuffer(buf);
                if (combined.trim()) return combined;
            }
        } catch (err) {
            console.warn('[Netrika DLP] Buffer read failed for', blob.name, err);
        }

        const viaText = await readViaText(blob);
        if (viaText && viaText.trim().length >= 3) {
            const latin1 = Array.from(viaText, c => String.fromCharCode(c.charCodeAt(0) & 0xff)).join('');
            return [viaText, latin1].join('\n').substring(0, 500000);
        }
        return '';
    }

    function isPdfFile(file) {
        const name = (file?.name || '').toLowerCase();
        const type = (file?.type || '').toLowerCase();
        return type === 'application/pdf' || /\.pdf$/i.test(name);
    }

    function failIfUnscannable(file, text) {
        const len = (text || '').trim().length;
        const size = file.size || 0;
        if (size >= 100 && len < 50) {
            console.warn('[Netrika DLP] Unscannable file — blocking (fail-closed):', file.name, size, 'bytes,', len, 'chars');
            notifyBlock(file.name, [{ type: 'UNSCANNABLE', count: 1 }],
                'Could not verify file contents. Upload blocked for safety.');
            finishUploadGate(false);
            return true;
        }
        return false;
    }

    function waitForScanResult(requestId, fileName, fileSize, source, timeoutMs) {
        const msgTarget = window.top || window;
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                msgTarget.removeEventListener('message', handler);
                console.error('[Netrika DLP] Scan timeout — blocking', fileName);
                finishUploadGate(false);
                _activeScanPromise = null;
                resolve(false);
            }, timeoutMs || 90000);

            const handler = (event) => {
                try { if (event.origin !== location.origin) return; } catch (_) { return; }
                if (event.data?.type === 'NETRIKA_SCAN_FILES_RESULT' && event.data.requestId === requestId) {
                    msgTarget.removeEventListener('message', handler);
                    clearTimeout(timeout);
                    const allowed = !!event.data.allowed;
                    console.log(`[Netrika DLP] Scan (${source}): ${allowed ? 'ALLOW' : 'BLOCK'} —`, fileName);
                    if (allowed) markUploadAllowed(fileSize);
                    else finishUploadGate(false);
                    _activeScanPromise = null;
                    resolve(allowed);
                }
            };
            msgTarget.addEventListener('message', handler);
        });
    }

    function requestBufferScan(buffer, fileName, fileSize, source) {
        const text = preprocessPdfText(extractAllTextFromBuffer(buffer));
        const quick = quickLocalScan(text);
        if (quick) {
            console.warn('[Netrika DLP] INSTANT BLOCK (local):', fileName, quick);
            notifyBlock(fileName, quick, 'Sensitive data detected by local DLP scan.');
            logScanToBackend(fileName, fileSize, text, 'BLOCK', quick);
            finishUploadGate(false);
            return Promise.resolve(false);
        }

        if (_activeScanPromise) return _activeScanPromise;

        beginUploadGate();
        const requestId = Math.random().toString(36).slice(2);
        _activeScanPromise = waitForScanResult(requestId, fileName, fileSize, source, 90000);

        postToUI({
            type: 'NETRIKA_SCAN_BUFFER',
            requestId,
            buffer: buffer.byteLength > 500000 ? buffer.slice(0, 500000) : buffer,
            fileName: fileName || 'file',
            fileSize: fileSize || buffer.byteLength,
            source,
        });

        return _activeScanPromise;
    }

    async function scanFiles(files, source) {
        const selectedFiles = Array.from(files || []);
        if (selectedFiles.length === 0) {
            finishUploadGate(false);
            return false;
        }

        for (const file of selectedFiles) {
            if (isMetadataBlob(file)) {
                const text = await readBlobText(file);
                const quick = quickLocalScan(normalizeTextForPII(text));
                if (quick) {
                    console.warn('[Netrika DLP] INSTANT BLOCK (metadata):', file.name, quick);
                    notifyBlock(file.name || 'upload', quick, 'Sensitive data detected by local DLP scan.');
                    logScanToBackend(file.name || 'upload', file.size, text, 'BLOCK', quick);
                    finishUploadGate(false);
                    return false;
                }
                continue;
            }

            const cached = getCachedScan(file);
            if (cached) {
                console.log(`[Netrika DLP] Reusing cached scan for "${file.name}" (${source})`);
                if (!await cached) return false;
                markUploadAllowed(file.size);
                continue;
            }

            showScanningUI(file.name);
            const scanPromise = (async () => {
                const buf = await readBuffer(file);
                if (!buf || buf.byteLength === 0) {
                    console.error('[Netrika DLP] Could not read file bytes — blocking:', file.name);
                    notifyBlock(file.name, [{ type: 'UNSCANNABLE', count: 1 }],
                        'Could not read file. Upload blocked for safety.');
                    finishUploadGate(false);
                    return false;
                }
                const text = preprocessPdfText(extractAllTextFromBuffer(buf));
                console.log(`[Netrika DLP] Read ${text.length} chars from "${file.name}" (${source})`);
                if (failIfUnscannable(file, text)) return false;
                return requestBufferScan(buf, file.name, file.size, source);
            })();

            setCachedScan(file, scanPromise);
            try {
                if (!await scanPromise) return false;
            } finally {
                setTimeout(() => {
                    _scanResultCache.delete(scanCacheKey(file));
                    if (file.size) _scanResultCache.delete(`size:${file.size}`);
                }, 8000);
            }
        }
        return true;
    }

    async function scanBlob(blob, name) {
        const file = blob instanceof File ? blob : new File([blob], name || 'upload');
        return scanFiles([file], 'network');
    }

    function isUploadUrl(url, method) {
        const m = (method || 'GET').toUpperCase();
        if (m !== 'PUT' && m !== 'POST') return false;
        try {
            const u = new URL(url, location.href).href;
            return u.includes('oaiusercontent.com') ||
                   u.includes('blob.core.windows.net') ||
                   /\/backend-api\/files?\b/i.test(u) ||
                   /\/v1\/files\b/i.test(u) ||
                   /\/upload\b/i.test(u);
        } catch (_) { return false; }
    }

    function isLLMDomain(url) {
        return /chatgpt\.com|openai\.com|claude\.ai|oaiusercontent\.com|anthropic\.com|gemini\.google|copilot\.microsoft|perplexity\.ai|localhost|127\.0\.0\.1/i.test(url);
    }

    function isPromptSubmissionUrl(url, method) {
        if (!isLLMDomain(url) || !['POST', 'PUT'].includes((method || '').toUpperCase())) return false;
        try {
            const path = new URL(url, location.href).pathname;
            return /(?:conversation|chat\/completions|\/messages(?:\/|$)|generatecontent|\/responses(?:\/|$))/i.test(path);
        } catch (_) {
            return false;
        }
    }

    function extractPromptText(body) {
        const parts = [];
        const ignoredKey = /^(?:id|role|type|model|name|url|mime_type|filename|file_id|conversation_id|parent_id|recipient|channel|format|index|timestamp)$/i;
        const visit = (value, key = '', depth = 0) => {
            if (depth > 12 || value == null || ignoredKey.test(key)) return;
            if (typeof value === 'string') {
                if (value.length >= 3 && !/^data:[^,]+,/i.test(value)) parts.push(value);
                return;
            }
            if (Array.isArray(value)) {
                for (const item of value) visit(item, '', depth + 1);
                return;
            }
            if (typeof value === 'object') {
                for (const [childKey, child] of Object.entries(value)) {
                    visit(child, childKey, depth + 1);
                }
            }
        };

        if (typeof body === 'string') {
            try {
                visit(JSON.parse(body));
            } catch (_) {
                return body;
            }
        } else if (body instanceof URLSearchParams) {
            for (const [key, value] of body.entries()) visit(value, key);
        } else if (body instanceof FormData) {
            for (const [key, value] of body.entries()) {
                if (typeof value === 'string') visit(value, key);
            }
        }
        return parts.join('\n').slice(0, 500000);
    }

    async function gatePromptSubmission(body, url, method) {
        if (!isPromptSubmissionUrl(url, method)) return true;
        const text = extractPromptText(body);
        if (text.length < 3) return true;

        const localMatches = quickLocalScan(text);
        if (localMatches) {
            console.warn('[Netrika DLP] Prompt blocked by local scan:', localMatches);
            logScanToBackend('prompt', text.length, text, 'BLOCK', localMatches);
            notifyBlock('Message', localMatches, 'Sensitive information detected in the message.');
            return false;
        }

        const requestId = `prompt-${Math.random().toString(36).slice(2)}`;
        return new Promise(resolve => {
            const target = window.top || window;
            const timeout = setTimeout(() => {
                target.removeEventListener('message', onResult);
                console.error('[Netrika DLP] Prompt scan timed out — blocking request');
                notifyBlock('Message', [{ type: 'SCAN_UNAVAILABLE', count: 1 }],
                    'Could not verify this message. It was not sent.');
                resolve(false);
            }, 45000);
            const onResult = event => {
                if (event.origin !== location.origin ||
                    event.data?.type !== 'NETRIKA_SCAN_FILES_RESULT' ||
                    event.data.requestId !== requestId) return;
                clearTimeout(timeout);
                target.removeEventListener('message', onResult);
                resolve(!!event.data.allowed);
            };
            target.addEventListener('message', onResult);
            postToUI({
                type: 'NETRIKA_SCAN_TEXT',
                requestId,
                text,
                fileName: 'prompt',
                fileSize: text.length,
                source: 'prompt',
            });
        });
    }

    async function gateUpload(body, url, method) {
        if (!isUploadUrl(url, method)) return true;

        if (canPassUploadWithoutRescan(body instanceof ArrayBuffer ? body.byteLength : body)) {
            return true;
        }

        if (_uploadGatePromise) {
            const ok = await _uploadGatePromise;
            if (!ok) {
                console.error('[Netrika DLP] Upload blocked (gate):', url);
                return false;
            }
        }

        if (body && (body instanceof Blob || body instanceof ArrayBuffer)) {
            const blob = body instanceof ArrayBuffer ? new Blob([body]) : body;
            if (blob.size < 2048 && (!blob.name || blob.name === 'upload')) {
                const text = await readBlobText(blob);
                const quick = quickLocalScan(normalizeTextForPII(text));
                if (quick) {
                    console.error('[Netrika DLP] Upload blocked (metadata scan):', url);
                    return false;
                }
                return true;
            }
            if (canPassUploadWithoutRescan(blob)) return true;
            const allowed = await scanBlob(blob, blob.name || 'upload');
            if (!allowed) {
                console.error('[Netrika DLP] Upload blocked (scan):', url);
                return false;
            }
            markUploadAllowed(blob.size);
        }
        return true;
    }

    // ── fetch / XHR — registered immediately ───────────────────────────────────
    window.fetch = async function(...args) {
        const url = args[0] instanceof Request ? args[0].url : String(args[0]);
        const opts = args[0] instanceof Request ? {} : (args[1] || {});
        const method = (opts.method || (args[0] instanceof Request ? args[0].method : 'GET') || 'GET').toUpperCase();

        if (isPromptSubmissionUrl(url, method)) {
            let body = opts.body || null;
            if (args[0] instanceof Request && !opts.body) {
                try { body = await args[0].clone().text(); } catch (_) {}
            }
            if (!await gatePromptSubmission(body, url, method)) {
                return new Response(JSON.stringify({ error: 'Blocked by Netrika-Trace DLP' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        if (isLLMDomain(url) && (method === 'PUT' || method === 'POST')) {
            let body = opts.body || (args[0] instanceof Request ? args[0].body : null);
            if (body) {
                let bodyData = body;
                if (args[0] instanceof Request && !opts.body) {
                    try { bodyData = await args[0].clone().blob(); } catch (_) {}
                }
                const ok = await gateUpload(bodyData, url, method);
                if (!ok) {
                    return new Response(JSON.stringify({ error: 'Blocked by Netrika-Trace DLP' }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
            }
        }
        return originalFetch(...args);
    };

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._ntkUrl = url;
        this._ntkMethod = method;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(body) {
        const self = this;
        const url = self._ntkUrl || '';
        const method = (self._ntkMethod || 'GET').toUpperCase();
        if (isPromptSubmissionUrl(url, method) && body) {
            gatePromptSubmission(body, url, method).then(allowed => {
                if (!allowed) { try { self.abort(); } catch (_) {} return; }
                originalXHRSend.apply(self, [body]);
            }).catch(err => {
                console.error('[Netrika DLP] Prompt scan failed — blocking request:', err);
                try { self.abort(); } catch (_) {}
            });
            return;
        }
        if (isLLMDomain(url) && (method === 'PUT' || method === 'POST') && body) {
            gateUpload(body, url, method).then(ok => {
                if (!ok) { try { self.abort(); } catch (_) {} return; }
                originalXHRSend.apply(self, [body]);
            });
            return;
        }
        originalXHRSend.apply(self, [body]);
    };

    // ── Blob.arrayBuffer ───────────────────────────────────────────────────────
    if (origBlobArrayBuffer) {
        Blob.prototype.arrayBuffer = async function(...args) {
            if (canPassUploadWithoutRescan(this)) {
                return origBlobArrayBuffer.apply(this, args);
            }
            if (this.size >= 10 && this.size <= 50 * 1024 * 1024 && !isMetadataBlob(this)) {
                const cached = getCachedScan(this);
                let ok;
                if (cached) {
                    ok = await cached;
                } else {
                    ok = await scanBlob(this, this.name || 'blob');
                }
                if (!ok) throw new DOMException('Blocked by Netrika DLP', 'SecurityError');
            }
            return origBlobArrayBuffer.apply(this, args);
        };
    }

    // ── File input — sync stop, async scan ─────────────────────────────────────
    document.addEventListener('change', function(e) {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || t.type !== 'file') return;
        if (_bypassFileInputs.has(t)) {
            _bypassFileInputs.delete(t);
            return;
        }
        if (!t.files || !t.files.length) return;

        const files = Array.from(t.files);
        // Hold the original FileList while scanning so framework file-input state
        // remains unchanged until the verified files can be dispatched.
        e.stopImmediatePropagation();

        console.log('[Netrika DLP] File input intercepted:', files.map(f => f.name));
        beginUploadGate();

        scanFiles(files, 'input').then(allowed => {
            if (!allowed) {
                try { t.value = ''; } catch (_) {}
                return;
            }
            try {
                const dt = new DataTransfer();
                files.forEach(f => dt.items.add(f));
                t.files = dt.files;
                _bypassFileInputs.add(t);
                t.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (err) {
                console.warn('[Netrika DLP] Could not restore files:', err);
                try { t.value = ''; } catch (_) {}
                finishUploadGate(false);
            }
        }).catch(err => {
            console.error('[Netrika DLP] File scan failed — blocking upload:', err);
            try { t.value = ''; } catch (_) {}
            finishUploadGate(false);
        });
    }, true);

    document.addEventListener('mousedown', (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement && t.type === 'file') beginUploadGate();
    }, true);

    document.addEventListener('dragover', e => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    }, true);

    document.addEventListener('drop', function(e) {
        if (_bypassNextDrop) {
            _bypassNextDrop = false;
            return;
        }
        const files = e.dataTransfer?.files;
        if (!files?.length) return;
        const target = e.target;
        const selectedFiles = Array.from(files);
        e.stopImmediatePropagation();
        e.preventDefault();
        beginUploadGate();
        scanFiles(selectedFiles, 'drop').then(allowed => {
            if (!allowed) return;
            const transfer = new DataTransfer();
            selectedFiles.forEach(file => transfer.items.add(file));
            _bypassNextDrop = true;
            const replay = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: transfer,
            });
            (target instanceof EventTarget ? target : document).dispatchEvent(replay);
        }).catch(err => {
            console.error('[Netrika DLP] Dropped-file scan failed — blocking upload:', err);
            finishUploadGate(false);
        });
    }, true);

    document.addEventListener('paste', function(e) {
        if (_bypassNextPaste) {
            _bypassNextPaste = false;
            return;
        }
        const files = e.clipboardData?.files;
        if (!files?.length) return;
        const target = e.target;
        const selectedFiles = Array.from(files);
        e.stopImmediatePropagation();
        e.preventDefault();
        beginUploadGate();
        scanFiles(selectedFiles, 'paste').then(allowed => {
            if (!allowed) return;
            const transfer = new DataTransfer();
            selectedFiles.forEach(file => transfer.items.add(file));
            _bypassNextPaste = true;
            const replay = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: transfer,
            });
            (target instanceof EventTarget ? target : document).dispatchEvent(replay);
        }).catch(err => {
            console.error('[Netrika DLP] Pasted-file scan failed — blocking upload:', err);
            finishUploadGate(false);
        });
    }, true);

    if (typeof window.showOpenFilePicker === 'function') {
        const orig = window.showOpenFilePicker.bind(window);
        window.showOpenFilePicker = async function(opts) {
            beginUploadGate();
            const handles = await orig(opts);
            for (const h of handles) {
                const file = await h.getFile();
                const ok = await scanFiles([file], 'picker');
                if (!ok) throw new DOMException('Blocked by Netrika DLP', 'SecurityError');
            }
            return handles;
        };
    }

    function wrapReader(method) {
        const orig = origFR[method];
        FileReader.prototype[method] = function(source, ...rest) {
            const self = this;
            const blob = source instanceof Blob ? source : null;
            if (!blob || blob.size < 10 || self._ntkInternal || isMetadataBlob(blob)) {
                return orig.apply(self, [source, ...rest]);
            }
            if (canPassUploadWithoutRescan(blob)) {
                return orig.apply(self, [source, ...rest]);
            }
            const cached = getCachedScan(blob);
            if (cached) {
                cached.then(ok => {
                    if (ok) orig.apply(self, [source, ...rest]);
                    else queueMicrotask(() => {
                        self.dispatchEvent(new ProgressEvent('error', { bubbles: false, cancelable: false }));
                    });
                });
                return;
            }
            scanBlob(blob, blob.name || 'file').then(ok => {
                if (ok) orig.apply(self, [source, ...rest]);
                else queueMicrotask(() => {
                    const err = new ProgressEvent('error', { bubbles: false, cancelable: false });
                    self.dispatchEvent(err);
                });
            });
        };
    }
    wrapReader('readAsText');
    wrapReader('readAsArrayBuffer');
    wrapReader('readAsDataURL');

})();
