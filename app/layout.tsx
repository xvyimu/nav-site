import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Analytics } from "@/components/Analytics";
import { SubtleStars } from "@/components/SubtleStars";
import { PanguSpacing } from "@/components/PanguSpacing";
import { ShortcutPanel } from "@/components/ShortcutPanel";
import { Toaster } from "@/components/ui/sonner";
import { Shell } from "@/components/Shell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yuanjia1314.ccwu.cc";
const siteName = "公益API导航站";
const siteDescription = "精心收录 AI 大模型 API，涵盖阿里云百炼、火山引擎、硅基流动等官方平台，以及各类公益中转服务。每日更新，助你找到最合适的 AI API。";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${siteName} — AI 模型公益中转站导航`, template: `%s | 公益API导航` },
  description: siteDescription,
  keywords: ["公益API", "AI中转站", "免费Token", "API导航", "大模型API", "公益导航"],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName,
    title: `${siteName} — AI 模型公益中转站导航`,
    description: siteDescription,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} — AI 模型公益中转站导航`,
    description: siteDescription,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground gradient-bg">
        <ThemeProvider>
          <PanguSpacing />
          <SubtleStars />
          <Shell>
            <Header />
            <main className="flex-1">{children}</main>
          </Shell>
          <Footer />
          <Analytics />
          <ShortcutPanel />
          <Toaster position="top-center" />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: siteName,
                url: siteUrl,
                description: siteDescription,
              }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"),
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}