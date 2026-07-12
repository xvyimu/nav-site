import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-[var(--paper-line)] text-[var(--paper-muted)]",
        accent:
          "border-transparent bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]",
        soft:
          "border-transparent bg-[var(--paper-surface-soft)] text-[var(--paper-muted)]",
        success:
          "border-transparent bg-[color-mix(in_srgb,#6f8c74_16%,white)] text-[#6f8c74]",
        warning:
          "border-transparent bg-[color-mix(in_srgb,#b58157_16%,white)] text-[#b58157]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
