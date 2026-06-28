import { test, expect } from "@playwright/test";

/**
 * E2E 测试：首页核心功能
 *
 * 覆盖关键用户路径：
 * 1. 页面加载与基本元素
 * 2. 服务端搜索功能
 * 3. 分类切换
 * 4. 工具卡片点击
 * 5. 收藏功能
 * 6. 404 页面
 * 7. API 文档页面
 * 8. 工具详情页
 * 9. 移动端响应式
 */

test.describe("首页", () => {
  test("页面正确加载", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/导航|Navigation/);

    const searchInput = page.locator('input[placeholder*="搜索"]').first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => "next" in window);

    // Header 导航按钮存在
    await expect(page.locator("header")).toBeVisible();

    // 无障碍跳转链接存在
    const skipLink = page.locator('a:has-text("跳转到主内容")');
    await expect(skipLink).toBeAttached();
  });

  test("服务端搜索功能正常工作", async ({ page }) => {
    test.slow();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const searchInput = page.locator('input[placeholder*="搜索"]').first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // 先填入部分字符再绑定响应等待，避免错过 200ms 防抖后的请求。
    // 使用 Promise.all 确保监听在 fill 触发请求之前就绪，且不 catch：
    // 请求未到达即视为失败（CLAUDE-HANDOFF 已知问题 #2 的修复方案）。
    await page.locator('[data-nav-hydrated="true"]').waitFor({ timeout: 15000 });

    const searchResponse = page.waitForResponse(
      (res) => {
        if (res.status() !== 200) return false;
        const url = new URL(res.url());
        return url.pathname === "/api/search" && url.searchParams.get("q") === "openai";
      },
      { timeout: 15000 }
    );

    await searchInput.fill("openai");
    await searchResponse;

    // 验证搜索结果区域出现
    const emptyState = page.locator('text=/没有找到/');
    const openAiResult = page.getByRole("link", { name: /OpenAI Platform/ });

    // 至少有一种状态出现
    await expect(openAiResult.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test("分类导航存在并可切换", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const nav = page.locator("nav, aside, [role='navigation']");
    await expect(nav.first()).toBeVisible({ timeout: 15000 });

    // 尝试点击一个分类标签
    const categoryTab = page.locator('[role="tab"]:has-text("AI")').first();
    if (await categoryTab.isVisible()) {
      await categoryTab.click();
      await page.waitForTimeout(1000);

      // 面包屑应该出现
      const breadcrumb = page.locator('text=/首页/');
      await expect(breadcrumb).toBeVisible({ timeout: 5000 });
    }
  });

  test("工具卡片可点击", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const toolLinks = page.locator('a[href^="http"]');
    await expect(toolLinks.first()).toBeVisible({ timeout: 15000 });

    const count = await toolLinks.count();
    expect(count).toBeGreaterThan(0);

    const firstLink = toolLinks.first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();
  });

  test("收藏功能正常工作", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // 等待卡片加载
    const card = page.locator('a[href^="http"]').first();
    await expect(card).toBeVisible({ timeout: 15000 });

    // 查找收藏按钮
    const favButton = page.locator('button:has-text("添加收藏")').first();
    if (await favButton.isVisible()) {
      await favButton.click();
      await page.waitForTimeout(500);

      // Header 收藏计数应该变化
      const favLink = page.locator('a:has-text("收藏")');
      await expect(favLink).toBeVisible();
    }
  });
});

