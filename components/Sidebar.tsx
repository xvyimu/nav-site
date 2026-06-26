"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Compass, X, ChevronRight, ChevronDown } from "lucide-react";
import { getCategoryIcon } from "@/lib/category-icons";
import { TagFilter } from "./TagFilter";
import type { Tag } from "@/lib/types";

/** 侧边栏树节点（含子分类） */
interface SidebarTabNode {
  key: string;
  label: string;
  count: number;
  children: SidebarTabNode[];
}

interface SidebarProps {
  tabs: SidebarTabNode[];
  activeKey: string;
  onSelect: (key: string) => void;
  open: boolean;
  onClose: () => void;
  /** 可选标签列表（按名称排序） */
  tags?: Tag[];
  /** 当前选中的标签 slug 列表 */
  activeTags?: string[];
  /** 切换标签选中状态 */
  onToggleTag?: (slug: string) => void;
  /** 清除所有标签筛选 */
  onClearTags?: () => void;
}

export function Sidebar({
  tabs,
  activeKey,
  onSelect,
  open,
  onClose,
  tags = [],
  activeTags = [],
  onToggleTag,
  onClearTags,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  // 展开的分类 slug 集合（分类层级用）
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Close on Escape
  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  // Close on click outside (desktop)
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (open && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose]);

  // Prevent body scroll when open on mobile
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // 选中子分类时自动展开父分类
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setExpanded((prev) => {
      for (const tab of tabs) {
        if (tab.children.some((c) => c.key === activeKey) && !prev.has(tab.key)) {
          const next = new Set(prev);
          next.add(tab.key);
          return next;
        }
      }
      return prev;
    });
  }, [activeKey, tabs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelect = (key: string) => {
    onSelect(key);
    if (window.innerWidth < 768) onClose();
  };

  const renderTab = (tab: SidebarTabNode, isChild = false): ReactNode => {
    const Icon = getCategoryIcon(tab.key);
    const isActive = activeKey === tab.key;
    const hasChildren = tab.children.length > 0;
    const isExpanded = expanded.has(tab.key);

    return (
      <div key={tab.key}>
        <div className={`flex items-center ${isChild ? "ml-5" : ""}`}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(tab.key)}
              className="shrink-0 w-5 h-7 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors"
              aria-label={isExpanded ? "收起子分类" : "展开子分类"}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="shrink-0 w-5" aria-hidden="true" />
          )}
          <button
            onClick={() => handleSelect(tab.key)}
            className={`sidebar-link flex-1 ${isActive ? "active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            style={isChild ? { paddingLeft: "0.25rem" } : undefined}
          >
            <span className="flex items-center gap-2.5">
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground/50"
                }`}
              />
              {tab.label}
            </span>
            {tab.count > 0 && <span className="sidebar-badge">{tab.count}</span>}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div className="flex flex-col gap-1">
            {tab.children.map((child) => renderTab(child, true))}
          </div>
        )}
      </div>
    );
  };

  const links: ReactNode = (
    <nav className="flex flex-col gap-1 px-3 py-2" aria-label="导航分类">
      {tabs.map((tab) => renderTab(tab))}
      {onToggleTag && onClearTags && (
        <TagFilter
          tags={tags}
          activeTags={activeTags}
          onToggleTag={onToggleTag}
          onClear={onClearTags}
        />
      )}
    </nav>
  );

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar (slide-in) */}
      <AnimatePresence>
        {open && (
          <motion.aside
            ref={sidebarRef}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 z-50 h-full w-64 border-r border-border bg-background md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="导航分类"
          >
            <div className="flex h-14 items-center justify-between border-b border-border/50 px-4">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Compass className="h-5 w-5 text-primary" />
                综合导航站
              </span>
              <button
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors"
                aria-label="关闭侧边栏"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {links}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop sidebar (always visible) */}
      <aside className="hidden md:block w-64 shrink-0 border-r border-border/50 bg-background/80 h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto">
        <div className="px-4 py-4">
          {links}
        </div>
      </aside>
    </>
  );
}
