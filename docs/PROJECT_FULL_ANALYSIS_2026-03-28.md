# 倩女幽魂 AI RPG — 完整專案分析報告

**報告日期**：2026-03-28
**版本標記**：v7-security-fix (commit e606907)

---

## 1. 專案基本資料

| 項目 | 內容 |
|------|------|
| 專案名稱 | 那些關於我轉生成為聶小倩/寧采臣的那件事 |
| 類型 | AI 驅動文字 RPG 遊戲 |
| 網址 | https://app-five-rust-94.vercel.app |
| GitHub | https://github.com/trb20630-bot/ghostly-romance-rpg |
| 部署平台 | Vercel (Next.js Serverless Functions) |
| 資料庫 | Supabase (PostgreSQL + RLS) |
| AI 模型 | Claude Sonnet 4.6（劇情）+ Claude Haiku 4.5（查詢/摘要） |
| 前端框架 | Next.js 16.2.1 + React 19.2.4 |
| 樣式 | Tailwind CSS 4.0.0 |
| 語言 | TypeScript 5.7.0 |
| 認證 | JWT (jose) + bcrypt 密碼雜湊 |
| 語音 | Azure Speech TTS |

### 程式碼統計

| 分類 | 檔案數 | 程式碼行數 |
|------|--------|-----------|
| 頁面與 API 路由 | 33 | 5,780 |
| React 元件 | 10 | 3,869 |
| 工具函式庫 | 18 | 2,334 |
| 型別定義 | 1 | 94 |
| 資料庫遷移 | 12 | 667 |
| 測試 | 1 | 87 |
| **合計** | **75** | **12,831** |

---

## 2. 完整架構圖

### 2.1 前端結構

```
src/app/
├── layout.tsx          — 全域佈局（字型、背景、迷霧動畫）
├── page.tsx            — 首頁入口（認證→存檔選擇→遊戲主流程）
├── admin/              — 管理後台
│   ├── errors/         — 錯誤日誌
│   ├── health/         — 系統健康檢查
│   ├── music/          — BGM 管理
│   ├── players/        — 玩家統計
│   └── tokens/         — Token 使用統計
├── gallery/            — 作品牆（公開故事列表）
├── profile/[name]/     — 玩家個人檔案
└── story/[id]/         — 單篇故事閱讀頁
```

### 2.2 React 元件

| 元件 | 行數 | 功能 |
|------|------|------|
| `ChatInterface.tsx` | ~1,400 | 遊戲主畫面：對話、選項、TTS、存檔、狀態欄 |
| `ExportView.tsx` | ~500 | 故事匯出：串流進度、TTS 朗讀、MP3/PDF/TXT 下載 |
| `BgmPlayer.tsx` | ~300 | 背景音樂播放器（場景自動切換） |
| `AuthScreen.tsx` | ~200 | 登入/註冊 |
| `SlotSelect.tsx` | ~200 | 3 格存檔選擇 |
| `SetupPhase.tsx` | ~150 | 玩家設定（年齡、性別、職業） |
| `CharacterSelect.tsx` | ~120 | 轉生角色選擇（聶小倩/寧采臣） |
| `GameProvider.tsx` | ~50 | Context Provider |
| `SharePanel.tsx` | ~80 | 分享到作品牆 |
| `AnnouncementModal.tsx` | ~50 | 系統公告 |

### 2.3 後端 API 路由

| 路由 | 方法 | 認證 | 功能 |
|------|------|------|------|
| `/api/auth` | POST | - | 登入/註冊/心跳 |
| `/api/chat` | POST | JWT | AI 對話（含 GAME_DATA 解析） |
| `/api/save` | POST/PATCH | JWT | 儲存對話 + 心跳 |
| `/api/game` | POST/PATCH | JWT | 建立/更新遊戲 session |
| `/api/summarize` | POST | JWT | Haiku 摘要 + 事實提取 |
| `/api/export` | POST | JWT | 故事匯出（串流進度） |
| `/api/player-stats` | GET | JWT | 讀取玩家狀態數據 |
| `/api/backfill-stats` | POST | JWT | Haiku 分析歷史對話補齊數據 |
| `/api/test-game-data` | POST | - | DB 寫入測試（debug 用） |
| `/api/gallery` | GET | - | 作品牆列表（公開） |
| `/api/gallery/story` | GET | - | 單篇故事（公開） |
| `/api/share` | POST | JWT | 分享故事到作品牆 |
| `/api/comments` | GET/POST/DELETE | GET 公開, POST/DELETE 需 JWT | 評論系統 |
| `/api/like` | POST | JWT | 按讚 |
| `/api/tts` | POST | - | Azure TTS 語音合成 |
| `/api/music-log` | POST | - | BGM 切換記錄 |
| `/api/music-feedback` | POST | - | BGM 回報 |
| `/api/admin/health` | GET/POST | ADMIN_SECRET | 系統健康檢查 + 修復 |
| `/api/admin/players` | GET | ADMIN_SECRET | 玩家統計 |
| `/api/admin/tokens` | GET | ADMIN_SECRET | Token 消耗統計 |
| `/api/admin/music` | GET/POST | ADMIN_SECRET | BGM 異常分析 |
| `/api/admin/errors` | GET/POST | ADMIN_SECRET | 錯誤日誌 |

