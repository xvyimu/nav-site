import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "综合导航站",
    short_name: "综合导航",
    description: "精选收录 AI、云服务、开发工具、设计资源、开源项目等优质站点",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#5b8def",
    icons: [
      { src: "/favicon.ico", sizes: "256x256", type: "image/x-icon" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
