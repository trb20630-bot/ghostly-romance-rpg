import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "那些關於我轉生成為聶小倩/寧采臣的那件事",
  description: "AI 文字 RPG — 倩女幽魂",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
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
      <body className="bg-night text-ghost-white font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
