"use client";

import {
  useCallback,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";

type SurfaceStyle = CSSProperties & {
  "--surface-glow-color"?: string;
  "--surface-glow-opacity"?: number;
  "--surface-glow-x"?: string;
  "--surface-glow-y"?: string;
};

interface InteractiveSurfaceProps extends ComponentPropsWithoutRef<"div"> {
  glowColor?: string;
  spotlight?: boolean;
}

export function InteractiveSurface({
  children,
  className,
  style,
  glowColor = "rgba(255, 255, 255, 0.22)",
  spotlight = true,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onFocus,
  onBlur,
  ...props
}: InteractiveSurfaceProps) {
  // 无 spotlight 时不挂指针 state，避免密集网格 hover 触发重渲染
  if (!spotlight) {
    return (
      <div
        className={cn(
          "relative overflow-hidden transition-[border-color,transform] duration-200 ease-out",
          className
        )}
        style={style}
        {...props}
      >
        <div className="relative">{children}</div>
      </div>
    );
  }

  return (
    <InteractiveSurfaceSpotlight
      className={className}
      style={style}
      glowColor={glowColor}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      onFocus={onFocus}
      onBlur={onBlur}
      {...props}
    >
      {children}
    </InteractiveSurfaceSpotlight>
  );
}

function InteractiveSurfaceSpotlight({
  children,
  className,
  style,
  glowColor = "rgba(255, 255, 255, 0.22)",
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onFocus,
  onBlur,
  ...props
}: Omit<InteractiveSurfaceProps, "spotlight">) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const setGlowPosition = useCallback((clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const rect = surface.getBoundingClientRect();
    surface.style.setProperty("--surface-glow-x", `${clientX - rect.left}px`);
    surface.style.setProperty("--surface-glow-y", `${clientY - rect.top}px`);
  }, []);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    setGlowPosition(event.clientX, event.clientY);
    onPointerMove?.(event);
  };

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    setActive(true);
    setGlowPosition(event.clientX, event.clientY);
    onPointerEnter?.(event);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    setActive(false);
    onPointerLeave?.(event);
  };

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current;
    if (surface) {
      surface.style.setProperty("--surface-glow-x", "50%");
      surface.style.setProperty("--surface-glow-y", "50%");
    }
    setActive(true);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    setActive(false);
    onBlur?.(event);
  };

  return (
    <div
      ref={surfaceRef}
      className={cn(
        "relative overflow-hidden transition-[border-color,transform] duration-200 ease-out",
        className
      )}
      style={
        {
          "--surface-glow-color": glowColor,
          "--surface-glow-opacity": active ? 1 : 0,
          "--surface-glow-x": "50%",
          "--surface-glow-y": "50%",
          ...style,
        } as SurfaceStyle
      }
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[var(--surface-glow-opacity)] transition-opacity duration-300 [background:radial-gradient(circle_at_var(--surface-glow-x)_var(--surface-glow-y),var(--surface-glow-color),transparent_68%)]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
