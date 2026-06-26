"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SECTION_LABELS } from "@/lib/nav-config";

const baseShortcuts = [
  { keys: ["⌘", "K"], label: "搜索站点" },
  { keys: ["⌘", "1"], label: "全部" },
  { keys: ["↑", "↓"], label: "导航结果列表" },
  { keys: ["↵"], label: "打开选中站点" },
  { keys: ["Esc"], label: "清除搜索 / 关闭面板" },
  { keys: ["?"], label: "显示快捷键" },
];

// 从 SECTION_LABELS 动态生成分类快捷键
const categoryShortcuts = Object.entries(SECTION_LABELS)
  .slice(0, 8)
  .map(([, label], i) => ({
    keys: ["⌘", String(i + 2)],
    label,
  }));

export function ShortcutPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // 不在输入框中触发
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* 面板 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed left-1/2 top-1/4 z-50 w-full max-w-sm -translate-x-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl"
            role="dialog"
            aria-label="快捷键列表"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground/80">快捷键</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
                aria-label="关闭"
              >
                ✕  Esc
              </button>
            </div>
            <div className="space-y-2">
              {[...baseShortcuts.slice(0, 2), ...categoryShortcuts, ...baseShortcuts.slice(2)].map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground/70">{s.label}</span>
                  <kbd className="inline-flex items-center gap-0.5">
                    {s.keys.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-md border border-border bg-muted/50 px-1.5 text-[11px] font-mono text-muted-foreground/60"
                      >
                        {k}
                      </span>
                    ))}
                  </kbd>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
