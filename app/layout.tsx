import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SubtleStars } from "@/components/SubtleStars";
import { Analytics } from "@/components/Analytics";
import { PanguSpacing } from "@/components/PanguSpacing";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yuanjia1314.ccwu.cc";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "公益API导航站 — AI 模型公益中转站导航",
    template: "%s | 公益API导航",
  },
  description:
    "收录各种公益、免费、可白嫖的AI大模型API中转站，帮助更多人找到可用、稳定、低门槛的AI服务入口。",
  keywords: ["公益API", "AI中转站", "免费Token", "API导航", "大模型API", "公益导航"],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "公益API导航站",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PanguSpacing />
        <SubtleStars />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Analytics />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
