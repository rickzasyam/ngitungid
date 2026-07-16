import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Test hanya untuk lib MURNI (tanpa I/O, tanpa DB, tanpa React) — lihat
// lib/**/*.test.ts. Karena itu environment 'node', tanpa jsdom/plugin React.
// Alias '@' disamakan dengan tsconfig paths supaya import '@/...' resolve
// (financial-health.ts meng-import type dari components/).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
