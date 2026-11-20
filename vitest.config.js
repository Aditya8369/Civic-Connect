import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    clearMocks: true,
    restoreMocks: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: true,
        singleFork: true,
      },
    },
  },
})
