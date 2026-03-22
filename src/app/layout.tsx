import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "那些關於我轉生成為聶小倩/寧采臣的那件事",
  description: "AI 文字 RPG — 倩女幽魂",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-night text-ghost-white font-serif antialiased bg-scene">
        <div className="mist-overlay" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