### 2.4 資料庫表結構（12 張表）

```
players ──────────┐
  │                │
  ├─ game_sessions ├─ conversation_logs
  │   │            │
  │   ├─ player_memory
  │   ├─ player_stats
  │   ├─ player_stats_history
  │   ├─ story_exports ── comments
  │   │                └── story_likes
  │   ├─ music_logs
  │   └─ music_feedback
  │
  ├─ token_usage
  └─ error_logs
```

#### 核心表

| 表名 | 用途 | 主要欄位 |
|------|------|---------|
| `players` | 玩家帳戶 | id, display_name, password, last_active |
| `game_sessions` | 存檔（每玩家最多 3 格） | player_id, slot_number, phase, round_number, chosen_character, current_location, is_daytime |
| `conversation_logs` | 完整對話紀錄 | session_id, round_number, role, content, model_used, phase |
| `player_memory` | AI 記憶（摘要+事實） | session_id, key_facts(JSONB), story_summaries(JSONB), last_summarized_round |

#### 數據追蹤表

| 表名 | 用途 | 主要欄位 |
|------|------|---------|
| `player_stats` | 玩家即時狀態 | session_id, silver, items, followers, skills, relationships |
| `player_stats_history` | 狀態變化歷史 | session_id, round_number, game_data(JSONB) |
| `token_usage` | Token 消耗統計 | session_id, input/output_tokens, cache tokens, model, cost |
| `error_logs` | 錯誤追蹤 | error_type, error_detail(JSONB), resolved |
| `music_logs` | BGM 切換記錄 | from_scene, to_scene, is_abnormal |
| `music_feedback` | BGM 回報 | current_scene, player_feedback |

#### 社群表

| 表名 | 用途 | 主要欄位 |
|------|------|---------|
| `story_exports` | 匯出的故事 | title, chapters(JSONB), is_public, likes_count, comments_count |
| `comments` | 評論 | story_id, user_id, content, is_deleted |
| `story_likes` | 按讚 | story_id, user_id |

### 2.5 AI 整合流程

```
玩家輸入
  │
  ├─ shouldUseHaiku(message) ─── true ──→ Haiku（便宜 73%）
  │                              false
  ▼
assemblePrompt()
  ├─ 靜態區塊（cached）
  │   ├─ CORE_SYSTEM_PROMPT (~1,960 tokens)
  │   ├─ CHARACTER_PROMPTS (story/ending 階段)
  │   └─ GAME_DATA_PROMPT (story/ending 階段, ~460 tokens)
  │
  └─ 動態區塊（不 cached）
      ├─ 玩家角色名
      ├─ 階段特定 prompt (death/reincarnation/NPC/location)
      ├─ 時間狀態 + 規則
      ├─ 記憶上下文 (~500 tokens)
      └─ GAME_DATA 提醒 (story/ending)
          │
          ▼
      callClaude() → Sonnet 4.6
          │
          ▼
      parseGameData() → 提取 [GAME_DATA] 標記
          │
          ▼
      validateAndFixResponse() → 驗證 ABC 選項品質
          │
          ▼
      回傳前端 + fire-and-forget 寫入 DB
```

---

## 3. 核心功能清單

### 3.1 遊戲機制

