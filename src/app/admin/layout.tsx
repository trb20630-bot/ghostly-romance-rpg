export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-night text-ghost-white font-sans">
      <header className="border-b border-gold/20 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-gold font-bold tracking-wider">
            倩女幽魂 — 管理後台
          </h1>
          <div className="flex items-center gap-4">
            <a href="/admin/tokens" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">Token 監控</a>
            <a href="/admin/players" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">玩家監控</a>
            <a href="/admin/errors" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">錯誤監控</a>
            <a href="/admin/music" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">音樂監控</a>
            <a href="/admin/health" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">健康檢查</a>
            <a href="/" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">返回遊戲</a>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8 pb-20">
        {children}
      </main>
    </div>
  );
}