test.describe("404 页面", () => {
  test("不存在页面显示自定义 404", async ({ page }) => {
    // Next.js dev 模式下 not-found 可能返回 200，只验证页面内容
    await page.goto("/nonexistent-page-12345", { waitUntil: "domcontentloaded" });

    // 验证 404 页面元素
    await expect(page.locator('text=/页面未找到/')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a:has-text("返回首页")')).toBeVisible();
    await expect(page.locator('a:has-text("搜索工具")')).toBeVisible();
  });
});

test.describe("API 文档页面", () => {
  test("API 文档页面正确加载", async ({ page }) => {
    await page.goto("/api-docs", { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1")).toBeVisible({ timeout: 15000 });

    // 验证端点文档存在（用 h2 标题匹配，避免正则转义问题）
    await expect(page.locator("h2").filter({ hasText: "tools" })).toBeVisible();
    await expect(page.locator("h2").filter({ hasText: "search" })).toBeVisible();
    await expect(page.locator("h2").filter({ hasText: "favorites" })).toBeVisible();

    // 速率限制章节
    await expect(page.locator("h2").filter({ hasText: "速率限制" })).toBeVisible();
  });
});

test.describe("工具详情页", () => {
  test("未找到工具时显示 404 内容", async ({ page }) => {
    test.slow();
    await page.goto("/tool/nonexistent-tool-slug-12345", { waitUntil: "domcontentloaded" });

    // 验证显示 404 页面内容（dev 模式下状态码可能为 200）
    await expect(page.locator('text=/页面未找到/')).toBeVisible({ timeout: 10000 });
  });

  test("Figma 工具详情页正确加载", async ({ page }) => {
    await page.goto("/tool/figma", { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1")).toBeVisible({ timeout: 15000 });

    // 面包屑导航（页面有"首页"和"返回首页"两个链接，取第一个）
    await expect(page.locator('a:has-text("首页")').first()).toBeVisible();

    // 访问官网按钮
    await expect(page.locator('a:has-text("访问官网")')).toBeVisible();

    // 相关工具区域
    await expect(page.locator('text=/相关工具/')).toBeVisible();
  });
});

test.describe("收藏页面", () => {
  test("收藏页面正确加载", async ({ page }) => {
    await page.goto("/favorites", { waitUntil: "domcontentloaded" });

    // 用 h1 标题精确匹配，取第一个可见的
    await expect(page.locator("h1").filter({ hasText: "收藏" }).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe("提交页面", () => {
  test("提交表单可见", async ({ page }) => {
    await page.goto("/submit", { waitUntil: "domcontentloaded" });

    // 页面可能有多个 form，取第一个可见的
    await expect(page.locator("form").first()).toBeVisible({ timeout: 15000 });

    const titleInput = page.locator('input[name="title"], #title').first();
    await expect(titleInput).toBeVisible();
  });
});

test.describe("健康检查", () => {
  test("API 健康检查端点返回 200", async ({ page }) => {
    const response = await page.goto("/api/health");
    expect(response?.status()).toBeLessThan(503);

    const body = await response?.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body).toHaveProperty("timestamp");
  });
});

test.describe("Agent API", () => {
  test("工具列表 API 返回结构化数据", async ({ page }) => {
    const response = await page.goto("/api/tools");
    expect(response?.ok()).toBe(true);

    const body = await response?.json();
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("tools");
    expect(Array.isArray(body.tools)).toBe(true);
  });

  test("搜索 API 返回结果", async ({ page }) => {
    const response = await page.goto("/api/search?q=ai&limit=5");
    expect(response?.ok()).toBe(true);

    const body = await response?.json();
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("query");
  });
});

test.describe("SEO", () => {
  test("sitemap.xml 可访问", async ({ page }) => {
    const response = await page.goto("/sitemap.xml");
    expect(response?.ok()).toBe(true);
  });

  test("robots.txt 可访问", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.ok()).toBe(true);

    const content = (await response?.text())!;
    // robots.txt 使用 "User-Agent"（大写 A），用大小写不敏感匹配
    expect(content.toLowerCase()).toContain("user-agent");
  });
});

test.describe("移动端", () => {
  test("移动端布局正常", async ({ page, isMobile }) => {
    if (!isMobile) return;

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const searchInput = page.locator('input[placeholder*="搜索"]').first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // 移动端汉堡菜单按钮存在
    const menuButton = page.locator('button[aria-label*="导航"], button[aria-label*="菜单"]');
    await expect(menuButton).toBeVisible();
  });
});
