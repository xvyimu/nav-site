"use client";

import { useEffect, type KeyboardEvent } from "react";
import { Search, X, Loader2 } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
  loading?: boolean;
}

export function SearchBar({
  value,
  onChange,
  onKeyDown,
  inputRef,
  placeholder,
  loading,
}: SearchBarProps) {
  const showHint = !value;

  // ⌘K / Ctrl+K 全局快捷键：聚焦搜索框
  useEffect(() => {
    const handleGlobalKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [inputRef]);

  return (
    <div className="relative" role="search">
      <Search
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/30"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder || "搜索站点、分类或描述..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full rounded-[24px] border border-input bg-background/80 py-2.5 pl-10 pr-12 text-sm text-foreground/80 placeholder:text-muted-foreground/40 outline-none transition-all focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20 backdrop-blur-sm"
        aria-label="搜索导航站点"
        autoComplete="off"
        spellCheck={false}
      />
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin" aria-hidden="true" />
      ) : value ? (
        <button
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          aria-label="清除搜索"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <kbd
          className={`absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/30 transition-opacity ${
            showHint ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden="true"
        >
          ⌘K
        </kbd>
      )}
    </div>
  );
}
