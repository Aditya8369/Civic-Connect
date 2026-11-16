import { defineConfig } from 'vitest/config'

// Firestore security rules require a running emulator. They are kept in a
// separate project configuration so `npm test` (unit/UI tests) stays emulator-free.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
