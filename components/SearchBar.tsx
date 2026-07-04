"use client";

import { useEffect, type KeyboardEvent } from "react";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
  loading?: boolean;
  semantic?: boolean;
  onSemanticChange?: (value: boolean) => void;
  variant?: "default" | "hero";
}

export function SearchBar({
  value,
  onChange,
  onKeyDown,
  inputRef,
  placeholder,
  loading,
  semantic = false,
  onSemanticChange,
  variant = "default",
}: SearchBarProps) {
  const showHint = !value;
  const isHero = variant === "hero";

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
        className={cn(
          "absolute top-1/2 -translate-y-1/2",
          isHero ? "left-5 size-5 text-white/55" : "left-3 size-4 text-muted-foreground/30"
        )}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder || "搜索站点、分类或描述..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full border outline-none transition-all",
          isHero
            ? "h-14 rounded-full border-white/20 bg-white/12 py-3 pl-14 pr-28 text-base text-white placeholder:text-white/45 backdrop-blur-xl focus:border-emerald-200/70 focus:ring-[3px] focus:ring-emerald-200/20"
            : "rounded-[24px] border-input bg-background/80 py-2.5 pl-10 pr-24 text-sm text-foreground/80 placeholder:text-muted-foreground/40 backdrop-blur-sm focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20"
        )}
        aria-label="搜索导航站点"
        autoComplete="off"
        spellCheck={false}
      />
      <div className={cn("absolute top-1/2 flex -translate-y-1/2 items-center gap-2", isHero ? "right-4" : "right-3")}>
        {onSemanticChange && (
          <button
            type="button"
            onClick={() => onSemanticChange(!semantic)}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full border transition-colors",
              isHero
                ? semantic
                  ? "border-emerald-200/50 bg-emerald-200/15 text-emerald-100"
                  : "border-white/18 bg-white/10 text-white/45 hover:text-white/80"
                : semantic
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground/70"
            )}
            aria-label={semantic ? "关闭语义搜索" : "开启语义搜索"}
            aria-pressed={semantic}
            title={semantic ? "关闭语义搜索" : "开启语义搜索"}
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
          </button>
        )}
        {loading ? (
          <Loader2
            className={cn("size-4 animate-spin", isHero ? "text-emerald-100" : "text-primary")}
            aria-hidden="true"
          />
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className={cn(
              "transition-colors",
              isHero ? "text-white/45 hover:text-white/80" : "text-muted-foreground/30 hover:text-muted-foreground/60"
            )}
            aria-label="清除搜索"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd
            className={cn(
              "hidden items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-opacity sm:inline-flex",
              isHero
                ? "border-white/15 bg-white/10 text-white/45"
                : "border-border bg-muted/40 text-muted-foreground/30",
              showHint ? "opacity-100" : "opacity-0"
            )}
            aria-hidden="true"
          >
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  );
}
