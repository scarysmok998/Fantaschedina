-- FantaSchedina AI — registrazione condivisa e atomica dei consumi Gemini.
-- Eseguire UNA VOLTA nel SQL Editor di Supabase (Database / ruolo postgres).
-- Rileva il giorno secondo il fuso America/Los_Angeles, come il reset RPD Gemini.
CREATE TABLE IF NOT EXISTS public.fantaschedina_ai_requests (
  id bigint generated always as identity primary key,
  day date NOT NULL,
  minute_bucket timestamptz NOT NULL,
  device_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_device_hash_format CHECK (device_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS ai_requests_day_idx ON public.fantaschedina_ai_requests(day);
CREATE INDEX IF NOT EXISTS ai_requests_device_day_idx ON public.fantaschedina_ai_requests(day,device_hash);
CREATE INDEX IF NOT EXISTS ai_requests_minute_idx ON public.fantaschedina_ai_requests(minute_bucket);
ALTER TABLE public.fantaschedina_ai_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fantaschedina_ai_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.fantaschedina_ai_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fantaschedina_ai_requests_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.fantaschedina_ai_quota(p_device_hash text, p_reserve boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'America/Los_Angeles')::date;
  v_minute timestamptz := date_trunc('minute', now());
  v_used integer;
  v_device integer;
  v_minute_used integer;
  v_reset timestamptz := ((v_day + 1)::timestamp AT TIME ZONE 'America/Los_Angeles');
  v_allowed boolean := true;
  v_reason text := null;
BEGIN
  IF p_device_hash IS NULL OR p_device_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid device hash';
  END IF;
  -- Blocca contemporaneamente le richieste concorrenti, anche su istanze Vercel diverse.
  IF p_reserve THEN
    PERFORM pg_advisory_xact_lock(82736521);
  END IF;
  SELECT count(*)::integer INTO v_used FROM public.fantaschedina_ai_requests WHERE day=v_day;
  SELECT count(*)::integer INTO v_device FROM public.fantaschedina_ai_requests WHERE day=v_day AND device_hash=p_device_hash;
  SELECT count(*)::integer INTO v_minute_used FROM public.fantaschedina_ai_requests WHERE minute_bucket=v_minute;
  IF p_reserve THEN
    IF v_used >= 500 THEN v_allowed := false; v_reason := 'Limite di 500 richieste giornaliere raggiunto.';
    ELSIF v_device >= 40 THEN v_allowed := false; v_reason := 'Questo dispositivo ha raggiunto le 40 domande giornaliere.';
    ELSIF v_minute_used >= 15 THEN v_allowed := false; v_reason := 'Raggiunte 15 richieste in un minuto. Riprova tra poco.';
    ELSE
      INSERT INTO public.fantaschedina_ai_requests(day, minute_bucket, device_hash) VALUES(v_day,v_minute,p_device_hash);
      v_used := v_used+1;v_device:=v_device+1;v_minute_used:=v_minute_used+1;
    END IF;
  END IF;
  RETURN jsonb_build_object('allowed',v_allowed,'reason',v_reason,
    'used',v_used,'dailyLimit',500,'remaining',greatest(0,500-v_used),
    'deviceUsed',v_device,'deviceLimit',40,'minuteUsed',v_minute_used,'minuteLimit',15,
    'resetAt',to_char(v_reset AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
END;
$$;
REVOKE ALL ON FUNCTION public.fantaschedina_ai_quota(text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fantaschedina_ai_quota(text,boolean) TO service_role;
