"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronRight, Compass, X } from "lucide-react";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Tag } from "@/lib/types";
import { TagFilter } from "./TagFilter";

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
  tags?: Tag[];
  activeTags?: string[];
  onToggleTag?: (slug: string) => void;
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (open && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setExpanded((prev) => {
      for (const tab of tabs) {
        if (tab.children.some((child) => child.key === activeKey) && !prev.has(tab.key)) {
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
              className="flex h-7 w-5 shrink-0 items-center justify-center text-white/45 transition-colors hover:text-white"
              aria-label={isExpanded ? "收起子分类" : "展开子分类"}
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" aria-hidden="true" />
          )}
          <button
            onClick={() => handleSelect(tab.key)}
            className={`sidebar-link flex-1 ${isActive ? "active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            style={isChild ? { paddingLeft: "0.25rem" } : undefined}
          >
            <span className="flex items-center gap-2.5">
              <Icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? "text-emerald-100" : "text-white/42"}`} />
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
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm md:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            ref={sidebarRef}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 z-50 h-full w-72 border-r border-white/10 bg-[#07100f] text-white md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="导航分类"
          >
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <span className="flex items-center gap-2 text-sm font-medium text-white/85">
                <Compass className="h-5 w-5 text-emerald-100" />
                导航图谱
              </span>
              <button
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="关闭侧边栏"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {links}
          </motion.aside>
        )}
      </AnimatePresence>

      <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-[#07100f]/88 py-4 text-white backdrop-blur-xl md:block">
        {links}
      </aside>
    </>
  );
}
