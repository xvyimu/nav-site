"use client";

import { useState } from "react";
import { type Category } from "@/lib/types";

export function SubmitForm({ categories }: { categories: Category[] }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    const form = e.currentTarget;

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: (form.elements.namedItem("title") as HTMLInputElement).value,
          url: (form.elements.namedItem("url") as HTMLInputElement).value,
          description: (form.elements.namedItem("description") as HTMLTextAreaElement).value,
          category_id: (form.elements.namedItem("category_id") as HTMLSelectElement).value,
        }),
      });

      const result = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage("提交成功！");
        form.reset();
      } else {
        setStatus("error");
        setMessage(result.error || "提交失败");
      }
    } catch {
      setStatus("error");
      setMessage("网络错误");
    }
  }

  if (status === "success") {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center animate-fade-in-up"
      >
        <span className="text-2xl">✅</span>
        <p className="text-sm text-foreground/70">{message}</p>
        <button type="button" aria-label="继续提交" onClick={() => setStatus("idle")} className="text-xs text-muted-foreground/50 underline underline-offset-2 hover:text-muted-foreground/80 transition-colors">
          继续提交
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-card p-6 animate-fade-in-up"
    >
      <div>
        <label htmlFor="title" className="mb-1 block text-xs font-medium text-foreground/60">
          站点名称 <span className="text-red-400/70">*</span>
        </label>
        <input id="title" name="title" required placeholder="ChatGPT"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground/80 placeholder:text-muted-foreground/30 outline-none transition-all focus:border-ring focus:ring-[3px] focus:ring-ring/10" />
      </div>
      <div>
        <label htmlFor="url" className="mb-1 block text-xs font-medium text-foreground/60">
          站点 URL <span className="text-red-400/70">*</span>
        </label>
        <input id="url" name="url" type="url" required placeholder="https://example.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground/80 placeholder:text-muted-foreground/30 outline-none transition-all focus:border-ring focus:ring-[3px] focus:ring-ring/10" />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-xs font-medium text-foreground/60">
          描述
        </label>
        <textarea id="description" name="description" rows={3} placeholder="一句话介绍..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground/80 placeholder:text-muted-foreground/30 outline-none transition-all focus:border-ring focus:ring-[3px] focus:ring-ring/10 resize-none" />
      </div>
      <div>
        <label htmlFor="category_id" className="mb-1 block text-xs font-medium text-foreground/60">
          分类
        </label>
        <select id="category_id" name="category_id"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground/80 outline-none transition-all focus:border-ring focus:ring-[3px] focus:ring-ring/10">
          <option value="">选择分类</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
      </div>
      {status === "error" && <p className="text-xs text-red-400/70">{message}</p>}
      <button type="submit" disabled={status === "loading"}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98]">
        {status === "loading" ? "提交中..." : "免费提交"}
      </button>
    </form>
  );
}