| 功能 | 實作位置 | 說明 |
|------|---------|------|
| 角色選擇 | `CharacterSelect.tsx` | 聶小倩（女鬼線）或 寧采臣（書生線） |
| 遊戲階段 | `game-store.ts` | setup → character → death → reincarnation → story → ending → export |
| 日夜系統 | `chat/route.ts:detectTimeChange` | 關鍵詞偵測（天亮/入夜），影響小倩行動能力 |
| 地點系統 | `chat/route.ts:detectLocationChange` | 6 個地點：現代、輪迴、金華城、蘭若寺、地下、墓地 |
| ABC 選項 | `validateResponse.ts` | 強制每輪有 3 個不同方向的具體選項，自動修復泛用/重複選項 |
| 結局偵測 | `validateResponse.ts:isStoryConclusion` | ending 階段故事完結時不強制加選項 |
| 死亡劇情 | `prompts/death-scenes.ts` | 根據職業設計死亡方式，12 句內完成 |
| 六大機制 | `prompts/core.ts` | 鬼不見光、必遇小倩、道士搏鬥、骨灰控制、必住蘭若寺、必救小倩 |

### 3.2 記憶系統

| 機制 | 說明 |
|------|------|
| 對話歷史 | 保留最近 8 輪（16 條訊息），`getRecentHistory()` |
| 自動摘要 | 首次 5 輪後觸發，之後每 10 輪，用 Haiku 壓縮成 100 字 |
| 事實提取 | 與摘要並行，提取 9 類 keyFacts（敵友、承諾、秘密、物品等） |
| 記憶壓縮 | 最多保留 10 條摘要，超過時合併最舊 3 條為 1 條「【早期】」 |
| 記憶注入 | 每輪 assemblePrompt 時注入壓縮後的記憶上下文（~500 tokens） |

### 3.3 狀態欄系統

| 數據 | DB 欄位 | 來源 |
|------|---------|------|
| 銀兩 | `player_stats.silver` | AI 透過 `[+銀兩]` / `[-銀兩]` 標記 |
| 物品 | `player_stats.items` | `[+物品]` / `[-物品]` |
| 部屬 | `player_stats.followers` | `[+部屬]` / `[-部屬]` |
| 技能 | `player_stats.skills` | `[+技能]` |
| 好感度 | `player_stats.relationships` | `[+好感]` / `[-好感]` |

### 3.4 社群功能

- **作品牆**：玩家可分享故事到公開作品牆，支援匿名
- **評論**：需登入，含髒話過濾，軟刪除
- **按讚**：需登入，toggle 機制
- **故事閱讀**：公開故事可直接閱讀

### 3.5 匯出系統

- **串流匯出**：API 用 ReadableStream 即時回報進度（`[PROGRESS]`、`[CHAPTER]`、`[DONE]`）
- **章節改寫**：Haiku 將遊戲對話改寫為小說章節
- **下載格式**：PDF、TXT、WAV 有聲書
- **有聲書**：TTS 語音 + BGM 混音（BGM 20% 音量）

### 3.6 BGM 系統

| 場景 | 音樂 |
|------|------|
| MODERN / DEATH | Midnight In The Boardroom |
| REBIRTH | Ethereal Ascent |
| LANRUO | 幽寺阴风 |
| ROMANCE | 月影幽恋 |
| BATTLE | 冥锋对决 |
| ENDING | 余音不散 |

自動切換邏輯：AI 回覆含 `<!-- SCENE: TAG -->` 標記 → 前端切換 BGM。異常切換（如 ENDING→MODERN）會記錄到 music_logs。

---

## 4. Token 優化措施

### 4.1 優化層級

| 層級 | 機制 | 節省幅度 |
|------|------|---------|
| Prompt Caching | `anthropic-beta: prompt-caching-2024-07-31` header，靜態 prompt 加 `cache_control: ephemeral` | Cache hit 省 90% |
| 模型分流 | 簡單查詢（背包/位置/時間）→ Haiku；劇情對話 → Sonnet | 每個查詢省 73% |
| 條件載入 | GAME_DATA 規則只在 story/ending 載入，death/reincarnation 省 460 tokens | ~460 tokens/輪 |
| 歷史截斷 | 只送最近 8 輪（16 條訊息） | ~70-80% |
| 記憶壓縮 | keyFacts 逗號壓縮 + 摘要 150 字截斷 + 最多 10 條 | ~60% |
| 分層 Prompt | 靜態規則 cached + 動態內容不 cached | 最大化 cache hit |

### 4.2 每輪成本估算

| 場景 | Input tokens | Output tokens | 模型 | 費用 |
|------|-------------|--------------|------|------|
| 故事輪（cache hit） | ~3,200 | ~800 | Sonnet | ~$0.022 |
| 故事輪（cache miss） | ~5,500 | ~800 | Sonnet | ~$0.028 |
| 簡單查詢 | ~5,500 | ~300 | Haiku | ~$0.006 |
| 摘要（每 10 輪一次） | ~2,000 | ~200 | Haiku | ~$0.003 |

**每位玩家每 10 輪平均成本**：~$0.22

