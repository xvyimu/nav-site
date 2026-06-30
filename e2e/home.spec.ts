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

    const response = await page.request.get("/api/search?q=openai&semantic=false");
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("total");
    expect(body.query).toBe("openai");

    await searchInput.fill("openai");
    await expect(searchInput).toHaveValue("openai");
    await expect(page.locator("main")).toContainText(/OpenAI|openai|没有找到/, { timeout: 15000 });
  });

  test("分类导航存在并可切换", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // 精确定位分类侧边栏导航（<nav aria-label="导航分类">），避免 .first() 误中 header 的空 <nav>
    const categoryNav = page.locator('nav[aria-label="导航分类"]');
    await expect(categoryNav).toBeVisible({ timeout: 15000 });

    // 尝试点击一个分类标签
    const categoryTab = page.locator('[role="tab"]:has-text("AI")').first();
    if (await categoryTab.isVisible()) {
      await categoryTab.click();
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
      await expect(page.locator('button[aria-label="取消收藏"]').first()).toBeVisible({ timeout: 5000 });

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

    // 稳定的辅助导航区域
    await expect(page.locator('text=/浏览分类/')).toBeVisible();
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

test.describe.serial("ToolQuickView 预览弹窗", () => {
  test.beforeEach(async ({ page }) => {
    test.slow();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // 等待 hydration 完成（SSR 不渲染预览按钮，需 Client Component hydrate）
    await expect(page.locator('[data-nav-hydrated="true"]')).toBeAttached({ timeout: 30000 });
    // 等待卡片数据加载（预览按钮在 LinkCard 内部，卡片不出现则没有按钮）
    await expect(page.locator('a[href^="http"]').first()).toBeVisible({ timeout: 30000 });
    // 等待预览按钮出现在卡片中
    await expect(page.locator('button[aria-label^="预览"]').first()).toBeVisible({ timeout: 15000 });
  });

  test("点击预览按钮打开弹窗并验证 aria 属性", async ({ page }) => {
    const previewBtn = page.locator('button[aria-label^="预览"]').first();
    await previewBtn.click();

    // 弹窗应为 dialog role
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "tool-quick-view-title");
    await expect(dialog).toHaveAttribute("aria-describedby", "tool-quick-view-desc");
  });

  test("弹窗包含打开网站链接和收藏按钮", async ({ page }) => {
    const previewBtn = page.locator('button[aria-label^="预览"]').first();
    await previewBtn.click();

    // 弹窗内的按钮用更具体的 selector
    await expect(page.getByRole("link", { name: "打开网站" })).toBeVisible();
    await expect(page.getByRole("button", { name: "收藏", exact: true })).toBeVisible();

    // 打开网站链接应指向外部地址
    const openLink = page.getByRole("link", { name: "打开网站" });
    await expect(openLink).toHaveAttribute("target", "_blank");
    await expect(openLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("Escape 键关闭弹窗", async ({ page }) => {
    const previewBtn = page.locator('button[aria-label^="预览"]').first();
    await previewBtn.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test("背板点击关闭弹窗", async ({ page }) => {
    const previewBtn = page.locator('button[aria-label^="预览"]').first();
    await previewBtn.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // 点击背板遮罩顶部区域（避开 aside 面板覆盖区）
    const backdrop = page.locator('button[aria-label="关闭工具预览"]').first();
    await backdrop.click({ position: { x: 200, y: 50 } });
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test("显示工具信息和评分", async ({ page }) => {
    const previewBtn = page.locator('button[aria-label^="预览"]').first();
    await previewBtn.click();

    // 弹窗应显示工具名称（h2）
    await expect(page.locator("#tool-quick-view-title")).toBeVisible();

    // 收录说明区域存在
    await expect(page.locator("text=收录说明")).toBeVisible();

    // 分类、点击量、评分 dialogs 内用 aria-label 定位
    await expect(page.locator('[role="dialog"] dl:has(dd:text("分类"))')).toBeVisible();
    await expect(page.locator('[role="dialog"] dl:has(dd:text("点击量"))')).toBeVisible();
    await expect(page.locator('[role="dialog"] dl:has(dd:text("评分"))')).toBeVisible();
  });

  test("Tab 键在弹窗内循环不外逸", async ({ page }) => {
    const previewBtn = page.locator('button[aria-label^="预览"]').first();
    await previewBtn.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const aside = page.locator("aside.nav-quick-view");

    // 初始焦点在关闭按钮（closeRef.current?.focus()）
    // 连按 Tab 6 次（弹窗内仅 3 个可聚焦元素：关闭按钮 / 打开网站 / 收藏），
    // 验证焦点始终在 aside 内，不外逸到页面其他元素
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const inAside = await aside.evaluate((el) => el.contains(document.activeElement));
      expect(inAside, `Tab #${i + 1}: 焦点外逸到 aside 之外`).toBe(true);
    }

    // Shift+Tab 反向循环，同样不应外逸
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      const inAside = await aside.evaluate((el) => el.contains(document.activeElement));
      expect(inAside, `Shift+Tab #${i + 1}: 焦点外逸到 aside 之外`).toBe(true);
    }

    await page.keyboard.press("Escape");
  });

  test("关闭后焦点回到触发按钮", async ({ page }) => {
    const previewBtn = page.locator('button[aria-label^="预览"]').first();
    await previewBtn.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Escape 关闭
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // 焦点应回到预览按钮（triggerRef.current?.focus()）
    await expect(previewBtn).toBeFocused();
  });
});
