import { test, expect } from "@playwright/test";

/**
 * 视觉回归测试
 *
 * 基准在 Windows 本机生成并提交；GitHub Actions（Linux）跳过，因为字体/抗锯齿渲染
 * 在不同 OS 上会产生假阳性差异。如需启用 CI 视觉回归，需在 Linux 环境
 * 重新生成基准（参见 CLAUDE-HANDOFF.md）。
 *
 * 更新基准：pnpm exec playwright test e2e/visual.spec.ts --update-snapshots
 */
test.describe("视觉回归", () => {
  test.skip(process.env.GITHUB_ACTIONS === "true", "视觉基准为 Windows 生成，Linux CI 跳过");

  test("首页 hero 视觉一致", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // 等 hero 标题渲染完成
    await expect(page.locator("h1.nav-display")).toBeVisible({ timeout: 15000 });
    // 等 hydrate 后的客户端样式稳定
    await page.locator('[data-nav-hydrated="true"]').waitFor({ timeout: 15000 }).catch(() => {});

    // 遮住 .tabular-nums（工具/分组/精选计数、tab 计数），避免 DB 数据变化导致基准漂移
    await expect(page.locator("section.nav-hero-bg")).toHaveScreenshot("hero.png", {
      animations: "disabled",
      mask: [page.locator(".tabular-nums")],
    });
  });
});
