import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline:
          "border border-[var(--paper-line)] bg-[var(--paper-surface)] text-[var(--paper-ink)] hover:border-[var(--paper-accent)] hover:bg-[var(--paper-accent-soft)] hover:text-[var(--paper-accent)]",
        secondary:
          "bg-[var(--paper-surface-soft)] text-[var(--paper-ink)] hover:bg-[var(--paper-accent-soft)] hover:text-[var(--paper-accent)]",
        ghost:
          "text-[var(--paper-muted)] hover:bg-[var(--paper-accent-soft)] hover:text-[var(--paper-accent)]",
        link: "text-primary underline-offset-4 hover:underline",
        paper:
          "border border-[var(--paper-line)] bg-[var(--paper-surface-soft)] text-[var(--paper-ink)] hover:border-[var(--paper-accent)] hover:text-[var(--paper-accent)]",
        accent:
          "bg-[var(--paper-accent)] text-[var(--paper-surface)] hover:bg-[#4f739e]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
        "icon-lg": "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
