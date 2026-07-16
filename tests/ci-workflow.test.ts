import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkflow(fileName: string) {
  const workflowPath = join(process.cwd(), ".github", "workflows", fileName);
  return readFileSync(workflowPath, "utf8");
}

describe("CI workflow launch behavior", () => {
  it("gates production deployment behind a manual workflow dispatch", () => {
    const workflow = readWorkflow("ci.yml");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("ALLOW_NETLIFY_MIRROR");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).not.toContain(
      "github.event_name == 'push' || github.event_name == 'workflow_dispatch'"
    );
    expect(workflow).toContain("[Emergency] Netlify mirror");
  });

  it("monitors production smoke on a schedule without requiring deploy credentials", () => {
    const workflow = readWorkflow("production-smoke.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('cron: "17 */6 * * *"');
    expect(workflow).toContain("node scripts/probe-production.mjs");
    expect(workflow).toContain("Close recovered outage issue");
    expect(workflow).toContain("state: 'closed'");
    expect(workflow).not.toContain("NETLIFY_AUTH_TOKEN");
    expect(workflow).not.toContain("labels: ['production-monitor', 'automated']");
  });

  it("keeps the resource library service role out of build and Lighthouse jobs", () => {
    const ci = readWorkflow("ci.yml");
    const lighthouse = readWorkflow("lighthouse.yml");
    const buildSteps = [
      ...ci.matchAll(/- name: 生产构建\s+run: pnpm run build\s+env:[\s\S]*?(?=\n\s+- name:)/g),
    ].map((match) => match[0]);

    // e2e 的 build step 已替换为下载 artifact，因此只有一个生产构建 step
    expect(buildSteps).toHaveLength(1);
    for (const step of buildSteps) {
      expect(step).not.toContain("RESOURCE_LIBRARY_SERVICE_ROLE_KEY");
      expect(step).not.toContain("NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY");
    }

    // SERVICE_ROLE_KEY 应仅在 start/server 环境出现（e2e 需要），不在 build 中
    const serviceRoleLines = ci.match(/^\s+RESOURCE_LIBRARY_SERVICE_ROLE_KEY:/gm) ?? [];
    expect(serviceRoleLines.length).toBeGreaterThanOrEqual(1);
    expect(ci).not.toContain("NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY");
    expect(lighthouse).not.toContain("RESOURCE_LIBRARY_SERVICE_ROLE_KEY");
    expect(lighthouse).not.toContain("NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY");
  });
});
