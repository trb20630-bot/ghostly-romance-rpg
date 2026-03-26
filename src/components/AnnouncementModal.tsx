"use client";

import { useState, useEffect } from "react";
import {
  CURRENT_ANNOUNCEMENT,
  hasSeenAnnouncement,
  markAnnouncementSeen,
} from "@/lib/announcements";

const SECTION_ICONS: Record<string, string> = {
  new: "✦",
  fix: "⚒",
  improve: "⚡",
};

export default function AnnouncementModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasSeenAnnouncement(CURRENT_ANNOUNCEMENT.version)) {
        setIsOpen(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    markAnnouncementSeen(CURRENT_ANNOUNCEMENT.version);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-b from-gray-900 to-gray-800 border-2 border-amber-600/50 rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* 標題 */}
        <div className="sticky top-0 bg-gradient-to-r from-amber-900/90 to-amber-800/90 px-4 py-3 border-b border-amber-600/30 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-amber-100 text-center">
            {CURRENT_ANNOUNCEMENT.title}
          </h2>
          <p className="text-amber-300/70 text-sm text-center mt-1">
            {CURRENT_ANNOUNCEMENT.date}
          </p>
        </div>

        {/* 內容 */}
        <div className="p-4 space-y-4">
          {CURRENT_ANNOUNCEMENT.content.map((section, idx) => (
            <div key={idx}>
              <h3 className="text-amber-200 font-semibold mb-2">
                {SECTION_ICONS[section.type] || ">"} {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.items.map((item, itemIdx) => (
                  <li
                    key={itemIdx}
                    className="text-gray-300 text-sm flex items-start gap-2"
                  >
                    <span className="text-amber-500 mt-0.5">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 按鈕 */}
        <div className="sticky bottom-0 bg-gray-900/95 px-4 py-3 border-t border-amber-600/30">
          <button
            onClick={handleClose}
            className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-semibold rounded-lg transition-all"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
