"use client";

import GameIcon from "./GameIcon";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onLogin: (result: any) => void;
}

export default function AuthScreen({ onLogin: _onLogin }: Props) {
  return (
    <div className="h-[100dvh] flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-md animate-fade-in-up px-4 pt-[8vh] sm:pt-[12vh] pb-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-block mb-3">
            <span className="animate-ghost-float inline-block"><GameIcon name="lantern" size={72} /></span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-2">
            倩 女 幽 魂
          </h1>
          <p className="text-ghost-white/60 text-xs tracking-wider">
            那些關於我轉生成為聶小倩／寧采臣的那件事
          </p>
        </div>

        {/* Panel */}
        <div className="glass-panel ancient-frame corner-decor rounded-2xl p-5 sm:p-7">
          <div className="text-center space-y-5">
            <div className="text-ghost-white/70 text-sm leading-relaxed">
              <p>請先登入<span className="text-gold font-bold"> 墨鍵物語 </span>平台</p>
              <p className="text-ghost-white/40 text-xs mt-1">登入後即可開始你的旅程</p>
            </div>

            <div className="ancient-divider">✦</div>

            {/* Platform login button */}
            <a
              href="/platform/login"
              className="block w-full btn-jade rounded-xl py-3 text-base tracking-widest font-bold text-center"
            >
              前 往 平 台 登 入
            </a>
          </div>
        </div>

        {/* Gallery button */}
        <div className="mt-3">
          <a
            href="/gallery"
            className="block w-full btn-ancient rounded-xl py-3 text-base tracking-widest font-bold text-center"
          >
            作 品 牆
          </a>
        </div>

        {/* Admin link */}
        <div className="text-center mt-3">
          <a href="/admin/tokens" className="text-[11px] text-ghost-white/20 hover:text-ghost-white/40 transition-colors">管理後台</a>
        </div>
      </div>
    </div>
  );
}
