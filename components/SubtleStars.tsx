/**
 * 柔和满天星背景
 * 极淡的蓝色星光，点缀在白底上，静悄悄地闪烁着。
 * 纯 CSS 实现，零 JS 开销。
 */
export function SubtleStars() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 顶部的极淡蓝色渐变 */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/30 via-transparent to-transparent" />

      {/* 星星：用重复径向渐变模拟稀疏的星点 */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(1.5px 1.5px at 10% 20%, oklch(0.7 0.1 220 / 0.3), transparent),
            radial-gradient(1px 1px at 25% 5%, oklch(0.7 0.1 220 / 0.2), transparent),
            radial-gradient(1.5px 1.5px at 40% 15%, oklch(0.65 0.08 230 / 0.25), transparent),
            radial-gradient(1px 1px at 55% 8%, oklch(0.7 0.1 220 / 0.2), transparent),
            radial-gradient(1.5px 1.5px at 70% 25%, oklch(0.65 0.08 230 / 0.3), transparent),
            radial-gradient(1px 1px at 85% 12%, oklch(0.7 0.1 220 / 0.2), transparent),
            radial-gradient(1.5px 1.5px at 15% 40%, oklch(0.7 0.1 220 / 0.25), transparent),
            radial-gradient(1px 1px at 35% 35%, oklch(0.65 0.08 230 / 0.2), transparent),
            radial-gradient(1.5px 1.5px at 50% 45%, oklch(0.7 0.1 220 / 0.25), transparent),
            radial-gradient(1px 1px at 65% 50%, oklch(0.65 0.08 230 / 0.15), transparent),
            radial-gradient(1.5px 1.5px at 80% 38%, oklch(0.7 0.1 220 / 0.2), transparent),
            radial-gradient(1px 1px at 90% 55%, oklch(0.65 0.08 230 / 0.25), transparent),
            radial-gradient(1.5px 1.5px at 5% 60%, oklch(0.7 0.1 220 / 0.2), transparent),
            radial-gradient(1px 1px at 20% 65%, oklch(0.65 0.08 230 / 0.15), transparent),
            radial-gradient(1.5px 1.5px at 45% 70%, oklch(0.7 0.1 220 / 0.25), transparent),
            radial-gradient(1px 1px at 60% 62%, oklch(0.65 0.08 230 / 0.2), transparent),
            radial-gradient(1.5px 1.5px at 75% 78%, oklch(0.7 0.1 220 / 0.2), transparent),
            radial-gradient(1px 1px at 95% 68%, oklch(0.65 0.08 230 / 0.25), transparent),
            radial-gradient(1.5px 1.5px at 8% 85%, oklch(0.7 0.1 220 / 0.2), transparent),
            radial-gradient(1px 1px at 30% 80%, oklch(0.65 0.08 230 / 0.25), transparent),
            radial-gradient(1.5px 1.5px at 48% 90%, oklch(0.7 0.1 220 / 0.2), transparent),
            radial-gradient(1px 1px at 68% 86%, oklch(0.65 0.08 230 / 0.15), transparent),
            radial-gradient(1.5px 1.5px at 82% 95%, oklch(0.7 0.1 220 / 0.25), transparent),
            radial-gradient(1px 1px at 50% 50%, oklch(0.7 0.1 220 / 0.3), transparent)
          `,
        }}
      />
    </div>
  );
}