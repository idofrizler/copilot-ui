import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 0,
  // Run test files in parallel, but tests within each file run sequentially
  // This allows multiple Electron instances with different user data dirs
  fullyParallel: false,
  workers: process.env.CI ? 2 : 4,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron',
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
