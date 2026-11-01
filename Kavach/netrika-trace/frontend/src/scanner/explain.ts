import type { Finding } from './types'

/** Plain-language "why was this flagged", used by Lens. Never includes the value itself. */
export function explain(f: Finding): { headline: string; points: string[]; learn: string } {
  const pts: string[] = []
  const has = (r: string) => f.reasons.includes(r)

  if (has('exact-fingerprint-match')) pts.push('It exactly matches a secret registered from your own environment files. This is the strongest signal there is.')
  if (f.category === 'canary') pts.push('This value is a tripwire that was planted on purpose. Seeing it anywhere is treated as an incident.')
  if (has('known-format')) pts.push(`It has the exact structure of a ${f.label.toLowerCase()}.`)
  if (has('checksum-valid')) pts.push('Its check digits are valid, so it is a real number and not just digits that look similar.')
  if (has('no-keyword-needed') || has('random-looking')) pts.push('The characters look randomly generated rather than like a word, a name or an identifier.')
  if (has('implausible-as-a-word')) pts.push('The letter combinations are very unlikely in any language the scanner knows.')
  if (has('high-entropy')) pts.push('It is highly unpredictable (high entropy), which is typical of keys and passwords.')
  if (has('alone-in-message')) pts.push('It stands alone, which is how a pasted credential usually looks.')
  const ctx = f.reasons.find((r) => r.startsWith('ctx:'))
  const kw = f.reasons.find((r) => r.startsWith('kw:'))
  if (ctx && kw) pts.push(`It is introduced like a secret ("${kw.slice(3)}", ${ctx.slice(4)} style).`)
  if (has('assigned-value')) pts.push('It is assigned to a secret-looking name and is not a placeholder.')
  if (f.view !== 'plain') pts.push(`It was hidden: found after decoding or reassembling the text (${f.view.replace(/>/g, ' then ')}).`)
  if (has('spans-messages') || has('split-across-messages')) pts.push('It was split across several messages and put back together.')
  if (has('configured-internal-host') || has('configured-codename') || has('custom-pattern')) pts.push('It matches a rule your administrators configured.')
  if (has('nlp-entity')) pts.push('A language model recognised it as a personal or sensitive entity.')
  if (has('marked-safe') || has('confirmed-safe-once')) pts.push('You marked this safe, so it no longer interrupts you.')
  if (!pts.length) pts.push('It matched a sensitive-data rule.')

  const headline =
    f.category === 'suspicious'
      ? 'This looks like a secret, even though nothing labels it as one.'
      : f.category === 'fingerprint' || f.category === 'canary'
        ? 'This is one of your own secrets.'
        : f.category === 'financial'
          ? 'This is a financial identifier.'
          : f.category === 'pii'
            ? 'This is personal data.'
            : f.category === 'business'
              ? 'This is internal business information.'
              : 'This is a credential.'

  const learn = f.category === 'suspicious'
    ? 'Layer 2 scores every opaque token on length, randomness, how word-like its letters are, whether it is a known benign shape (UUID, hash, CSS class, path) and whether it stands alone. When in doubt it blocks, and asks you to confirm. Confirming only affects that exact token.'
    : f.category === 'fingerprint' || f.category === 'canary'
      ? 'Layer 4 compares every token and substring with keyed hashes of the secrets in your .env and config files. Only hashes are stored, never the values, and nothing here can be marked safe.'
      : f.layer === 3
        ? 'Layer 3 looks at how a value is introduced: labels in many languages, .env, YAML, JSON, export lines, curl headers and CLI flags. Context raises confidence; it is never required.'
        : 'Layer 1 recognises provider formats and validates checksums (Luhn, Verhoeff, IBAN, GSTIN) to avoid false alarms on look-alike numbers.'
  return { headline, points: pts, learn }
}

export function riskColor(f: Finding): 'danger' | 'warn' | 'success' {
  if (f.action === 'ALLOW') return 'success'
  return f.action === 'BLOCK' && !f.needsConfirmation ? 'danger' : f.category === 'suspicious' || f.action === 'WARN' || f.needsConfirmation ? 'warn' : 'danger'
}
