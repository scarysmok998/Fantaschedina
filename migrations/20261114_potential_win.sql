BEGIN;

-- Apply in Supabase before deploying this version. Existing rounds remain NULL.
-- The bookmaker's declared gross total includes bonuses; do not recompute it.
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS potential_win numeric(12,2)
  CHECK (potential_win >= 0);
COMMENT ON COLUMN public.rounds.potential_win IS
  'Reviewed bookmaker potential gross payout including bonuses; NULL if unavailable. Not actual winnings.';

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS bonus_amount numeric(12,2)
  CHECK (bonus_amount >= 0 AND potential_win IS NOT NULL AND bonus_amount <= potential_win);
COMMENT ON COLUMN public.rounds.bonus_amount IS
  'Computed potential_win minus round(stake times product of seven original odds, 2); already included in total. NULL if inputs unavailable.';

COMMIT;
