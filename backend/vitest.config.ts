import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run integration tests sequentially — they share a real DB and must not
    // collide with each other. Each test file gets its own isolated run.
    pool:        'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,   // DB operations can be slow in CI
    hookTimeout: 30_000,
    // Only pick up files under tests/integration/
    include: ['tests/**/*.test.ts'],
    // Environment variables for tests — DATABASE_URL and JWT secrets must be
    // set in the shell or a .env.test file. We do NOT hardcode credentials here.
    env: {
      NODE_ENV: 'test',
    },
  },
});
