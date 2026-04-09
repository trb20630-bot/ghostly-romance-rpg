'use client';

import { useRouter } from 'next/navigation';
import PlatformNav from '@/components/PlatformNav';

const games = [
  {
    id: 'qiannu',
    name: '倩女幽魂',
    description: '在蘭若寺的月光下，一段人鬼未了情緣...',
    genre: '浪漫・奇幻',
    estimatedTime: '2-4 小時',
    bg: '/bg-desktop.png',
    status: 'live',
  },
  {
    id: 'island',
    name: '荒島歷險',
    description: '飛機墜落荒島，你能活過 30 天嗎？',
    genre: '生存・冒險',
    estimatedTime: '3-5 小時',
    bg: '/bg-construction.png',
    status: 'coming',
  },
  {
    id: 'future',
    name: '未來世界',
    description: '2150 年，AI 統治世界，你是最後的人類...',
    genre: '科幻・懸疑',
    estimatedTime: '4-6 小時',
    bg: '/bg-construction.png',
    status: 'coming',
  },
];

export default function GamesPage() {
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
        <h1 className="text-3xl font-bold text-white mb-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">探索故事</h1>

        {/* 遊戲卡片列表 */}
        <div className="space-y-5">
          {games.map((game) => (
            <div
              key={game.id}
              onClick={() => game.status === 'live' && router.push('/')}
              className={`relative overflow-hidden rounded-2xl shadow-lg bg-cover bg-center ${game.status === 'live' ? 'cursor-pointer hover:scale-[1.02] transition-transform' : 'opacity-90'}`}
              style={{ backgroundImage: `url('${game.bg}')`, minHeight: '220px' }}
            >
              <div className="absolute inset-0 bg-black/50 flex flex-col justify-end p-6">
                <div className="flex items-center gap-2 mb-2">
                  {game.status === 'live' ? (
                    <span className="bg-amber-500 text-amber-900 text-xs font-medium px-3 py-1 rounded-lg">🎮 上線中</span>
                  ) : (
                    <span className="bg-gray-500/80 text-white text-xs font-medium px-3 py-1 rounded-lg">🚧 建構中</span>
                  )}
                  <span className="text-white/80 text-xs">{game.genre}</span>
                  <span className="text-white/60 text-xs">・{game.estimatedTime}</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 drop-shadow-lg">{game.name}</h2>
                <p className="text-gray-200 text-sm">{game.description}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
