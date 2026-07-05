import { describe, expect, it, vi } from "vitest";

type TestLogger = Pick<Console, "log" | "error">;

type Deploy = {
  id: string;
  state?: string;
  branch?: string;
  commit_ref?: string;
  commit_sha?: string;
  commit?: string;
  sha?: string;
  review_id?: string;
  created_at?: string;
  deploy_ssl_url?: string;
  error_message?: string;
  failure_reason?: string;
  message?: string;
};

async function importDeployModule() {
  return import("../scripts/wait-netlify-deploy.mjs");
}

function asFetch(fetchImpl: unknown): typeof fetch {
  return fetchImpl as typeof fetch;
}

function asConsole(logger: TestLogger): Console {
  return logger as unknown as Console;
}

describe("scripts/wait-netlify-deploy", () => {
  it("is importable without CI environment variables", async () => {
    const originalToken = process.env.NETLIFY_AUTH_TOKEN;
    const originalSiteId = process.env.NETLIFY_SITE_ID;
    const originalSha = process.env.GITHUB_SHA;
    delete process.env.NETLIFY_AUTH_TOKEN;
    delete process.env.NETLIFY_SITE_ID;
    delete process.env.GITHUB_SHA;

    try {
      const mod = await importDeployModule();
      expect(mod.candidateValues).toBeTypeOf("function");
      expect(mod.findMatchingDeploy).toBeTypeOf("function");
    } finally {
      if (originalToken === undefined) delete process.env.NETLIFY_AUTH_TOKEN;
      else process.env.NETLIFY_AUTH_TOKEN = originalToken;
      if (originalSiteId === undefined) delete process.env.NETLIFY_SITE_ID;
      else process.env.NETLIFY_SITE_ID = originalSiteId;
      if (originalSha === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = originalSha;
    }
  });

  it("matches mirrored Git deploys by branch and created_at fallback", async () => {
    const { findMatchingDeploy } = await importDeployModule();
    const deploys: Deploy[] = [
      {
        id: "old-main",
        state: "ready",
        branch: "main",
        created_at: "2026-07-05T01:59:59Z",
      },
      {
        id: "fresh-master",
        state: "ready",
        branch: "master",
        created_at: "2026-07-05T02:01:00Z",
      },
      {
        id: "fresh-main",
        state: "building",
        branch: "main",
        created_at: "2026-07-05T02:01:00Z",
      },
    ];

    const match = findMatchingDeploy(deploys, {
      targetSha: "abcdef1234567890",
      targetBranch: "main",
      targetDeployId: undefined,
      createdAfter: Date.parse("2026-07-05T02:00:00Z"),
    });

    expect(match?.id).toBe("fresh-main");
  });

  it("matches deploys by full or short commit fields", async () => {
    const { findMatchingDeploy } = await importDeployModule();
    const deploys: Deploy[] = [
      {
        id: "wrong-branch",
        branch: "master",
        commit_ref: "abcdef1",
        created_at: "2026-07-05T02:01:00Z",
      },
      {
        id: "right-branch",
        branch: "main",
        commit_sha: "abcdef1234567890",
        created_at: "2026-07-05T02:01:00Z",
      },
    ];

    const match = findMatchingDeploy(deploys, {
      targetSha: "abcdef1234567890",
      targetBranch: "main",
      targetDeployId: undefined,
      createdAfter: Number.NaN,
    });

    expect(match?.id).toBe("right-branch");
  });

  it("matches deploys by explicit deploy id before commit fallbacks", async () => {
    const { findMatchingDeploy } = await importDeployModule();
    const deploys: Deploy[] = [
      {
        id: "fallback-created-at",
        branch: "main",
        created_at: "2026-07-05T02:01:00Z",
      },
      {
        id: "target-deploy",
        branch: "production-branch",
        created_at: "2026-07-05T02:00:30Z",
      },
    ];

    const match = findMatchingDeploy(deploys, {
      targetSha: "abcdef1234567890",
      targetBranch: "main",
      targetDeployId: "target-deploy",
      createdAfter: Date.parse("2026-07-05T02:00:00Z"),
    });

    expect(match?.id).toBe("target-deploy");
  });

  it("triggers a Netlify build for the target branch", async () => {
    const { triggerNetlifyBuild } = await importDeployModule();
    const logger = { log: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "build-1",
        deploy_id: "deploy-1",
        sha: "abcdef1234567890",
      }),
    }));

    const build = await triggerNetlifyBuild({
      config: {
        token: "test-token",
        siteId: "site-id",
        targetSha: "abcdef1234567890",
        targetBranch: "main",
        buildBranch: "main",
        buildTitle: "CI deploy abcdef1",
        clearCache: false,
      },
      fetchImpl: asFetch(fetchImpl),
      logger: asConsole(logger),
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    const requestUrl = url;
    expect(requestUrl.pathname).toBe("/api/v1/sites/site-id/builds");
    expect(requestUrl.searchParams.get("branch")).toBe("main");
    expect(requestUrl.searchParams.get("title")).toBe("CI deploy abcdef1");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "User-Agent": "nav-site-ci",
      },
    });
    expect(build.deploy_id).toBe("deploy-1");
  });

  it("fails fast before triggering a build when recent Netlify credits are exhausted", async () => {
    const { main } = await importDeployModule();
    const logger = { log: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "credit-blocked",
          state: "error",
          branch: "main",
          created_at: "2026-07-05T02:01:00Z",
          error_message: "Skipped due to account credit usage exceeded",
        },
      ],
    }));

    await expect(
      main({
        env: {
          NETLIFY_AUTH_TOKEN: "test-token",
          NETLIFY_SITE_ID: "site-id",
          NETLIFY_TRIGGER_BUILD: "true",
          NETLIFY_DEPLOY_BRANCH: "main",
          NETLIFY_CREDIT_BLOCK_PREFLIGHT_WINDOW_MS: "99999999999",
          GITHUB_SHA: "abcdef1234567890",
        } as unknown as NodeJS.ProcessEnv,
        fetchImpl: asFetch(fetchImpl),
        logger: asConsole(logger),
      })
    ).rejects.toThrow("Netlify account credit usage exceeded");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const fetchCalls = fetchImpl.mock.calls as unknown as Array<[URL, RequestInit?]>;
    const firstInit = fetchCalls[0]?.[1];
    expect(firstInit?.method).not.toBe("POST");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("account credit preflight blocked deploy trigger")
    );
  });

  it("waits once, writes the deploy URL, and returns the ready deploy", async () => {
    const { waitForNetlifyDeploy } = await importDeployModule();
    const output: string[] = [];
    const logger = { log: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "deploy-1",
          state: "ready",
          branch: "main",
          commit_ref: "abcdef1",
          created_at: "2026-07-05T02:01:00Z",
          deploy_ssl_url: "https://nav-site.netlify.app",
        },
      ],
    }));

    const deploy = await waitForNetlifyDeploy({
      config: {
        token: "test-token",
        siteId: "site-id",
        targetSha: "abcdef1234567890",
        targetBranch: "main",
        createdAfter: Number.NaN,
        timeoutMs: 1000,
        intervalMs: 1,
      },
      fetchImpl: asFetch(fetchImpl),
      sleep: vi.fn(),
      writeOutput: (url: string) => output.push(url),
      logger: asConsole(logger),
      now: (() => {
        let value = 0;
        return () => value++;
      })(),
    });

    expect(deploy.id).toBe("deploy-1");
    expect(output).toEqual(["https://nav-site.netlify.app"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws when a matched deploy reaches a failed terminal state", async () => {
    const { waitForNetlifyDeploy } = await importDeployModule();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "deploy-failed",
          state: "failed",
          branch: "main",
          commit_ref: "abcdef1",
          created_at: "2026-07-05T02:01:00Z",
        },
      ],
    }));

    await expect(
      waitForNetlifyDeploy({
        config: {
          token: "test-token",
          siteId: "site-id",
          targetSha: "abcdef1234567890",
          targetBranch: "main",
          createdAfter: Number.NaN,
          timeoutMs: 1000,
          intervalMs: 1,
        },
        fetchImpl: asFetch(fetchImpl),
        sleep: vi.fn(),
        writeOutput: vi.fn(),
        logger: asConsole({ log: vi.fn(), error: vi.fn() }),
        now: () => 0,
      })
    ).rejects.toThrow("Netlify deploy deploy-failed finished with state=failed");
  });
});
