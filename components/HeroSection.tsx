"use client";

import { motion } from "motion/react";

export function HeroSection() {
  return (
    <motion.div
      className="mb-10 text-center"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.h1
        className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
      >
        公益API导航站
      </motion.h1>
      <motion.p
        className="mt-2 text-sm text-muted-foreground/70 max-w-md mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        收录公益、免费、可白嫖的 AI 大模型 API 中转站
      </motion.p>
    </motion.div>
  );
}
