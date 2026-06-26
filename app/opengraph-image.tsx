import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "综合导航站 — 开发者一站式资源导航";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* 装饰性圆环 */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(91,141,239,0.15) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(91,141,239,0.1) 0%, transparent 70%)",
          }}
        />

        {/* 主标题 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          {/* 指南针图标 SVG */}
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5b8def" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="#5b8def" />
          </svg>
          <span style={{ fontSize: 48, fontWeight: 700, color: "#f8fafc" }}>综合导航站</span>
        </div>

        {/* 副标题 */}
        <span style={{ fontSize: 24, color: "#94a3b8", marginBottom: 40 }}>
          开发者一站式资源导航
        </span>

        {/* 分类标签 */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 900 }}>
          {["AI & 大模型", "云服务 & VPS", "开发工具", "设计资源", "在线工具", "开源项目"].map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 18,
                color: "#cbd5e1",
                background: "rgba(91,141,239,0.15)",
                border: "1px solid rgba(91,141,239,0.3)",
                borderRadius: 999,
                padding: "8px 20px",
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* 底部统计 */}
        <div style={{ display: "flex", gap: 48, marginTop: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#5b8def" }}>287+</span>
            <span style={{ fontSize: 16, color: "#64748b" }}>精选站点</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#5b8def" }}>11</span>
            <span style={{ fontSize: 16, color: "#64748b" }}>分类</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#5b8def" }}>每日</span>
            <span style={{ fontSize: 16, color: "#64748b" }}>更新</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
