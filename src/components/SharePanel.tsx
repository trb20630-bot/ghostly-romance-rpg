"use client";

import { useState, useRef, useCallback } from "react";

interface Props {
  storyId: string;
  title: string;
  authorName: string;
  character: string;
  excerpt: string; // ~100 chars from story
  storyUrl: string;
}

type CardSize = "story" | "post";

export default function SharePanel({ storyId, title, authorName, character, excerpt, storyUrl }: Props) {
  const [showPanel, setShowPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = `${siteUrl}/story/${storyId}`;

  // Copy link
  function copyLink() {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Social share URLs
  function shareFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`, "_blank", "width=600,height=400");
  }

  function shareTwitter() {
    const text = `${title} — ${excerpt.slice(0, 80)}⋯`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(fullUrl)}`, "_blank", "width=600,height=400");
  }

  function shareLine() {
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(fullUrl)}`, "_blank", "width=600,height=400");
  }

  // Generate IG card image
  const generateCard = useCallback(async (size: CardSize) => {
    setGenerating(true);
    try {
      const w = 1080;
      const h = size === "story" ? 1920 : 1080;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#0d1117");
      grad.addColorStop(0.5, "#1a1a2e");
      grad.addColorStop(1, "#0d1117");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Decorative border
      ctx.strokeStyle = "rgba(184, 134, 11, 0.4)";
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, w - 80, h - 80);
      ctx.strokeStyle = "rgba(184, 134, 11, 0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(55, 55, w - 110, h - 110);

      // Corner decorations
      ctx.fillStyle = "rgba(184, 134, 11, 0.5)";
      ctx.font = "24px serif";
      ctx.fillText("◆", 48, 68);
      ctx.fillText("◆", w - 68, 68);
      ctx.fillText("◆", 48, h - 48);
      ctx.fillText("◆", w - 68, h - 48);

      // Lantern emoji area
      const topY = size === "story" ? 200 : 120;
      ctx.font = "80px serif";
      ctx.textAlign = "center";
      ctx.fillText("🏮", w / 2, topY);

      // Game title
      ctx.fillStyle = "#d4a017";
      ctx.font = "bold 36px 'Noto Serif TC', serif";
      ctx.textAlign = "center";
      ctx.fillText("倩 女 幽 魂", w / 2, topY + 70);

      // Divider
      ctx.fillStyle = "rgba(184, 134, 11, 0.3)";
      ctx.fillRect(w / 2 - 100, topY + 90, 200, 1);

      // Story title
      ctx.fillStyle = "#f0f0f8";
      ctx.font = "bold 48px 'Noto Serif TC', serif";
      const titleY = topY + 160;
      wrapText(ctx, title, w / 2, titleY, w - 200, 60);

      // Character badge
      const badgeY = size === "story" ? 550 : 400;
      ctx.fillStyle = "rgba(184, 134, 11, 0.15)";
      roundRect(ctx, w / 2 - 80, badgeY, 160, 40, 20);
      ctx.fill();
      ctx.fillStyle = "#d4a017";
      ctx.font = "20px 'Noto Serif TC', serif";
      ctx.fillText(character || "寧采臣", w / 2, badgeY + 27);

      // Author
      ctx.fillStyle = "rgba(240, 240, 248, 0.6)";
      ctx.font = "22px 'Noto Sans TC', sans-serif";
      ctx.fillText(`作者：${authorName}`, w / 2, badgeY + 80);

      // Excerpt
      const excerptY = size === "story" ? 750 : 530;
      ctx.fillStyle = "rgba(240, 240, 248, 0.8)";
      ctx.font = "28px 'Noto Serif TC', serif";
      ctx.textAlign = "center";

      // Left quote mark
      ctx.fillStyle = "rgba(184, 134, 11, 0.3)";
      ctx.font = "60px serif";
      ctx.fillText("「", 120, excerptY);

      ctx.fillStyle = "rgba(240, 240, 248, 0.75)";
      ctx.font = "26px 'Noto Serif TC', serif";
      wrapText(ctx, excerpt, w / 2, excerptY + 30, w - 240, 42);

      // Right quote mark
      ctx.fillStyle = "rgba(184, 134, 11, 0.3)";
      ctx.font = "60px serif";
      ctx.fillText("」", w - 120, excerptY + 180);

      // Bottom area — QR code hint + URL
      const bottomY = h - 150;
      ctx.fillStyle = "rgba(184, 134, 11, 0.2)";
      ctx.fillRect(w / 2 - 150, bottomY - 10, 300, 1);

      ctx.fillStyle = "rgba(240, 240, 248, 0.4)";
      ctx.font = "18px 'Noto Sans TC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("掃描 QR Code 或前往", w / 2, bottomY + 30);

      ctx.fillStyle = "#d4a017";
      ctx.font = "20px 'Noto Sans TC', sans-serif";
      const displayUrl = siteUrl.replace("https://", "").replace("http://", "");
      ctx.fillText(displayUrl, w / 2, bottomY + 60);

      ctx.fillStyle = "rgba(240, 240, 248, 0.2)";
      ctx.font = "14px 'Noto Sans TC', sans-serif";
      ctx.fillText("AI 文字 RPG 遊戲", w / 2, bottomY + 90);

      // Download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}_${size === "story" ? "限動" : "貼文"}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");

    } catch (err) {
      console.error("Card generation error:", err);
    } finally {
      setGenerating(false);
    }
  }, [title, authorName, character, excerpt, siteUrl]);

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider"
      >
        分享
      </button>
    );
  }

  return (
    <div className="glass-panel rounded-xl p-5 space-y-4 w-full">
      <div className="flex items-center justify-between">
        <h3 className="text-gold/80 text-sm font-bold tracking-wider">分享作品</h3>
        <button onClick={() => setShowPanel(false)} className="text-ghost-white/30 hover:text-ghost-white/60 text-xs">✕</button>
      </div>

      {/* Social buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={copyLink} className="btn-ancient rounded-lg px-3 py-2.5 text-xs tracking-wider">
          {copied ? "已複製 ✓" : "複製連結"}
        </button>
        <button onClick={shareFacebook} className="btn-ancient rounded-lg px-3 py-2.5 text-xs tracking-wider">
          Facebook
        </button>
        <button onClick={shareTwitter} className="btn-ancient rounded-lg px-3 py-2.5 text-xs tracking-wider">
          Twitter / X
        </button>
        <button onClick={shareLine} className="btn-ancient rounded-lg px-3 py-2.5 text-xs tracking-wider">
          Line
        </button>
      </div>

      {/* IG Card Generator */}
      <div className="border-t border-gold/10 pt-4 space-y-2">
        <p className="text-[10px] text-ghost-white/40">Instagram 圖片卡片（下載後手動發布）</p>
        <div className="flex gap-2">
          <button
            onClick={() => generateCard("story")}
            disabled={generating}
            className="flex-1 btn-ancient rounded-lg py-2.5 text-xs tracking-wider disabled:opacity-40"
          >
            {generating ? "生成中⋯" : "限時動態 (9:16)"}
          </button>
          <button
            onClick={() => generateCard("post")}
            disabled={generating}
            className="flex-1 btn-ancient rounded-lg py-2.5 text-xs tracking-wider disabled:opacity-40"
          >
            {generating ? "生成中⋯" : "貼文 (1:1)"}
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// Helper: wrap text in canvas
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const chars = text.split("");
  let line = "";
  let currentY = y;

  for (const char of chars) {
    const testLine = line + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

// Helper: rounded rectangle
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
