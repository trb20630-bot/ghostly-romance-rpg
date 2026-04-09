"use client";

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/api-client";

interface InviteModalProps {
  playerId: string;
  onClose: () => void;
}

const INVITE_BASE_URL = "https://app-five-rust-94.vercel.app/invite/";

export default function InviteModal({ playerId, onClose }: InviteModalProps) {
  const [referralCode, setReferralCode] = useState("");
  const [inviteCount, setInviteCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [shareRewardClaimed, setShareRewardClaimed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/referral")
      .then((r) => r.json())
      .then((data) => {
        if (data.referralCode) setReferralCode(data.referralCode);
        if (data.inviteCount) setInviteCount(data.inviteCount);
        if (data.shareRewardClaimed) setShareRewardClaimed(true);
      })
      .catch(() => {});
  }, []);

  const inviteUrl = referralCode ? `${INVITE_BASE_URL}${referralCode}` : "";

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function claimShareReward() {
    if (shareRewardClaimed || rewardClaimed) return;
    try {
      const res = await authFetch("/api/referral", {
        method: "POST",
        body: JSON.stringify({ action: "claim_share_reward", playerId }),
      });
      const data = await res.json();
      if (data.success) {
        setRewardClaimed(true);
        setShareRewardClaimed(true);
        showToast("已獲得 5 墨幣獎勵！");
      }
    } catch {
      // silent
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (!shareRewardClaimed && !rewardClaimed) await claimShareReward();
      else showToast("已複製邀請連結");
    } catch {
      showToast("複製失敗，請手動複製");
    }
  }

  function handleShareLine() {
    const text = encodeURIComponent(`一起來玩倩女幽魂！用我的邀請碼註冊可以獲得墨幣獎勵 ${inviteUrl}`);
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(inviteUrl)}&text=${text}`, "_blank");
    if (!shareRewardClaimed && !rewardClaimed) claimShareReward();
  }

  function handleShareFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteUrl)}`, "_blank", "width=600,height=400");
    if (!shareRewardClaimed && !rewardClaimed) claimShareReward();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-night/85 backdrop-blur-sm">
      <div className="glass-panel ancient-frame corner-decor rounded-2xl p-6 sm:p-8 w-full max-w-sm animate-fade-in-up space-y-5 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-ghost-white/40 hover:text-ghost-white/70 hover:bg-ghost-white/10 transition-all text-sm"
        >
          &#10005;
        </button>

        {/* Header */}
        <div className="text-center">
          <div className="text-3xl mb-2">&#9993;</div>
          <h2 className="text-lg text-[#C4A77D] font-bold tracking-widest">
            邀請好友，一起冒險！
          </h2>
          <div className="ancient-divider mx-auto max-w-[120px] mt-2">&#10054;</div>
        </div>

        {/* Referral code display */}
        <div className="text-center">
          <p className="text-[10px] text-ghost-white/40 mb-1.5 tracking-wider">我的邀請碼</p>
          <div className="inline-block bg-[#C4A77D]/10 border border-[#C4A77D]/30 rounded-lg px-5 py-2">
            <span className="text-xl text-[#C4A77D] font-mono font-bold tracking-[0.3em]">
              {referralCode || "------"}
            </span>
          </div>
          {inviteCount > 0 && (
            <p className="text-[10px] text-ghost-white/30 mt-1.5">
              已成功邀請 {inviteCount} 位好友
            </p>
          )}
        </div>

        {/* Invite link */}
        <div>
          <p className="text-[10px] text-ghost-white/40 mb-1.5 tracking-wider">邀請連結</p>
          <div className="flex gap-2">
            <div className="flex-1 bg-ghost-white/5 border border-ghost-white/10 rounded-lg px-3 py-2 text-xs text-ghost-white/50 truncate">
              {inviteUrl || "載入中..."}
            </div>
            <button
              onClick={handleCopy}
              disabled={!inviteUrl}
              className="shrink-0 btn-jade rounded-lg px-3 py-2 text-xs tracking-wider font-bold disabled:opacity-30"
            >
              {copied ? "已複製 \u2713" : "複製"}
            </button>
          </div>
        </div>

        {/* Share buttons */}
        <div className="space-y-2">
          <p className="text-[10px] text-ghost-white/40 tracking-wider">分享到</p>
          <div className="flex gap-2">
            <button
              onClick={handleShareLine}
              disabled={!inviteUrl}
              className="flex-1 rounded-lg py-2.5 text-sm font-bold tracking-wider transition-all disabled:opacity-30"
              style={{ backgroundColor: "#06C755", color: "white" }}
            >
              LINE
            </button>
            <button
              onClick={handleShareFacebook}
              disabled={!inviteUrl}
              className="flex-1 rounded-lg py-2.5 text-sm font-bold tracking-wider transition-all disabled:opacity-30"
              style={{ backgroundColor: "#1877F2", color: "white" }}
            >
              Facebook
            </button>
          </div>
        </div>

        {/* Reward info */}
        <div className="bg-ghost-white/5 rounded-lg p-3 space-y-1.5">
          <p className="text-[10px] text-[#C4A77D] font-bold tracking-wider">獎勵說明</p>
          <div className="text-[10px] text-ghost-white/40 leading-relaxed space-y-0.5">
            <p>&#8226; 分享連結即獲得 <span className="text-[#C4A77D]">5 墨幣</span>（每帳號限一次）{shareRewardClaimed ? " \u2713" : ""}</p>
            <p>&#8226; 好友註冊成功，你獲得 <span className="text-[#C4A77D]">15 墨幣 + 5 輪倩女幽魂</span></p>
            <p>&#8226; 好友也能獲得 <span className="text-[#C4A77D]">5 墨幣</span> 新手禮</p>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] bg-[#C4A77D]/90 text-night text-sm font-bold px-5 py-2.5 rounded-lg shadow-lg animate-fade-in-up">
          {toast}
        </div>
      )}
    </div>
  );
}
