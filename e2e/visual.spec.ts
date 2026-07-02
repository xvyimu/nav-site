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

        // 截图 h1.nav-display（标题+字号+字重），而非全 section:
        // 移动端下分类胶囊按钮数量变化导致 section 高度波动（933px ↔ 1045px），
        // mask 仅遮住按钮外观，不改变布局高度。标题区域 100% 稳定，不受 DB 数据影响。
        await expect(page.locator("h1.nav-display")).toHaveScreenshot("hero-heading.png", {
            animations: "disabled",
            timeout: 15000,
            maxDiffPixelRatio: 0.05,
        });
    });
});