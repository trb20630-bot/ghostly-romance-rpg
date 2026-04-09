'use client';

import { useRouter } from 'next/navigation';
import PlatformNav from '@/components/PlatformNav';

const items = [
  { id: 1, name: '神秘外觀 A', price: 500, icon: '👘' },
  { id: 2, name: '神秘外觀 B', price: 800, icon: '🎭' },
  { id: 3, name: '神秘外觀 C', price: 1200, icon: '👑' },
  { id: 4, name: '神秘外觀 D', price: 1500, icon: '🗡️' },
];

export default function ShopPage() {
  const router = useRouter();

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative scroll-smooth"
      style={{ backgroundImage: "url('/bg-platform.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>
      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-2 pb-8">

        <PlatformNav />

        {/* 標題 */}
        <h1 className="text-3xl font-bold text-white mb-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">外觀商店</h1>

        {/* 建構中提示 */}
        <div className="bg-black/50 backdrop-blur-md border border-amber-400/30 rounded-2xl p-6 mb-6 text-center">
          <div className="text-4xl mb-3">🚧</div>
          <div className="text-white text-lg font-medium mb-1">商店建構中</div>
          <div className="text-white/60 text-sm">敬請期待精彩外觀內容</div>
        </div>

        {/* 假商品卡片 */}
        <div className="grid grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-5 grayscale opacity-70"
            >
              <div className="text-5xl text-center mb-3">{item.icon}</div>
              <div className="text-white text-center font-medium mb-2">{item.name}</div>
              <div className="flex items-center justify-center gap-1 text-amber-400 text-sm mb-3">
                <div className="w-3 h-3 bg-amber-500 rounded-full" />
                <span>{item.price}</span>
              </div>
              <div className="bg-gray-600/60 text-white/70 text-xs text-center py-2 rounded-lg">
                即將推出
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
