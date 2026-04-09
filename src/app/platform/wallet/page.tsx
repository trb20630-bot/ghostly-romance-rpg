'use client';

import { useRouter } from 'next/navigation';
import PlatformNav from '@/components/PlatformNav';
import { useRequireProfile } from '@/lib/use-require-profile';

const transactions: { id: string; type: string; amount: number; date: string }[] = [];

export default function WalletPage() {
  const router = useRouter();
  useRequireProfile();

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative scroll-smooth"
      style={{ backgroundImage: "url('/bg-platform.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>
      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-2 pb-8">

        <PlatformNav />

        {/* 標題 */}
        <h1 className="text-3xl font-bold text-white mb-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">我的錢包</h1>

        {/* 餘額卡片 */}
        <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-8 mb-6 text-center">
          <div className="text-white/70 text-sm mb-3">墨幣餘額</div>
          <div className="text-6xl font-bold text-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.4)] mb-2">
            1,250
          </div>
          <div className="text-amber-300/80 text-base mb-6">墨幣</div>
          <button className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-8 py-3 rounded-lg transition-colors">
            + 儲值墨幣
          </button>
        </div>

        {/* 交易紀錄 */}
        <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">交易紀錄</h2>
          {transactions.length === 0 ? (
            <div className="text-white/50 text-center py-8">暫無交易紀錄</div>
          ) : (
            <div className="space-y-3">
              {transactions.map((t) => (
                <div key={t.id} className="flex justify-between items-center py-3 border-b border-white/10">
                  <div>
                    <div className="text-white">{t.type}</div>
                    <div className="text-white/50 text-xs">{t.date}</div>
                  </div>
                  <div className={t.amount > 0 ? 'text-green-400' : 'text-red-400'}>
                    {t.amount > 0 ? '+' : ''}{t.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