---

## 5. 安全性措施

### 5.1 認證流程

```
登入/註冊 → bcrypt 密碼驗證 → JWT 簽發（7 天效期）
     │
     ▼
前端 sessionStorage 儲存 token → authFetch() 自動附加 Authorization header
     │
     ▼
API → authenticateOrFallback() → 優先 JWT，降級用 body.playerId（向後相容）
     │
     ▼
Session 歸屬驗證 → game_sessions.player_id === playerId
```

### 5.2 API 認證狀態

| 路由 | 認證方式 | 備註 |
|------|---------|------|
| 核心遊戲（chat, save, game, summarize） | JWT + session 歸屬 | 完整保護 |
| 狀態欄（player-stats） | JWT + session 歸屬 | 完整保護 |
| 匯出（export） | JWT | 2026-03-28 補上 |
| 評論（comments POST/DELETE） | JWT + 只能操作自己的 | 2026-03-28 補上 |
| 按讚（like） | JWT | 2026-03-28 補上 |
| 管理後台（admin/*） | ADMIN_SECRET 環境變數 | 2026-03-28 移除硬編碼 |
| 公開端點（gallery, comments GET） | 無（故意公開） | 正確設計 |
| 記錄端點（music-log, music-feedback） | 無 | fire-and-forget，低風險 |

### 5.3 其他安全措施

- **密碼**：bcrypt 雜湊 + 自動升級舊格式密碼
- **RLS**：Supabase Row Level Security 限制玩家只能存取自己的資料
- **SQL 注入**：Supabase 客戶端參數化查詢，無原始 SQL
- **內容過濾**：評論系統含髒話正則過濾

---

## 6. 修復歷史紀錄

### 2026-03-28 安全性修復（7 項）

| 編號 | 問題 | 修復 |
|------|------|------|
| P0-1 | 硬編碼管理密碼 "GhostStory2026" | 改為 `process.env.ADMIN_SECRET` |
| P0-2 | 遷移檔欄位名不一致 | subordinates→followers, affection→relationships |
| P0-3 | comments 無認證 | 補上 JWT + 只能刪自己的 |
| P0-4 | like 無認證 | 補上 JWT |
| P1-1 | 24 個 debug console.log | 清理至 3 個（條件式） |
| P1-2 | export 無認證 | 補上 JWT |
| P1-3 | void promise 無錯誤處理 | 補上 .then() 錯誤處理 |

### 之前修復的問題

| 問題 | 狀態 | 說明 |
|------|------|------|
| GAME_DATA AI 不輸出 | 多輪修復 | 改用簡單標記格式、修正 prompt 位置、加入動態提醒 |
| player_stats DB 寫入失敗 | 已修復 | 欄位名 followers/relationships 與 DB 對齊 |
| ABC 選項與 ending 不一致 | 已修復 | `isStoryConclusion()` 偵測結局跳過選項驗證 |
| 匯出 JSON 解析錯誤 | 已修復 | 改用 ReadableStream 串流，不用 JSON |
| 補齊歷史正則不匹配 | 已修復 | normalize 全形括號 + 去除前導符號 |
| 記憶摘要不同步 | 已修復 | roundCounter 對齊 |
| Haiku 截斷導致 keyFacts 不更新 | 已修復 | maxTokens 500→1000 + JSON 截斷修復 |

### 待觀察問題

| 問題 | 狀態 | 說明 |
|------|------|------|
| AI 是否穩定輸出 GAME_DATA 標記 | 待觀察 | 簡單標記格式應比 JSON 穩定，需更多玩家測試 |
| Prompt Caching 是否實際生效 | 待驗證 | 已加 beta header，需查 token_usage 的 cache 欄位 |
| playerId fallback 安全風險 | 待處理 | 向後相容用，應設期限移除 |

---

## 7. 檔案結構總覽

```
app/
├── .env.example           — 環境變數範本
├── .env.local             — 環境變數（不入 git）
├── .github/workflows/
│   └── daily-backup.yml   — 每日自動備份到 Supabase Storage
├── scripts/
│   └── backup.js          — 備份腳本（6 張表）
├── public/audio/           — BGM 音檔（7 首）
├── supabase/migrations/    — 12 個遷移檔
├── src/
│   ├── app/
│   │   ├── layout.tsx      — 全域佈局
│   │   ├── page.tsx        — 遊戲入口（認證→存檔→遊戲流程）
│   │   ├── api/            — 22 個 API 路由
│   │   ├── admin/          — 5 個管理頁面
│   │   ├── gallery/        — 作品牆頁面
│   │   ├── profile/[name]/ — 玩家資料頁
│   │   └── story/[id]/     — 故事閱讀頁
│   ├── components/         — 10 個 React 元件
│   ├── lib/
│   │   ├── claude.ts       — Claude API 客戶端（Prompt Caching）
│   │   ├── game-store.ts   — 遊戲狀態管理（Context + useReducer）
│   │   ├── game-data-parser.ts — GAME_DATA 標記解析 + DB 寫入
│   │   ├── validateResponse.ts — AI 回覆驗證 + 選項品質修復
│   │   ├── context-guard.ts — 上下文一致性驗證
│   │   ├── token-logger.ts — Token 使用量記錄
│   │   ├── auth-guard.ts   — JWT 認證守衛
│   │   ├── jwt.ts          — JWT 簽發/驗證
│   │   ├── api-client.ts   — 前端 authFetch
│   │   ├── scene-bgm.ts    — BGM 場景映射
│   │   ├── supabase.ts     — 前端 Supabase client
│   │   ├── supabase-server.ts — 伺服器端 Supabase client
│   │   ├── announcements.ts — 公告管理
│   │   └── prompts/
│   │       ├── core.ts     — 核心 System Prompt + GAME_DATA 規則
│   │       ├── index.ts    — Prompt 組裝 + 記憶注入 + 分層載入
│   │       ├── characters.ts — 角色設定 + NPC 資料
│   │       ├── locations.ts — 6 個地點描述
│   │       └── death-scenes.ts — 死亡劇情 + 輪迴轉生 prompt
│   └── types/
│       └── game.ts         — TypeScript 型別定義
```

---

## 8. 資料庫遷移紀錄

| 編號 | 檔名 | 內容 |
|------|------|------|
| 001 | initial_schema.sql | 核心 5 表：players, game_sessions, conversation_logs, player_memory, story_exports + RLS |
| 002 | token_usage.sql | token_usage 表 + 統計函數 |
| 002v2 | token_usage_v2.sql | 修正版（移除 auth_user_id 引用） |
| 003 | multi_slot_and_admin.sql | 多存檔 + 管理統計函數 |
| 004 | character_name.sql | game_sessions 加 character_name 欄位 |
| 005 | gallery.sql | story_exports 加社群欄位 + comments 表 + story_likes 表 |
| 006 | error_logs.sql | error_logs 表 |
| 007 | session_heartbeat.sql | game_sessions 加 last_active_at |
| 008 | music_logs.sql | music_logs 表 |
| 009 | music_feedback.sql | music_feedback 表 |
| 010 | add_cache_token_columns.sql | token_usage 加 cache 欄位 |
| 011 | player_stats.sql | player_stats + player_stats_history 表 |

---

## 9. 環境變數清單

```
# Supabase（必要）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic AI（必要）
ANTHROPIC_API_KEY=

# 管理後台（必要）
ADMIN_SECRET=

# JWT（有預設值但建議自訂）
JWT_SECRET=

# Azure TTS（選用）
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
```

---

## 10. 未來規劃建議

### 10.1 商業化方向

- **免費層**：每日 10 輪對話（Haiku 查詢不限）
- **付費層**：無限對話 + 有聲書匯出 + 多角色線
- **變現**：故事匯出 PDF 付費、進階 BGM 包
- **社群**：作品牆已有基礎，可加入排行榜、主題活動

### 10.2 待開發功能

| 功能 | 優先級 | 說明 |
|------|--------|------|
| 移除 playerId fallback | 高 | 安全風險，設棄用期限 |
| Rate limiting | 中 | 防止 API 濫用 |
| ESLint 設定 | 中 | 目前無 lint 設定 |
| 成就系統 | 低 | 基於 player_stats 的成就解鎖 |
| 多結局分支 | 低 | 目前只有一個必救小倩的結局 |
| 圖片生成 | 低 | 用 AI 為場景生成配圖 |

### 10.3 技術債務

| 項目 | 風險 | 說明 |
|------|------|------|
| playerId fallback | 高 | `authenticateOrFallback` 無 JWT 時信任 body，可偽造 |
| JWT_SECRET 有預設值 | 中 | `jwt.ts` 有 hardcoded fallback secret |
| core.ts 註解不準確 | 低 | 寫「~500 tokens」但實際 ~1,960 tokens |
| ChatInterface 1,400 行 | 低 | 單檔過大，可拆分 |
| test-game-data 端點無認證 | 低 | Debug 用，上線前應移除或加認證 |
