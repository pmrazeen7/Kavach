// Renders public/og.svg to public/og.png (social preview). Run: npm run og
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const svg = readFileSync(new URL('../public/og.svg', import.meta.url))
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: true } }).render().asPng()
writeFileSync(new URL('../public/og.png', import.meta.url), png)
console.log('wrote public/og.png', png.length, 'bytes')
