-- Migration: replace deprecated qwen/qwen3-next-80b-a3b-instruct with meta/llama-3.3-70b-instruct

-- 1. Drop old check constraints on the table
ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_primary_model_check;
ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_fallback_model_check;

-- 2. Update the live row to the new model
UPDATE public.ai_settings
SET
  primary_model  = 'meta/llama-3.3-70b-instruct',
  fallback_model = 'openai/gpt-oss-20b',
  provider_status = 'not_checked',
  provider_error  = NULL
WHERE id = 1;

-- 3. Add new check constraints
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_primary_model_check
    CHECK (primary_model IN ('meta/llama-3.3-70b-instruct', 'openai/gpt-oss-20b'));
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_fallback_model_check
    CHECK (fallback_model IN ('meta/llama-3.3-70b-instruct', 'openai/gpt-oss-20b'));

-- 4. Update the update_ai_settings RPC to allow the new model name
CREATE OR REPLACE FUNCTION public.update_ai_settings(
  p_enabled boolean,
  p_primary_model text,
  p_fallback_model text,
  p_daily_request_limit integer,
  p_max_output_tokens integer
)
RETURNS public.ai_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings_row public.ai_settings%rowtype;
BEGIN
  IF NOT public.is_founder() THEN RAISE EXCEPTION 'Founder permission is required'; END IF;
  IF p_primary_model NOT IN ('meta/llama-3.3-70b-instruct', 'openai/gpt-oss-20b') THEN RAISE EXCEPTION 'Primary model is not allowed'; END IF;
  IF p_fallback_model NOT IN ('meta/llama-3.3-70b-instruct', 'openai/gpt-oss-20b') THEN RAISE EXCEPTION 'Fallback model is not allowed'; END IF;
  IF p_daily_request_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Daily request limit is out of range'; END IF;
  IF p_max_output_tokens NOT BETWEEN 64 AND 1200 THEN RAISE EXCEPTION 'Output token limit is out of range'; END IF;

  UPDATE public.ai_settings
  SET
    enabled = p_enabled,
    primary_model = p_primary_model,
    fallback_model = p_fallback_model,
    daily_request_limit = p_daily_request_limit,
    max_output_tokens = p_max_output_tokens,
    updated_by = auth.uid()
  WHERE id = 1
  RETURNING * INTO settings_row;

  RETURN settings_row;
END;
$$;
