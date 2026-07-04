"use client";

import { useCallback, useEffect, useState } from "react";

interface ResourceRatingProps {
  pageId: string;
}

function showToast(type: "success" | "error", message: string) {
  void import("sonner").then(({ toast }) => {
    toast[type](message);
  }).catch(() => {
    // Toast delivery is non-critical; rating submission should keep its state.
  });
}

export function ResourceRating({ pageId }: ResourceRatingProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const display = hover || rating;

  const loadCount = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch(
        `/api/resource-ratings?page_id=${encodeURIComponent(pageId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { count?: unknown };
      return typeof data.count === "number" ? data.count : null;
    } catch {
      return null;
    }
  }, [pageId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const nextCount = await loadCount();
      if (cancelled || nextCount == null) return;
      setCount(nextCount);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [loadCount]);

  async function submit(value: number) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/resource-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId, rating: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("error", data.error || "提交失败");
        return;
      }
      showToast("success", "感谢你的评分");
      setRating(value);
      setSubmitted(true);
      const latest = await loadCount();
      if (latest != null) {
        setCount(latest);
      } else {
        setCount((c) => (c == null ? null : c + 1));
      }
    } catch {
      showToast("error", "网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-10 rounded-xl border border-border bg-card/40 p-5">
      <h2 className="text-sm font-semibold text-foreground">给你的感受评分</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        帮助这片海域更懂你需要什么。
      </p>

      <div className="mt-3 flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={submitted || submitting}
            onClick={() => submit(star)}
            onMouseEnter={() => !submitted && setHover(star)}
            onMouseLeave={() => setHover(0)}
            className={`text-2xl transition-colors ${
              submitted ? "cursor-default" : "cursor-pointer hover:scale-110"
            } ${
              star <= display
                ? "text-amber-400"
                : "text-muted-foreground/30"
            }`}
            aria-label={`${star} 星`}
          >
            ★
          </button>
        ))}
        {submitting && (
          <span className="ml-2 text-xs text-muted-foreground">提交中…</span>
        )}
      </div>

      {submitted && (
        <p className="mt-2 text-xs text-muted-foreground">
          已记录{count != null ? `（当前 ${count} 次评分）` : null}。
        </p>
      )}
    </section>
  );
}
