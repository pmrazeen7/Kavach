/**
 * Entry point for the browser-extension bundle (extension/kavach-scanner.js).
 * Exposes the same engine the web app uses, so pastes into AI chat sites are
 * inspected locally before the text reaches the page.
 */
import { init, scan } from './engine'
import { redact, tokenize } from './rewrite'

let ready = false
const promise = init().then(() => {
  ready = true
})

;(window as unknown as { KavachScanner: unknown }).KavachScanner = {
  ready: promise,
  isReady: () => ready,
  scan,
  tokenize,
  redact,
}
