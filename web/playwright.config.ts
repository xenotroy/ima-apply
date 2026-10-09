import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.IMA_TEST_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid IMA_TEST_PORT.');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.IMA_BROWSER_CHANNEL || undefined,
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && process.env.IMA_REUSE_DEV_SERVER === '1',
  },
});
