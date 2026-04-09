'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 已登入但沒有暱稱 → 導向 /platform/setup-profile
 * 在需要暱稱的頁面呼叫此 hook。
 */
export function useRequireProfile() {
  const router = useRouter();

  useEffect(() => {
    const playerId = sessionStorage.getItem('playerId');
    const playerName = sessionStorage.getItem('playerName');

    // 已登入但沒有暱稱 → 去設定
    if (playerId && !playerName) {
      router.push('/platform/setup-profile');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
