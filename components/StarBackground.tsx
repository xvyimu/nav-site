"use client";

import { useEffect } from "react";

/**
 * 满天星背景效果（来自用户的星空代码优化版）
 * 使用 CSS 动画实现星星闪烁
 */
export function StarBackground() {
  useEffect(() => {
    // 动态创建样式
    const styleId = "star-bg-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .star-particle {
          position: fixed;
          pointer-events: none;
          background: radial-gradient(circle, rgba(255,255,255,0.9), rgba(200,220,255,0.3));
          border-radius: 50%;
          z-index: -1;
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes drift {
          0% { transform: translateY(0) translateX(0); }
          100% { transform: translateY(-20px) translateX(5px); }
        }
      `;
      document.head.appendChild(style);
    }

    // 生成星星
    const stars: HTMLDivElement[] = [];
    const count = Math.min(
      Math.floor((window.innerWidth * window.innerHeight) / 15000),
      60
    );

    for (let i = 0; i < count; i++) {
      const star = document.createElement("div");
      star.className = "star-particle";
      const size = Math.random() * 2.5 + 1;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.animation = [
        `twinkle ${Math.random() * 4 + 2}s ease-in-out infinite`,
        `drift ${Math.random() * 10 + 8}s ease-in-out infinite`,
      ].join(", ");
      star.style.animationDelay = `${Math.random() * 5}s`;
      document.body.appendChild(star);
      stars.push(star);
    }

    return () => {
      stars.forEach((s) => s.remove());
    };
  }, []);

  return null;
}