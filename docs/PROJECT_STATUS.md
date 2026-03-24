# 倩女幽魂 RPG - 專案狀態

> 最後更新：2026-03-24
> 更新者：Claude Code

---

## ✅ 已完成的修復

### 記憶系統

- [x] P0-1：roundCounter 與 game.roundNumber 對齊 bug（ChatInterface.tsx:233-260）
  - 改用 `game.roundNumber` 反推真實起始輪數，不再從 1 重新編號
  - 載入存檔後摘要能正確觸發

- [x] P0-2：摘要失敗 Silent fail + 重試機制（ChatInterface.tsx:233-372）
  - 加入 30 秒 timeout（AbortController）
  - 完整錯誤處理（API 錯誤、超時、JSON parse、網路錯誤）
  - 連續失敗 3 次暫停 5 輪後重試
  - 所有路徑都有 console log

- [x] P1-1：Haiku 500 token 截斷 → keyFacts 不更新
  - extractFacts maxTokens 從 500 提高到 1000（claude.ts:98）
  - EXTRACT_FACTS_PROMPT 加入精簡指令，要求每欄位最多 3 項、每項 10 字內
  - 新增 tryRepairJson() 截斷修復邏輯（summarize/route.ts:19-50）

- [x] P1-2：前 10 輪無記憶
  - 首次摘要門檻從 10 輪降到 5 輪（ChatInterface.tsx:166-168）
  - 之後維持每 10 輪觸發

- [x] P2：storySummaries 截斷太激進
  - 保留條數 5 → 10 條（prompts/index.ts:129）
  - 每條字數 50 → 150 字（prompts/index.ts:136）
  - 超過 10 條時合併最舊 3 條為 1 條，而非直接刪除
  - SUMMARY_PROMPT 摘要字數從 50 字放寬到 100 字

---

## 🔄 進行中

（目前無）

---

## ⏳ 待處理

### 問題 2：時間回溯
- 玩家關掉再開會有時間回溯的問題
- 尚未診斷

### 問題 3：沒有 ABCD 選項
- AI 回應經常沒有給玩家選項
- 尚未診斷

### 問題 4：選項重複
- 有了 ABCD 選項卻常常是同樣的答案
- 尚未診斷

### 問題 5：資料隔離
- 需確認 AI 回答內容是否鎖定在該玩家的遊玩內容內
- 尚未診斷

---

## 📁 關鍵檔案位置

| 功能 | 檔案 |
|------|------|
| 摘要觸發邏輯 | `app/src/components/ChatInterface.tsx:163-180` |
| triggerSummarize | `app/src/components/ChatInterface.tsx:233-372` |
| 記憶注入 prompt | `app/src/lib/prompts/index.ts:106-142` |
| extractFacts API | `app/src/app/api/summarize/route.ts` |
| JSON 截斷修復 | `app/src/app/api/summarize/route.ts:19-50` |
| Haiku 設定 | `app/src/lib/claude.ts` |
| System Prompt 核心 | `app/src/lib/prompts/core.ts` |
| 遊戲狀態管理 | `app/src/lib/game-store.ts` |
| Context Guard | `app/src/lib/context-guard.ts` |
| 存檔載入 | `app/src/app/api/auth/route.ts` |

---

## 📝 重要決策記錄

1. **摘要觸發門檻**：首次 5 輪，之後每 10 輪
2. **摘要保留數量**：10 條，每條 150 字，超過時合併最舊 3 條
3. **重試機制**：失敗 3 次後暫停 5 輪
4. **Timeout**：30 秒
5. **extractFacts maxTokens**：1000（從 500 提高）
6. **retry state 用 useRef**：不觸發 re-render，避免不必要的效能開銷

---

## 🔗 相關資源

- GitHub Repo: https://github.com/trb20630-bot/ghostly-romance-rpg
- 線上網址: https://app-five-rust-94.vercel.app
- Supabase: [需要時查詢]
