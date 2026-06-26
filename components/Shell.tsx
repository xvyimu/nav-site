"use client";

import { useState, createContext, useContext, type ReactNode } from "react";

interface ShellContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
}

const ShellContext = createContext<ShellContextType | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within Shell");
  return ctx;
}

export function Shell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((v) => !v);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <ShellContext.Provider value={{ sidebarOpen, toggleSidebar, closeSidebar }}>
      {/* 无障碍：跳转到主内容 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        跳转到主内容
      </a>
      {children}
    </ShellContext.Provider>
  );
}