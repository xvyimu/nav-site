"use client";

import { useState, useEffect, useCallback } from "react";
import { relativeTime, type ReviewStats } from "@/lib/types";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface ReviewSectionProps {
  linkId: string;
}

function StarRating({
  rating,
  interactive = false,
  onChange,
}: {
  rating: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || rating;

  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="评分">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onChange?.(star)}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          className={`text-lg transition-colors ${
            !interactive ? "cursor-default" : "cursor-pointer"
          } ${
            star <= display
              ? "text-amber-400"
              : "text-muted-foreground/30"
          }`}
          aria-label={`${star} 星`}
          role={interactive ? "radio" : undefined}
          aria-checked={interactive ? star === rating : undefined}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function RatingBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-8 text-right text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}

export function ReviewSection({ linkId }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [userComment, setUserComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?link_id=${linkId}`);
      if (!res.ok) return;
      const data = await res.json();
      setReviews(data.reviews ?? []);
      setStats(data.stats ?? null);
    } catch {
      // 静默失败，评价是辅助功能
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  useEffect(() => {
    // 数据加载模式：组件挂载时拉取评价数据
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReviews();
  }, [loadReviews]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { toast } = await import("sonner");
    if (userRating === 0) {
      toast.error("请选择评分");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link_id: linkId,
          rating: userRating,
          comment: userComment || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "提交失败");
        return;
      }

      toast.success("评价提交成功！");
      setShowForm(false);
      setUserRating(0);
      setUserComment("");
      loadReviews();
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  const reviewCount = stats?.review_count ?? 0;
  const avgRating = stats?.avg_rating ?? 0;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">用户评价</h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            写评价
          </button>
        )}
      </div>

      {/* 评分概览 */}
      {loading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
      ) : reviewCount > 0 ? (
        <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-card/30 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-1 sm:w-32">
            <span className="text-3xl font-bold tabular-nums">{avgRating.toFixed(1)}</span>
            <StarRating rating={Math.round(avgRating)} />
            <span className="text-xs text-muted-foreground">{reviewCount} 条评价</span>
          </div>
          <div className="flex-1 space-y-1.5">
            <RatingBar label="5星" count={stats?.five_star_count ?? 0} total={reviewCount} />
            <RatingBar label="4星" count={stats?.four_star_count ?? 0} total={reviewCount} />
            <RatingBar label="3星" count={stats?.three_star_count ?? 0} total={reviewCount} />
            <RatingBar label="2星" count={stats?.two_star_count ?? 0} total={reviewCount} />
            <RatingBar label="1星" count={stats?.one_star_count ?? 0} total={reviewCount} />
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          暂无评价，成为第一个评价的人吧！
        </div>
      )}

      {/* 评价表单 */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-lg border border-border bg-card/30 p-4"
        >
          <div className="mb-3">
            <label className="mb-1.5 block text-sm font-medium">您的评分</label>
            <StarRating
              rating={userRating}
              interactive
              onChange={setUserRating}
            />
          </div>
          <div className="mb-3">
            <label className="mb-1.5 block text-sm font-medium">
              评论 <span className="text-muted-foreground">（可选）</span>
            </label>
            <textarea
              value={userComment}
              onChange={(e) => setUserComment(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="分享你的使用体验..."
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {userComment.length}/500
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || userRating === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "提交中..." : "提交评价"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setUserRating(0);
                setUserComment("");
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* 评价列表 */}
      {reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="rounded-lg border border-border p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <StarRating rating={review.rating} />
                <span className="text-xs text-muted-foreground">
                  {relativeTime(review.created_at)}
                </span>
              </div>
              {review.comment && (
                <p className="text-sm text-foreground/80">{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
