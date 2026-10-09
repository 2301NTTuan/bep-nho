import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'pnpm --filter @bep-nho/api start',
      url: 'http://127.0.0.1:3001/v1/health/ready',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { ...process.env, NODE_ENV: 'test', MAIL_TRANSPORT: 'memory', PORT: '3001' },
    },
    {
      command: 'pnpm --filter @bep-nho/web start',
      url: 'http://127.0.0.1:3000',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { ...process.env, NODE_ENV: 'production' },
    },
  ],
});
