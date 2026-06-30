import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Analytics } from "@/components/Analytics";
import { PanguSpacing } from "@/components/PanguSpacing";
import dynamic from "next/dynamic";
import { Shell } from "@/components/Shell";
import { FavoritesProvider } from "@/components/FavoritesProvider";
import { Providers } from "@/components/Providers";
import { escapeJsonForHtml } from "@/lib/utils";
import { WebVitals } from "./_components/web-vitals";

const ShortcutPanel = dynamic(() => import("@/components/ShortcutPanel").then((m) => m.ShortcutPanel));
const Toaster = dynamic(() => import("@/components/ui/sonner").then((m) => m.Toaster));

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yuanjia1314.ccwu.cc";
const siteName = "综合导航站";
const siteDescription = "精选收录 AI 大模型、云服务、开发工具、设计资源、在线工具、开源项目、软件应用、学习社区、企业工具等优质站点。每日更新，一站式导航。";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${siteName} — 开发者一站式资源导航`, template: `%s | ${siteName}` },
  description: siteDescription,
  keywords: ["综合导航站", "开发者工具", "AI API", "云服务", "开发工具", "设计资源", "开源项目", "在线工具"],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName,
    title: `${siteName} — 开发者一站式资源导航`,
    description: siteDescription,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} — 开发者一站式资源导航`,
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1b2e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <WebVitals />
          <PanguSpacing />
          <Providers>
            <FavoritesProvider>
              <Shell>
                <Header />
                <main id="main-content" className="flex-1">{children}</main>
              </Shell>
              <Footer />
            </FavoritesProvider>
          </Providers>
          <Analytics />
          <ShortcutPanel />
          <Toaster position="top-center" />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: escapeJsonForHtml(JSON.stringify({
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: siteName,
                url: siteUrl,
                description: siteDescription,
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: `${siteUrl}/?q={search_term_string}`,
                  },
                  "query-input": "required name=search_term_string",
                },
              })),
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}