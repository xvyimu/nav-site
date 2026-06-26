import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 测试配置
 *
 * 运行方式：
 *   npm run e2e         — 运行所有 E2E 测试
 *   npm run e2e:ui      — 交互式 UI 模式
 *   npm run e2e:headed  — 有头模式（可见浏览器）
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30000,

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3264",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: process.env.E2E_DEV_COMMAND || "npm run dev",
        url: process.env.E2E_BASE_URL || "http://localhost:3264",
        reuseExistingServer: true,
        timeout: 60000,
      },
});
