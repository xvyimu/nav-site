import { describe, expect, it, vi } from "vitest";

type ReadinessModule = typeof import("../scripts/check-launch-readiness.mjs");

async function importReadinessModule(): Promise<ReadinessModule> {
  return import("../scripts/check-launch-readiness.mjs");
}

describe("scripts/check-launch-readiness", () => {
  it("defaults to the verified custom Vercel production domain", async () => {
    const { readConfigFromEnv } = await importReadinessModule();

    expect(readConfigFromEnv({} as NodeJS.ProcessEnv, []).baseUrl).toBe(
      "https://yuanjia1314.ccwu.cc"
    );
  });

  it("parses branch ahead state and ignores allowed local planning files", async () => {
    const { parseGitStatus } = await importReadinessModule();

    expect(
      parseGitStatus(
        [
          "## master...origin/master [ahead 1]",
          "?? .planning/",
          " M scripts/check-launch-readiness.mjs",
        ].join("\n"),
        [".planning/"]
      )
    ).toEqual({
      branch: "master",
      ahead: 1,
      behind: 0,
      dirty: ["scripts/check-launch-readiness.mjs"],
    });
  });

  it("fails readiness when local commits are not pushed or latest production is not deployed", async () => {
    const { evaluateReadiness } = await importReadinessModule();

    const report = evaluateReadiness({
      git: {
        branch: "master",
        ahead: 1,
        behind: 0,
        dirty: [],
      },
      currentProductionResults: [{ name: "home", ok: true, detail: "ok", status: 200 }],
      latestProductionResults: [
        {
          name: "build-info",
          ok: false,
          detail: "expected build commit abc, got old",
          status: 200,
        },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "git-pushed")).toMatchObject({
      ok: false,
      detail: "ahead=1, behind=0",
    });
    expect(report.checks.find((check) => check.name === "latest-deployed")?.detail).toContain(
      "expected build commit"
    );
  });

  it("collects local readiness facts without network when requested", async () => {
    const { collectLaunchReadiness } = await importReadinessModule();
    const execFileImpl = vi.fn(async (_command: string, args: string[]) => {
      if (args.join(" ") === "rev-parse HEAD") {
        return { stdout: "abcdef1234567890\n" };
      }

      return {
        stdout: ["## master...origin/master", "?? .planning/"].join("\n"),
      };
    });

    const report = await collectLaunchReadiness({
      config: {
        baseUrl: "https://nav-site.example",
        expectedCommit: "",
        json: false,
        skipNetwork: true,
        allowedDirtyPaths: [".planning/"],
      },
      execFileImpl: execFileImpl as never,
      fetchImpl: vi.fn() as never,
    });

    expect(report.expectedCommit).toBe("abcdef1234567890");
    expect(report.git).toMatchObject({ branch: "master", ahead: 0, behind: 0, dirty: [] });
    expect(report.checks.find((check) => check.name === "production-smoke")).toMatchObject({
      ok: false,
      detail: "network checks skipped",
    });
  });
});
