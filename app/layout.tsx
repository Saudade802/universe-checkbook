import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "宇宙无限银行 · 财富显化支票",
  description: "写下心中所愿，珍藏每一次期待。填写专属财富显化支票，下载为 PNG 或 JPG 图片。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
