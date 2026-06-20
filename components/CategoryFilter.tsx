"use client";

import { type Category } from "@/lib/types";
import { motion } from "motion/react";

export function CategoryFilter({
  categories,
  active,
  onChange,
}: {
  categories: Category[];
  active: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <motion.button
        layout
        onClick={() => onChange("all")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          active === "all"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground/70 hover:bg-muted/80 hover:text-foreground"
        }`}
        whileTap={{ scale: 0.97 }}
      >
        全部
      </motion.button>
      {categories.map((cat) => (
        <motion.button
          key={cat.slug}
          layout
          onClick={() => onChange(cat.slug)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            active === cat.slug
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground/70 hover:bg-muted/80 hover:text-foreground"
          }`}
          whileTap={{ scale: 0.97 }}
        >
          {cat.icon} {cat.name}
        </motion.button>
      ))}
    </div>
  );
}