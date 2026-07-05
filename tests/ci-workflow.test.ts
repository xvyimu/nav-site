import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkflow(fileName: string) {
  const workflowPath = join(process.cwd(), ".github", "workflows", fileName);
  return readFileSync(workflowPath, "utf8");
}

describe("CI workflow launch behavior", () => {
  it("allows a manual production deployment run after external blockers are cleared", () => {
    const workflow = readWorkflow("ci.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain(
      "github.ref == 'refs/heads/master' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')"
    );
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
});
