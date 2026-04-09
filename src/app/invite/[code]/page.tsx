"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import GameIcon from "@/components/GameIcon";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string)?.toUpperCase() || "";
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [inviterName, setInviterName] = useState("");

  useEffect(() => {
    if (!code || code.length !== 6) {
      setStatus("invalid");
      return;
    }

    // 儲存邀請碼到 localStorage
    localStorage.setItem("referralCode", code);

    // 驗證邀請碼
    fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate_code", code }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setStatus("valid");
          setInviterName(data.inviterName || "");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, [code]);

  // 3 秒後自動跳轉
  useEffect(() => {
    if (status === "valid") {
      const timer = setTimeout(() => router.push("/"), 3000);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  return (
    <div className="h-[100dvh] flex items-center justify-center p-4">
      <div className="max-w-sm w-full animate-fade-in-up text-center">
        <div className="glass-panel ancient-frame corner-decor rounded-2xl p-7 space-y-5">
          <div className="animate-ghost-float">
            <GameIcon name="lantern" size={72} />
          </div>

          <h1 className="text-2xl text-gold font-bold tracking-widest">
            倩 女 幽 魂
          </h1>
          <div className="ancient-divider mx-auto max-w-[120px]">&#10054;</div>

          {status === "loading" && (
            <p className="text-ghost-white/50 text-sm">驗證邀請碼中...</p>
          )}

          {status === "valid" && (
            <div className="space-y-3">
              <p className="text-[#C4A77D] text-sm">
                {inviterName ? `${inviterName} 邀請你加入冒險！` : "你收到了一份冒險邀請！"}
              </p>
              <p className="text-ghost-white/40 text-xs">
                註冊即可獲得 <span className="text-[#C4A77D]">5 墨幣</span> 新手禮
              </p>
              <div className="bg-[#C4A77D]/10 border border-[#C4A77D]/30 rounded-lg px-4 py-2 inline-block">
                <span className="text-sm text-[#C4A77D] font-mono tracking-widest">{code}</span>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => router.push("/")}
                  className="w-full btn-jade rounded-xl py-3 text-base tracking-widest font-bold"
                >
                  前 往 註 冊
                </button>
                <p className="text-[10px] text-ghost-white/25 mt-2">3 秒後自動跳轉...</p>
              </div>
            </div>
          )}

          {status === "invalid" && (
            <div className="space-y-3">
              <p className="text-ghost-white/50 text-sm">邀請碼無效或已失效</p>
              <button
                onClick={() => router.push("/")}
                className="w-full btn-ancient rounded-xl py-3 text-base tracking-widest font-bold"
              >
                直 接 進 入
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
