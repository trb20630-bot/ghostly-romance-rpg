# 倩女幽魂 RPG - 專案狀態

> 最後更新：2026-03-24（安全修復完成）
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

### 時間回溯（問題 2）

- [x] P0：autoSave fire-and-forget → await + 重試 + 狀態指示
  - autoSave 改為 await，存檔完成後才 INCREMENT_ROUND
  - 失敗自動重試 3 次（間隔遞增 1s/2s/3s）
  - Header 顯示存檔狀態：儲存中.../已儲存 ✓/儲存失敗
  - beforeunload 攔截：未存檔完成時提示使用者

- [x] P1：三步存檔改為原子操作
  - conversation_logs 兩條 INSERT 合併為 batch insert
  - 插入失敗直接回傳錯誤，不會留下不完整的資料
  - game_sessions 更新失敗時對話已安全寫入，載入時 context-guard 會修正

- [x] P1：載入時驗證 round_number vs 對話記錄
  - context-guard 新增 round_number 驗證邏輯
  - 以 conversation_logs 的最大 round_number 為準
  - 不一致時自動修正 game_sessions.round_number 並記錄錯誤
  - auth/route.ts 回傳修正後的 round_number 給前端

---

### 選項品質（問題 3 + 4）

- [x] P0：System Prompt 選項規則重構
  - 合併重複的選項規則為單一區塊（core.ts）
  - 移除格式二/三，只保留 A/B/C/D 格式，避免 AI 困惑
  - 統一使用 `A.` 半形句點格式
  - 新增「選項自我檢查」指令：要求 AI 輸出前比對 A/B 是否太相似

- [x] P0：選項重複/相似度檢查
  - 新增 `choiceSimilarity()`（Overlap coefficient + 2-gram）
  - 新增 `hasDuplicateChoices()` — 任兩個選項相似度 > 50% 即視為重複
  - `validateAndFixResponse` 整合：重複選項 → 清除並根據敘事重新生成

- [x] P1：泛用選項禁止清單擴充
  - 從 6 個 pattern 擴充到 17 個
  - 門檻從命中 2 個降到 1 個（更嚴格）

---

### Bug 修復

- [x] Bug 1：AI 文字變慢
  - 原因：autoSave await 阻塞 setLoading(false)，輸入框被鎖 250-500ms
  - 修復：setLoading(false) 提前到 ADD_MESSAGE 之後，存檔在背景完成

- [x] Bug 2：手機音樂不能調大小聲
  - 原因：控制面板 w-52 固定寬度溢出手機螢幕右側，音量滑桿被裁切
  - 修復：手機用 `w-[calc(100vw-2rem)]`，桌面用 `sm:w-52`，加 `max-w-[13rem]`

---

## 🔄 進行中

（目前無）

---

### 資料隔離與安全（問題 5）

- [x] P0：密碼明文儲存 → bcrypt hash
  - 註冊時 `bcrypt.hash(password, 10)`
  - 登入時 `bcrypt.compare(password, hash)`
  - 舊玩家自動升級：明文比對成功後自動 hash 化

- [x] P1：JWT 認證
  - 新增 `lib/jwt.ts`（jose 簽發 + 驗證，7 天過期）
  - 新增 `lib/auth-guard.ts`（從 Authorization header 提取 JWT）
  - 登入時回傳 token，前端存 sessionStorage
  - 所有 API（chat/save/summarize/game）驗證 JWT

- [x] P1：/api/save session 歸屬驗證
  - 寫入前查 `game_sessions` 確認 sessionId 屬於 playerId
  - 不屬於則回傳 403

- [x] P1：前端統一用 authFetch
  - 新增 `lib/api-client.ts` 自動附加 Authorization header
  - ChatInterface、CharacterSelect、page.tsx 全部改用 authFetch

- [x] P3：移除 `__session_refresh__` 假密碼 hack
  - handleBackToSlots 不再用假密碼重新登入，改為 reload（token 持久）

---

## 🔄 進行中

（目前無）

---

## ⏳ 待處理

（目前無）

---

## 📁 關鍵檔案位置

| 功能 | 檔案 |
|------|------|
| JWT 簽發/驗證 | `app/src/lib/jwt.ts` |
| API 認證守衛 | `app/src/lib/auth-guard.ts` |
| 前端認證 fetch | `app/src/lib/api-client.ts` |
| 摘要觸發邏輯 | `app/src/components/ChatInterface.tsx:163-180` |
| triggerSummarize | `app/src/components/ChatInterface.tsx` |
| autoSave（含重試） | `app/src/components/ChatInterface.tsx` |
| 記憶注入 prompt | `app/src/lib/prompts/index.ts:106-142` |
| extractFacts API | `app/src/app/api/summarize/route.ts` |
| JSON 截斷修復 | `app/src/app/api/summarize/route.ts:19-50` |
| 存檔 API（原子+歸屬驗證） | `app/src/app/api/save/route.ts` |
| Haiku 設定 | `app/src/lib/claude.ts` |
| System Prompt 核心 | `app/src/lib/prompts/core.ts` |
| 遊戲狀態管理 | `app/src/lib/game-store.ts` |
| Context Guard（含 round 驗證） | `app/src/lib/context-guard.ts` |
| 存檔載入（含修正） | `app/src/app/api/auth/route.ts` |
| 單元測試 | `app/src/__tests__/memory-system.test.ts` |

---

## 📝 重要決策記錄

1. **摘要觸發門檻**：首次 5 輪，之後每 10 輪
2. **摘要保留數量**：10 條，每條 150 字，超過時合併最舊 3 條
3. **摘要重試機制**：失敗 3 次後暫停 5 輪
4. **摘要 Timeout**：30 秒
5. **extractFacts maxTokens**：1000（從 500 提高）
6. **autoSave**：await 模式，重試 3 次，間隔遞增
7. **存檔原子性**：batch insert conversation_logs，失敗不寫入
8. **round_number 驗證**：載入時以 conversation_logs 為 source of truth
9. **beforeunload 攔截**：存檔進行中時提示使用者
10. **密碼 hash**：bcryptjs，salt rounds = 10，舊玩家自動升級
11. **JWT**：jose HS256，7 天過期，存 sessionStorage
12. **API 認證**：所有遊戲 API 都驗證 JWT（auth route 的 list/login/register 除外）
13. **session 歸屬**：/api/save 寫入前驗證 sessionId 屬於 JWT 中的 playerId

---

## 🔗 相關資源

- GitHub Repo: https://github.com/trb20630-bot/ghostly-romance-rpg
- 線上網址: https://app-five-rust-94.vercel.app
- Supabase: [需要時查詢]
