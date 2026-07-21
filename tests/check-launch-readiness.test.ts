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

  it("derives the embedding expectation from readiness configuration", async () => {
    const { readConfigFromEnv } = await importReadinessModule();

    expect(readConfigFromEnv({
      NODE_ENV: "test",
      HEALTH_REQUIRE_EMBEDDING: "1",
    } as NodeJS.ProcessEnv, [])).toMatchObject({
      requireEmbedding: true,
      expectEmbeddingSkipped: false,
    });
    expect(readConfigFromEnv({} as NodeJS.ProcessEnv, ["--expect-embedding-skipped"])).toMatchObject({
      requireEmbedding: false,
      expectEmbeddingSkipped: true,
    });
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
        requireEmbedding: false,
        expectEmbeddingSkipped: false,
        allowedDirtyPaths: [".planning/"],
        distributedRateLimitConfig: {
          name: "distributed-rate-limit-config",
          ok: true,
          detail: "soft mode (Upstash optional)",
        },
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

  it("validates distributed rate limit fail-closed consistency with Upstash credentials", async () => {
    const { evaluateDistributedRateLimitConfig, evaluateReadiness } = await importReadinessModule();

    const missing = evaluateDistributedRateLimitConfig({
      DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED: "1",
    } as NodeJS.ProcessEnv);
    expect(missing).toMatchObject({
      name: "distributed-rate-limit-config",
      ok: false,
    });
    expect(missing.detail).toContain("fail-closed requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");

    const configured = evaluateDistributedRateLimitConfig({
      DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED: "1",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    } as NodeJS.ProcessEnv);
    expect(configured).toMatchObject({
      name: "distributed-rate-limit-config",
      ok: true,
    });

    const soft = evaluateDistributedRateLimitConfig({} as NodeJS.ProcessEnv);
    expect(soft).toMatchObject({
      name: "distributed-rate-limit-config",
      ok: true,
    });

    const report = evaluateReadiness({
      git: { branch: "master", ahead: 0, behind: 0, dirty: [] },
      networkSkipped: true,
      distributedRateLimitConfig: missing,
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "distributed-rate-limit-config")).toMatchObject({
      ok: false,
    });
  });
});
