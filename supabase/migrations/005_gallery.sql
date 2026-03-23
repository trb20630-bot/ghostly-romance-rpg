-- =============================================
-- 作品分享系統
-- =============================================

-- story_exports 加入社交欄位
ALTER TABLE story_exports ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE story_exports ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;
ALTER TABLE story_exports ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE story_exports ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE story_exports ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

-- 留言表
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES story_exports(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_story ON comments(story_id, created_at);

-- 按讚表
CREATE TABLE IF NOT EXISTS story_likes (
  story_id UUID REFERENCES story_exports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

-- RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON story_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "likes_delete" ON story_likes FOR DELETE USING (true);
CREATE POLICY "likes_select" ON story_likes FOR SELECT USING (true);
