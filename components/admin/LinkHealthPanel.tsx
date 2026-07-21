"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { LinkHealthFinding } from "@/lib/admin/link-health-types";

type ListResponse = {
  findings: LinkHealthFinding[];
  meta: {
    openCount: number;
    unavailable?: boolean;
    detail?: string;
  };
};

/** Client table for open link-health findings with resolve action. */
export function LinkHealthPanel() {
  const [findings, setFindings] = useState<LinkHealthFinding[]>([]);
  const [meta, setMeta] = useState<ListResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/link-health", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body = (await res.json().catch(() => null)) as ListResponse | null;
      if (!res.ok || !body) {
        toast.error(
          body && typeof body === "object" && "error" in body
            ? String((body as { error?: string }).error)
            : `加载失败 (${res.status})`
        );
        setFindings([]);
        setMeta(null);
        return;
      }
      setFindings(body.findings ?? []);
      setMeta(body.meta ?? { openCount: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
      setFindings([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolveFinding(id: string) {
    setResolvingId(id);
    try {
      const res = await fetch("/api/admin/link-health", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "resolve", id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(
          body && typeof body === "object" && typeof body.error === "string"
            ? body.error
            : `操作失败 (${res.status})`
        );
        return;
      }
      toast.success("已标记为已处理");
      setFindings((prev) => prev.filter((f) => f.id !== id));
      setMeta((prev) =>
        prev
          ? { ...prev, openCount: Math.max(0, (prev.openCount ?? 1) - 1) }
          : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setResolvingId(null);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制 ${label}`);
    } catch {
      toast.error("复制失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">链接健康</h1>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">
            死链 / 重定向待处理队列 · CLI{" "}
            <code className="rounded bg-[var(--admin-surface)] px-1.5 py-0.5 text-xs">
              pnpm check:links
            </code>{" "}
            +{" "}
            <code className="rounded bg-[var(--admin-surface)] px-1.5 py-0.5 text-xs">
              --persist
            </code>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新
        </Button>
      </div>

      {meta?.unavailable ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-medium">数据表尚未就绪</p>
          <p className="mt-1 text-amber-800/90">
            {meta.detail ||
              "请在目标库执行 scripts/migration-link-health.sql，再用 CLI --persist 写入 findings。"}
          </p>
        </div>
      ) : null}

      {!loading && !meta?.unavailable && findings.length === 0 ? (
        <div className="rounded-lg border border-[var(--admin-border)] bg-white px-4 py-8 text-center">
          <CheckCircle2
            className="mx-auto h-8 w-8 text-[var(--admin-primary)]"
            strokeWidth={1.5}
          />
          <p className="mt-3 text-sm font-medium">暂无待处理 findings</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--admin-muted)]">
            本地或 CI 运行{" "}
            <code className="text-xs">pnpm check:links</code>（含{" "}
            <code className="text-xs">--json</code>），有{" "}
            <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code> 时加{" "}
            <code className="text-xs">--persist</code>{" "}
            入库。恢复正常的链接不会自动关闭，请在此「标记已处理」。也可 POST{" "}
            <code className="text-xs">action: import</code> 手工导入 JSON 报告。
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--admin-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : findings.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-white">
          <div className="border-b border-[var(--admin-border)] px-4 py-2 text-xs text-[var(--admin-muted)]">
            待处理 {meta?.openCount ?? findings.length} 条
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[var(--admin-surface)] text-xs uppercase tracking-wide text-[var(--admin-muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">标题</th>
                  <th className="px-4 py-2.5 font-medium">类型</th>
                  <th className="px-4 py-2.5 font-medium">状态</th>
                  <th className="px-4 py-2.5 font-medium">检测时间</th>
                  <th className="px-4 py-2.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-border)]">
                {findings.map((f) => (
                  <tr key={f.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--admin-text)]">
                        {f.title}
                      </div>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex max-w-md items-center gap-1 truncate text-xs text-[var(--admin-primary)] hover:underline"
                      >
                        {f.url}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      {f.detail ? (
                        <p className="mt-1 text-xs text-[var(--admin-muted)]">
                          {f.detail}
                        </p>
                      ) : null}
                      {f.link_id ? (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
                          onClick={() => void copyText(f.link_id!, "link_id")}
                        >
                          <Copy className="h-3 w-3" />
                          {f.link_id.slice(0, 8)}…
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          f.kind === "broken"
                            ? "inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                            : "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                        }
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {f.kind === "broken" ? "死链" : "重定向"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {f.http_status}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--admin-muted)]">
                      {formatTime(f.checked_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={resolvingId === f.id}
                        onClick={() => void resolveFinding(f.id)}
                        className="gap-1.5"
                      >
                        {resolvingId === f.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        标记已处理
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      hour12: false,
    });
  } catch {
    return iso;
  }
}
