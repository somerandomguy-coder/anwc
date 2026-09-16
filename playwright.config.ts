import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: [
    { command: 'npm run dev --workspace=@anwc/shop -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 30_000 },
    { command: 'npm run dev --workspace=@anwc/landing -- --host 127.0.0.1 --port 4176', url: 'http://127.0.0.1:4176', reuseExistingServer: !process.env.CI, timeout: 30_000 }
    , { command: 'npm run dev --workspace=@anwc/dashboard -- --host 127.0.0.1 --port 4177', url: 'http://127.0.0.1:4177', reuseExistingServer: !process.env.CI, timeout: 30_000 }
  ]
});
