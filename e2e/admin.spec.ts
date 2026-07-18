import { expect, test } from "@playwright/test";
import {
  hasAdminTestSession,
  installAdminTestSession,
} from "./helpers/admin-session";

test.describe("管理后台访问控制", () => {
  test("未登录访问后台会跳转到登录页", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "登录管理后台" })).toBeVisible();
  });

  test("未登录访问后台 API 返回 401", async ({ request }) => {
    const response = await request.get("/api/admin/links");

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "未授权" });
  });
});

test.describe("后台登录页", () => {
  test("密码控件与可见性切换可用", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const password = page.getByLabel("管理员密码");
    await expect(password).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "登录" })).toBeEnabled();

    await page.getByRole("button", { name: "显示密码" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "隐藏密码" })).toBeVisible();
  });

  test("页面在当前视口没有横向溢出", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  });
});

test.describe("已认证管理后台", () => {
  test.skip(
    !hasAdminTestSession(),
    "Set E2E_AUTH_SECRET to the same value as the test server AUTH_SECRET"
  );

  test.beforeEach(async ({ context, baseURL }) => {
    await installAdminTestSession(context, baseURL);
  });

  test("链接工作台支持筛选并打开只读表单流程", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "链接工作台" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("navigation", { name: "管理后台导航" })).toBeVisible();
    await expect(page.getByRole("region", { name: "链接概览" })).toBeVisible();

    const searchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/admin/links" && url.searchParams.get("q") === "e2e-no-match";
    });
    await page.getByPlaceholder("搜索标题或网址").fill("e2e-no-match");
    expect((await searchResponse).status()).toBe(200);
    await expect(page.getByText("暂无匹配链接")).toBeVisible();

    await page.getByRole("button", { name: "新增链接" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "新增链接" })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /^标题/ })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /^网址/ })).toBeVisible();
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeHidden();
  });

  test("分类页支持导航、搜索与打开只读表单流程", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "链接工作台" })).toBeVisible({
      timeout: 20_000,
    });

    // 桌面侧栏与移动顶栏各有一份导航；取当前可见的「分类管理」链接并等待路由完成
    const categoriesLink = page
      .getByRole("link", { name: "分类管理" })
      .filter({ visible: true })
      .first();
    await expect(categoriesLink).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/admin\/categories(?:\?.*)?$/, { timeout: 20_000 }),
      categoriesLink.click(),
    ]);
    await expect(page.getByRole("heading", { name: "分类管理" })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByPlaceholder("搜索名称或标识").fill("e2e-no-match");
    await expect(page.getByText("暂无匹配分类")).toBeVisible();

    await page.getByRole("button", { name: "新增分类" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "新增分类" })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /^名称/ })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /^标识/ })).toBeVisible();
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeHidden();
  });

  test("后台在当前视口没有横向溢出", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "链接工作台" })).toBeVisible({
      timeout: 20_000,
    });

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  });
});
