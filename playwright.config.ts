import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  // Windows' first Vite/WebView dependency load can take most of the default 30s.
  timeout: 60000,
  use: { baseURL: 'http://localhost:1420', channel: 'msedge' },
  webServer: { command: 'npm run dev -- --host localhost', url: 'http://localhost:1420', reuseExistingServer: true },
});
