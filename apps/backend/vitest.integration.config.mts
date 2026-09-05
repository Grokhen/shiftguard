import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./integration/setupEnv.ts'],
    include: ['integration/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
