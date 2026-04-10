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

        {/* LINE Login */}
        <div className="mt-5">
          <a
            href="/api/auth/line/login"
            className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-base tracking-widest font-bold text-white transition-all hover:brightness-110"
            style={{ backgroundColor: "#06C755" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            使用 LINE 登入
          </a>
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
