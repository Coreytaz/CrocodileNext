import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  expect: { timeout: 8000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 1100 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run build && npm start",
      cwd: "../crocodile-backend",
      port: 10099,
      env: { PORT: "10099", ALLOWED_ORIGIN: "http://localhost:3100" },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100",
      env: {
        NEXT_PUBLIC_SOCKET_URL: "http://localhost:10099",
        NEXT_DIST_DIR: ".next-e2e",
      },
      reuseExistingServer: false,
    },
  ],
});
