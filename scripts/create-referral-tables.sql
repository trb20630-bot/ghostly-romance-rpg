-- ============================================
-- 邀請分享系統：擴充 players 表 + 建立 referral_records 表
-- ============================================

-- Step 1: 擴充 players 表
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referral_code VARCHAR(6) UNIQUE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referred_by UUID;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS has_shared BOOLEAN DEFAULT FALSE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS share_reward_claimed BOOLEAN DEFAULT FALSE;

-- Step 2: 為現有玩家生成邀請碼
DO $$
DECLARE
  r RECORD;
  new_code VARCHAR(6);
  attempts INT;
BEGIN
  FOR r IN SELECT id FROM public.players WHERE referral_code IS NULL LOOP
    attempts := 0;
    LOOP
      new_code := upper(substr(md5(random()::text || r.id::text), 1, 6));
      BEGIN
        UPDATE public.players SET referral_code = new_code WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts > 10 THEN
          RAISE EXCEPTION 'Failed to generate unique referral code for player %', r.id;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

-- Step 3: 建立 referral_records 表
CREATE TABLE IF NOT EXISTS public.referral_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL,
  invitee_id UUID NOT NULL,
  inviter_reward_coins INT DEFAULT 15,
  inviter_reward_rounds INT DEFAULT 5,
  invitee_reward_coins INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_records_invitee_unique ON public.referral_records (invitee_id);

-- Step 4: RLS
ALTER TABLE public.referral_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_records_service_only" ON public.referral_records
  FOR ALL USING (auth.role() = 'service_role');
