"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Compass } from "lucide-react";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Tag } from "@/lib/types";
import type { SidebarTabNode } from "@/lib/nav-derived-data";
import { useShell } from "./Shell";
import { TagFilter } from "./TagFilter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface SidebarProps {
  tabs: SidebarTabNode[];
  activeKey: string;
  onSelect: (key: string) => void;
  tags?: Tag[];
  activeTags?: string[];
  onToggleTag?: (slug: string) => void;
  onClearTags?: () => void;
}

export function Sidebar({
  tabs,
  activeKey,
  onSelect,
  tags = [],
  activeTags = [],
  onToggleTag,
  onClearTags,
}: SidebarProps) {
  const { sidebarOpen: open, closeSidebar: onClose } = useShell();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => toggleExpand(tab.key)}
              className="h-7 w-5 shrink-0 rounded-md text-[var(--paper-faint)]"
              aria-label={isExpanded ? "收起子分类" : "展开子分类"}
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
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
              <Icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? "text-[var(--paper-accent)]" : "text-[var(--paper-faint)]"}`} />
              {tab.label}
            </span>
            {tab.count > 0 && (
              <Badge variant="soft" className="min-w-[20px] justify-center border-0 px-1.5">
                {tab.count}
              </Badge>
            )}
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

  const navLinks: ReactNode = (
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
      <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <SheetContent side="left" className="w-72 p-0 md:hidden" showClose id="mobile-nav-sheet">
          <SheetHeader className="flex h-16 flex-row items-center justify-between space-y-0 border-b border-[var(--paper-line)] px-4">
            <SheetTitle className="nav-display flex items-center gap-2 text-sm font-medium text-[var(--paper-ink)]">
              <Compass className="h-5 w-5 text-[var(--paper-accent)]" />
              导航图谱
            </SheetTitle>
          </SheetHeader>
          {navLinks}
        </SheetContent>
      </Sheet>

      <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 overflow-y-auto border-r border-[var(--paper-line)] bg-[var(--paper-bg)]/88 py-4 text-[var(--paper-ink)] backdrop-blur-xl md:block">
        {navLinks}
      </aside>
    </>
  );
}
