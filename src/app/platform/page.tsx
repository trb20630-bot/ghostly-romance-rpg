'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PlatformNav from '@/components/PlatformNav';
import { useRequireProfile } from '@/lib/use-require-profile';

// 模擬資料（之後會換成真實資料庫）
const mockUser = {
  nickname: '墨染書生',
  avatar: null as string | null,
  balance: 1250,
};

const mockGames = [
  {
    id: 'qiannu',
    name: '倩女幽魂',
    description: '在蘭若寺的月光下，一段人鬼未了情緣...',
    status: 'live',
    estimatedTime: '2-4 小時',
    genre: '浪漫・奇幻',
    gradient: 'from-emerald-500 via-emerald-600 to-emerald-800',
    icon: '倩',
  },
  {
    id: 'island',
    name: '荒島歷險',
    description: '飛機墜落荒島，你能活過 30 天嗎？',
    status: 'coming',
    estimatedTime: '3-5 小時',
    genre: '生存・冒險',
    gradient: 'from-blue-500 via-blue-600 to-blue-800',
    icon: '荒',
  },
  {
    id: 'future',
    name: '未來世界',
    description: '2150 年，AI 統治世界，你是最後的人類...',
    status: 'coming',
    estimatedTime: '4-6 小時',
    genre: '科幻・懸疑',
    gradient: 'from-purple-500 via-purple-600 to-purple-800',
    icon: '未',
  },
];

const mockStats = {
  availableGames: 1,
  totalRounds: 156,
  activeCharacters: 2,
};

export default function PlatformHome() {
  const router = useRouter();
  useRequireProfile();
  const [user] = useState(mockUser);
  const [games] = useState(mockGames);
  const [stats] = useState(mockStats);
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % 3);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + 3) % 3);

  useEffect(() => {
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleGameClick = (gameId: string, status: string) => {
    if (status === 'live') {
      // 跳轉到遊戲（暫時跳到現有的倩女幽魂）
      router.push('/');
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative scroll-smooth"
      style={{ backgroundImage: "url('/bg-platform.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>
      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-2 pb-8">

        <PlatformNav />

        {/* 公告橫幅 - 輪播 Banner */}
        <div className="relative overflow-hidden rounded-2xl mb-8 shadow-lg" style={{ minHeight: '300px' }}>
          <div className="flex transition-transform duration-500" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>

            {/* 第一張：倩女幽魂 */}
            <div className="min-w-full bg-cover bg-center relative" style={{ backgroundImage: "url('/bg-desktop.png')", minHeight: '300px' }}>
              <div className="absolute inset-0 bg-black/40 flex flex-col justify-center items-start p-10">
                <span className="bg-amber-500 text-amber-900 text-sm font-medium px-3 py-1 rounded-lg mb-4">🎮 封測中</span>
                <h2 className="text-3xl font-bold text-white mb-3 drop-shadow-lg">倩女幽魂</h2>
                <p className="text-lg text-gray-200 mb-6">在蘭若寺的月光下，一段人鬼未了情緣...</p>
                <button className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-6 py-3 rounded-lg transition-colors">立即遊玩</button>
              </div>
            </div>

            {/* 第二張：新篇章預告 */}
            <div className="min-w-full bg-cover bg-center relative" style={{ backgroundImage: "url('/bg-construction.png')", minHeight: '300px' }}>
              <div className="absolute inset-0 bg-black/50 flex flex-col justify-center items-start p-10">
                <span className="bg-blue-500 text-white text-sm font-medium px-3 py-1 rounded-lg mb-4">🚀 即將推出</span>
                <h2 className="text-3xl font-bold text-white mb-3 drop-shadow-lg">新故事即將上線</h2>
                <p className="text-lg text-gray-200 mb-6">荒島歷險 - 飛機墜落荒島，你能活過 30 天嗎？</p>
                <button className="bg-gray-500 text-white font-medium px-6 py-3 rounded-lg">敬請期待</button>
              </div>
            </div>

            {/* 第三張：儲值優惠 */}
            <div className="min-w-full bg-gradient-to-r from-amber-600 to-orange-500 relative" style={{ minHeight: '300px' }}>
              <div className="absolute inset-0 flex flex-col justify-center items-start p-10">
                <span className="bg-white text-amber-600 text-sm font-medium px-3 py-1 rounded-lg mb-4">🎁 限定優惠</span>
                <h2 className="text-3xl font-bold text-white mb-3 drop-shadow-lg">封測限定優惠</h2>
                <p className="text-lg text-white/90 mb-6">首次儲值加贈 50% 墨幣！</p>
                <button className="bg-white hover:bg-gray-100 text-amber-600 font-medium px-6 py-3 rounded-lg transition-colors">立即儲值</button>
              </div>
            </div>

          </div>

          {/* 左右箭頭 */}
          <button onClick={prevSlide} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full">
            ◀
          </button>
          <button onClick={nextSlide} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full">
            ▶
          </button>

          {/* 指示點 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-3 h-3 rounded-full transition-colors ${currentSlide === index ? 'bg-white' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
