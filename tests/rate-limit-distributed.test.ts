import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * 分布式限流适配器测试
 *
 * 覆盖：
 *  - 无 Upstash 配置 → 回退进程内桶（backend=memory），阈值内放行、超限拒绝
 *  - 有 Upstash 配置 → 走 Redis pipeline，按 INCR 结果判定（backend=upstash）
 *  - Redis 抖动（HTTP 失败）→ 回退进程内桶，不误伤（backend=memory）
 */

import { checkDistributedRateLimit } from "@/lib/rate-limit-distributed";

const UPSTASH_ENV = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
};

function pipelineResponse(count: number) {
  return {
    ok: true,
    json: async () => [{ result: count }, { result: 1 }],
  } as unknown as Response;
}

describe("rate-limit-distributed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to in-memory bucket when Upstash is not configured", async () => {
    const key = `test-mem-${Math.random()}`;
    const first = await checkDistributedRateLimit(key, 60_000, 2, {});
    const second = await checkDistributedRateLimit(key, 60_000, 2, {});
    const third = await checkDistributedRateLimit(key, 60_000, 2, {});

    expect(first).toEqual({ allowed: true, backend: "memory" });
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.backend).toBe("memory");
  });

  it("uses Upstash pipeline when configured and allows within limit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(pipelineResponse(1));
    const res = await checkDistributedRateLimit(`k-${Math.random()}`, 60_000, 5, UPSTASH_ENV);
    expect(res).toEqual({ allowed: true, backend: "upstash" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects when Upstash count exceeds the limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(pipelineResponse(6));
    const res = await checkDistributedRateLimit(`k-${Math.random()}`, 60_000, 5, UPSTASH_ENV);
    expect(res.allowed).toBe(false);
    expect(res.backend).toBe("upstash");
  });

  it("falls back to memory when Upstash request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const res = await checkDistributedRateLimit(`k-${Math.random()}`, 60_000, 5, UPSTASH_ENV);
    expect(res.allowed).toBe(true);
    expect(res.backend).toBe("memory");
  });
});
