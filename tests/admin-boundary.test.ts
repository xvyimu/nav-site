import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminComponents = [
  "AdminWorkspace.tsx",
  "CategoryManager.tsx",
  "LinkForm.tsx",
  "admin-queries.ts",
  "useAdminLinks.ts",
];

/** 读取管理前端 module，供静态 seam 约束测试复用。 */
function readAdminComponent(fileName: string): string {
  return readFileSync(join(process.cwd(), "components", "admin", fileName), "utf8");
}

describe("管理后台前后端 seam", () => {
  it("禁止 React module 直接依赖 repository 或管理 API URL", () => {
    for (const fileName of adminComponents) {
      const source = readAdminComponent(fileName);
      expect(source, fileName).not.toContain("@/lib/repositories");
      expect(source, fileName).not.toContain("/api/admin");
    }
  });

  it("把管理 API URL 集中在唯一浏览器 adapter", () => {
    const source = readFileSync(
      join(process.cwd(), "lib", "admin", "client.ts"),
      "utf8"
    );

    expect(source).toContain("/api/admin/links");
    expect(source).toContain("/api/admin/categories");
    expect(source).toContain("/api/admin/tags");
    expect(source).toContain("createAdminContentApi");
  });

  it("禁止管理 Route Handler 回退到全域 repository facade", () => {
    const routeFiles = [
      ["links", "route.ts"],
      ["links", "[id]", "route.ts"],
      ["categories", "route.ts"],
      ["categories", "[id]", "route.ts"],
      ["tags", "route.ts"],
      ["tags", "[id]", "route.ts"],
      ["link-health", "route.ts"],
    ];

    for (const segments of routeFiles) {
      const source = readFileSync(
        join(process.cwd(), "app", "api", "admin", ...segments),
        "utf8"
      );
      expect(source, segments.join("/")).not.toContain(
        'from "@/lib/repositories"'
      );
    }
  });
});

