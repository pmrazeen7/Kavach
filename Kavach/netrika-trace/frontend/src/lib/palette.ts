/** Lets any component open the command palette without prop drilling. */
export const PALETTE_EVENT = 'netrika:palette'

export function openPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT))
}
