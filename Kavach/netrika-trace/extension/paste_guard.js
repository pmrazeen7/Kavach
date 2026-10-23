/**
 * Kavach paste guard.
 *
 * Inspects text BEFORE it enters a chat box on supported AI sites, using the same
 * scanner engine as the dashboard (kavach-scanner.js). Everything runs locally; the
 * pasted text is never sent anywhere by this script.
 *
 * - Safe or warn-level text pastes normally.
 * - Anything the policy would stop is held back and the user chooses:
 *   paste with placeholders, paste anyway (only for ambiguous tokens), or cancel.
 */
(function () {
  'use strict';
  var S = window.KavachScanner;
  if (!S || window.__kavachPasteGuard) return;
  window.__kavachPasteGuard = true;

  var HARD = { fingerprint: 1, canary: 1 };
  var MAX = 200000;

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'textarea' || (tag === 'input' && /^(text|search|email|url|tel|password)?$/.test(el.type || 'text'));
  }

  function insert(target, text) {
    if (target.isContentEditable) {
      target.focus();
      document.execCommand('insertText', false, text);
      return;
    }
    var s = target.selectionStart || 0;
    var e = target.selectionEnd || 0;
    target.setRangeText(text, s, e, 'end');
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  function prompt(result, opts) {
    var old = document.getElementById('kavach-paste-guard');
    if (old) old.remove();
    var host = el('div', 'position:fixed;right:16px;bottom:16px;z-index:2147483647;');
    host.id = 'kavach-paste-guard';
    var root = host.attachShadow({ mode: 'closed' });
    var card = el('div', 'font:14px/1.45 Inter,system-ui,sans-serif;width:340px;background:#fff;color:#111827;border:1px solid #E5E7EB;border-radius:20px;box-shadow:0 12px 32px rgba(16,24,40,.18);padding:16px;');
    var head = el('div', 'display:flex;gap:10px;align-items:center;margin-bottom:8px;');
    var dot = el('span', 'width:28px;height:28px;border-radius:50%;background:#FEE2E2;color:#B91C1C;display:grid;place-items:center;font-weight:700;', '!');
    head.appendChild(dot);
    head.appendChild(el('strong', 'font-size:15px;', 'Kavach held back this paste'));
    card.appendChild(head);
    card.appendChild(el('p', 'margin:0 0 10px;color:#6B7280;font-size:13px;', result.findings.length + ' sensitive item' + (result.findings.length === 1 ? '' : 's') + ' found. Nothing was sent anywhere.'));
    var list = el('ul', 'margin:0 0 12px;padding:0;list-style:none;display:grid;gap:6px;');
    result.findings.filter(function (f) { return f.action !== 'ALLOW'; }).slice(0, 5).forEach(function (f) {
      var li = el('li', 'display:flex;justify-content:space-between;gap:8px;background:#F3F4F8;border-radius:12px;padding:6px 10px;font-size:12px;');
      li.appendChild(el('span', 'font-weight:600;', f.label));
      li.appendChild(el('span', 'font-family:ui-monospace,monospace;color:#6B7280;', f.masked));
      list.appendChild(li);
    });
    card.appendChild(list);
    var row = el('div', 'display:flex;gap:8px;flex-wrap:wrap;');
    function btn(label, primary, fn) {
      var b = el('button', 'cursor:pointer;border-radius:12px;padding:8px 12px;font:600 13px Inter,system-ui,sans-serif;border:1px solid ' + (primary ? 'transparent' : '#E5E7EB') + ';background:' + (primary ? '#4F46E5' : '#fff') + ';color:' + (primary ? '#fff' : '#111827') + ';', label);
      b.type = 'button';
      b.addEventListener('click', function () { host.remove(); fn(); });
      row.appendChild(b);
      return b;
    }
    var first = btn('Paste with placeholders', true, opts.placeholders);
    if (opts.canPasteAnyway) btn('Paste anyway', false, opts.anyway);
    btn('Cancel', false, function () {});
    card.appendChild(row);
    root.appendChild(card);
    document.documentElement.appendChild(host);
    first.focus();
    host.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') host.remove(); });
  }

  function decide(target, text, result) {
    var live = result.findings.filter(function (f) { return f.action !== 'ALLOW'; });
    var stop = live.filter(function (f) { return f.action === 'BLOCK' || f.action === 'REDACT' || f.action === 'TOKENIZE'; });
    if (!stop.length) { insert(target, text); return; }
    var hard = stop.some(function (f) { return HARD[f.category] || (f.action === 'BLOCK' && !f.needsConfirmation); });
    prompt(result, {
      canPasteAnyway: !hard,
      placeholders: function () { insert(target, S.tokenize(text, result.findings).text); },
      anyway: function () { insert(target, text); },
    });
  }

  document.addEventListener('paste', function (e) {
    var target = e.target;
    if (!isEditable(target) || !e.clipboardData) return;
    if (e.clipboardData.files && e.clipboardData.files.length) return; // files are handled by the upload scanner
    var text = e.clipboardData.getData('text/plain');
    if (!text || text.length < 6 || text.length > MAX) return;

    if (S.isReady()) {
      var r = S.scan(text, {});
      if (!r.findings.some(function (f) { return f.action === 'BLOCK' || f.action === 'REDACT' || f.action === 'TOKENIZE'; })) return; // native paste
      e.preventDefault();
      e.stopImmediatePropagation();
      decide(target, text, r);
      return;
    }
    // Engine still loading: hold the paste, scan once ready, then act.
    e.preventDefault();
    e.stopImmediatePropagation();
    S.ready.then(function () { decide(target, text, S.scan(text, {})); }, function () { insert(target, text); });
  }, true);
})();
