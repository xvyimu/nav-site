import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { prefetchFavicons, useFavicon } from "@/lib/use-favicon";

describe("useFavicon", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        decoding = "async";
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("优先使用 preferred 图标且不发起域名加载", async () => {
    const { result } = renderHook(() =>
      useFavicon("example.com", "https://cdn.example.com/icon.png")
    );
    expect(result.current).toBe("https://cdn.example.com/icon.png");
  });

  it("无 preferred 时通过代理加载并缓存", async () => {
    const { result } = renderHook(() => useFavicon("figma.com"));
    await waitFor(() => {
      expect(result.current).toBe("/api/favicon?domain=figma.com&v=2");
    });
  });

  it("prefetchFavicons 预热后 hook 可同步命中缓存", async () => {
    await act(async () => {
      prefetchFavicons(["prefetch-demo.test"]);
      await Promise.resolve();
      await Promise.resolve();
    });
    const { result } = renderHook(() => useFavicon("prefetch-demo.test"));
    await waitFor(() => {
      expect(result.current).toBe("/api/favicon?domain=prefetch-demo.test&v=2");
    });
  });
});
