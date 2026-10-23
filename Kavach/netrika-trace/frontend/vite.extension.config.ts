import { defineConfig } from 'vite'
import { resolve } from 'node:path'

/** Builds the scanner engine into one self-contained script for the browser extension. */
export default defineConfig({
  publicDir: false,
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: resolve(__dirname, '../extension'),
    emptyOutDir: false,
    target: 'es2020',
    minify: 'esbuild',
    lib: { entry: resolve(__dirname, 'src/scanner/extension-entry.ts'), formats: ['iife'], name: 'KavachScannerBundle', fileName: () => 'kavach-scanner.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
