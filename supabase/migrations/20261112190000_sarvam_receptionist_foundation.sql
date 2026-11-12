-- AKOCP AI receptionist: isolated call, request, and verified format tables.
-- Review against the existing AKOCP schema before applying to production.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create table if not exists public.receptionist_calls (
 id uuid primary key default gen_random_uuid(),
 interaction_id text not null unique check (char_length(interaction_id) between 4 and 160),
 caller_phone text not null, agent_phone text, source text not null default 'sarvam',
 duration_seconds integer not null default 0 check (duration_seconds between 0 and 7200),
 end_reason text, recording_consent text not null default 'unknown' check (recording_consent in ('unknown','granted','declined')),
 transcript text, recording_reference text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.receptionist_requests (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null references public.receptionist_calls(id) on delete cascade,
 item_number integer not null check (item_number between 1 and 20),
 customer_name text, song_title text not null check (char_length(trim(song_title)) between 2 and 200),
 song_language text,
 language_status text not null default 'unverified' check (language_status in ('unverified','reported_by_caller','verified_inventory')),
 karaoke_format text not null check (karaoke_format in ('audio','video')),
 inventory_track_id uuid references public.inventory_tracks(id) on delete set null,
 stock_status text not null default 'not_verified' check (stock_status in ('not_verified','available','not_available')),
 quote_amount numeric(12,2) check (quote_amount is null or quote_amount > 0),
 quote_status text not null default 'pending' check (quote_status in ('pending','provisional','verified')),
 caller_approved boolean not null default false, approval_utterance text,
 whatsapp_phone text, whatsapp_confirmed_by_caller boolean not null default false,
 review_status text not null default 'new' check (review_status in ('new','reviewed','rejected')),
 linked_order_id uuid references public.orders(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (call_id,item_number)
);
create table if not exists public.receptionist_inventory_formats (
 inventory_track_id uuid primary key references public.inventory_tracks(id) on delete cascade,
 audio_available boolean not null default false, video_available boolean not null default false,
 audio_price numeric(12,2) check (audio_price is null or audio_price > 0),
 video_price numeric(12,2) check (video_price is null or video_price > 0),
 verified_at timestamptz, verified_by uuid references public.profiles(id),
 check ((not audio_available or audio_price is not null) and (not video_available or video_price is not null))
);
create index if not exists receptionist_calls_created_idx on public.receptionist_calls(created_at desc);
create index if not exists receptionist_requests_call_idx on public.receptionist_requests(call_id,item_number);
create index if not exists receptionist_requests_queue_idx on public.receptionist_requests(review_status,created_at desc);
alter table public.receptionist_calls enable row level security;
alter table public.receptionist_requests enable row level security;
alter table public.receptionist_inventory_formats enable row level security;
revoke all on public.receptionist_calls,public.receptionist_requests,public.receptionist_inventory_formats from public,anon,authenticated;
grant select on public.receptionist_calls to authenticated;
grant select on public.receptionist_requests to authenticated;
grant update (whatsapp_phone,whatsapp_confirmed_by_caller,review_status,updated_at) on public.receptionist_requests to authenticated;
grant select,insert,update,delete on public.receptionist_inventory_formats to authenticated;
create policy "active operators read calls" on public.receptionist_calls for select to authenticated
 using ((select akocp_private.is_active_user()));
create policy "active operators read requests" on public.receptionist_requests for select to authenticated
 using ((select akocp_private.is_active_user()));
create policy "active operators review requests" on public.receptionist_requests for update to authenticated
 using ((select akocp_private.is_active_user())) with check ((select akocp_private.is_active_user()));
create policy "active operators read formats" on public.receptionist_inventory_formats for select to authenticated
 using ((select akocp_private.is_active_user()));
create policy "founder manages format verification" on public.receptionist_inventory_formats for all to authenticated
 using ((select akocp_private.is_active_user()) and (select public.is_founder()))
 with check ((select akocp_private.is_active_user()) and (select public.is_founder()));
commit;
