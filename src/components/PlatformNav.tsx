'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface UserInfo {
  name: string;
  id: string;
}

export default function PlatformNav() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const name = sessionStorage.getItem('playerName');
    const id = sessionStorage.getItem('playerId');
    if (name && id) {
      setUser({ name, id });
    }
    setChecked(true);
  }, []);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('playerId');
    sessionStorage.removeItem('playerName');
    setUser(null);
    setMenuOpen(false);
    router.push('/platform');
  }

  return (
    <>
      {/* 頂部導覽（Logo + 右側按鈕） */}
      <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
        <div>
          <img
            src="/inkey-logo.png"
            alt="墨鍵物語 Inkey"
            className="h-auto w-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] brightness-110 contrast-110"
          />
        </div>
        <div className="flex items-center gap-3">
          {checked && user ? (
            <>
              {/* 墨幣餘額 */}
              <button
                onClick={() => router.push('/platform/wallet')}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 hover:border-amber-400 transition-colors"
              >
                <div className="w-5 h-5 bg-amber-500 rounded-full" />
                <span className="text-sm font-medium text-gray-800">1,250</span>
              </button>
              {/* 頭像 + 下拉選單 */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white font-medium"
                >
                  {user.name.charAt(0)}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-black/80 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden shadow-lg z-50">
                    <button
                      onClick={() => { setMenuOpen(false); router.push('/platform/profile'); }}
                      className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/10 transition-colors"
                    >
                      個人資料
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-white/10 transition-colors border-t border-white/10"
                    >
                      登出
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : checked ? (
            <a
              href="/platform/login"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-full transition-colors"
            >
              登入 / 註冊
            </a>
          ) : null}
        </div>
      </div>

      {/* 頂部選單 */}
      <nav className="sticky top-2 z-50 bg-black/40 backdrop-blur-md border border-white/10 py-3 px-6 rounded-lg mb-6">
        <div className="flex justify-between items-center">
          <div className="flex gap-6">
            <a href="/platform" className="text-white/90 hover:text-white text-sm font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors">首頁</a>
            <a href="/platform/games" className="text-white/90 hover:text-white text-sm font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors">探索故事</a>
          </div>
          <div className="flex gap-6 items-center">
            <a href="/platform/wallet" className="text-white/90 hover:text-white text-sm font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors">錢包</a>
            <a href="/platform/shop" className="text-white/90 hover:text-white text-sm font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors">商店</a>
            {checked && user ? (
              <a href="/platform/profile" className="flex items-center gap-2 text-white/90 hover:text-white text-sm font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white text-xs">
                  {user.name.charAt(0)}
                </div>
                <span>{user.name}</span>
              </a>
            ) : (
              <a href="/platform/login" className="text-amber-400 hover:text-amber-300 text-sm font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors">
                登入
              </a>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
