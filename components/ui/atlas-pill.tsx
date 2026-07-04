import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AtlasPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number;
  icon?: LucideIcon;
  labelPrefix?: ReactNode;
  compact?: boolean;
  pressed?: boolean;
}

export function AtlasPill({
  active = false,
  count,
  icon: Icon,
  labelPrefix,
  compact = false,
  pressed = false,
  className,
  children,
  ...props
}: AtlasPillProps) {
  const { "aria-pressed": ariaPressedProp, ...buttonProps } = props;
  const ariaPressed = ariaPressedProp ?? (pressed ? active : undefined);

  return (
    <button
      type="button"
      className={cn(
        "inline-flex max-w-full items-center rounded-full border font-mono uppercase transition-colors",
        "focus-visible:outline-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3 [&_svg]:shrink-0",
        compact ? "h-7 gap-1 px-2.5 text-xs" : "h-8 gap-1.5 px-3 text-xs",
        active
          ? "border-emerald-200/55 bg-emerald-200/14 text-emerald-50"
          : "border-white/12 bg-white/[0.06] text-white/76 hover:border-white/32 hover:text-white",
        className
      )}
      aria-pressed={ariaPressed}
      {...buttonProps}
    >
      {Icon && <Icon aria-hidden="true" />}
      {labelPrefix && <span className="text-white/45">{labelPrefix}</span>}
      <span className="truncate">{children}</span>
      {count !== undefined && <span className="tabular-nums text-white/42">{count}</span>}
    </button>
  );
}
