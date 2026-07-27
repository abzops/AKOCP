-- Move the hosted-free copilot from Groq to NVIDIA NIM.
-- The API credential remains an Edge Function secret named NVIDIA_API_KEY.

alter table public.ai_settings
  drop constraint if exists ai_settings_primary_model_check;

alter table public.ai_settings
  drop constraint if exists ai_settings_fallback_model_check;

alter table public.ai_settings
  alter column primary_model set default 'qwen/qwen3.5-122b-a10b';

update public.ai_settings
set primary_model = 'qwen/qwen3.5-122b-a10b'
where primary_model = 'qwen/qwen3.6-27b';

update public.ai_settings
set fallback_model = 'qwen/qwen3.5-122b-a10b'
where fallback_model = 'qwen/qwen3.6-27b';

alter table public.ai_settings
  add constraint ai_settings_primary_model_check
  check (primary_model in ('qwen/qwen3.5-122b-a10b', 'openai/gpt-oss-20b'));

alter table public.ai_settings
  add constraint ai_settings_fallback_model_check
  check (fallback_model in ('qwen/qwen3.5-122b-a10b', 'openai/gpt-oss-20b'));

create or replace function public.update_ai_settings(
  p_enabled boolean,
  p_primary_model text,
  p_fallback_model text,
  p_daily_request_limit integer,
  p_max_output_tokens integer
)
returns public.ai_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.ai_settings%rowtype;
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  if p_primary_model not in ('qwen/qwen3.5-122b-a10b', 'openai/gpt-oss-20b') then raise exception 'Primary model is not allowed'; end if;
  if p_fallback_model not in ('qwen/qwen3.5-122b-a10b', 'openai/gpt-oss-20b') then raise exception 'Fallback model is not allowed'; end if;
  if p_daily_request_limit not between 1 and 1000 then raise exception 'Daily request limit is out of range'; end if;
  if p_max_output_tokens not between 64 and 1200 then raise exception 'Output token limit is out of range'; end if;

  update public.ai_settings
  set
    enabled = p_enabled,
    primary_model = p_primary_model,
    fallback_model = p_fallback_model,
    daily_request_limit = p_daily_request_limit,
    max_output_tokens = p_max_output_tokens,
    updated_by = auth.uid()
  where id = 1
  returning * into settings_row;

  return settings_row;
end;
$$;

grant execute on function public.update_ai_settings(boolean,text,text,integer,integer) to authenticated;
