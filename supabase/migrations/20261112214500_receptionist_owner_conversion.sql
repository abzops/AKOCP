-- Phase 2: Founder-reviewed, idempotent conversion from voice enquiries into AKOCP orders.
-- Apply ONLY after 20261112190000_sarvam_receptionist_foundation.sql.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Only the trusted server role may invoke the existing read-only inventory search for voice calls.
grant execute on function public.search_inventory(text,text,text,text,uuid,integer) to service_role;
grant select on public.receptionist_inventory_formats, public.inventory_tracks, public.services to service_role;
grant select, insert, update on public.receptionist_calls, public.receptionist_requests to service_role;

alter table public.receptionist_requests
  drop constraint if exists receptionist_requests_language_status_check;
alter table public.receptionist_requests
  add constraint receptionist_requests_language_status_check
  check (language_status in ('unverified','reported_by_caller','verified_inventory','owner_verified'));
alter table public.receptionist_requests
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

-- These methods are the ONLY route from an untrusted AI lead to the financial order model.
-- We deliberately do not let Sarvam's tool token invoke either of these methods.
create or replace function public.receptionist_verify_quote(
 p_request_id uuid,
 p_language text,
 p_confirm_unavailable boolean default false
) returns public.receptionist_requests
language plpgsql security definer set search_path = '' as $$
declare
 r public.receptionist_requests%rowtype;
 fmt public.receptionist_inventory_formats%rowtype;
 track public.inventory_tracks%rowtype;
 service_code text;
 catalog_price numeric;
 quoted numeric;
 chosen text := trim(coalesce(p_language,''));
begin
 perform akocp_private.assert_active_user();
 if not public.is_founder() then raise exception 'Founder access required' using errcode='42501'; end if;
 if char_length(chosen) not between 2 and 60 or lower(chosen) in ('unknown','other','unverified')
 then raise exception 'Verify the song language before final quoting'; end if;
 select * into r from public.receptionist_requests where id=p_request_id for update;
 if not found then raise exception 'Call enquiry not found'; end if;
 if r.linked_order_id is not null then raise exception 'Order is already linked'; end if;

 if r.stock_status='available' then
   if r.karaoke_format='audio' then
     -- AKOCP currently has a ready-made VIDEO service only. Do not mislabel audio.
     raise exception 'Ready-made audio requires an approved inventory service mapping';
   end if;
   select * into track from public.inventory_tracks where id=r.inventory_track_id and deleted_at is null;
   if not found then raise exception 'Inventory title is no longer available'; end if;
   select * into fmt from public.receptionist_inventory_formats where inventory_track_id=track.id;
   if fmt.verified_at is null or fmt.video_available is distinct from true or fmt.video_price is null
   then raise exception 'Ready-made video availability and price must be verified'; end if;
   if lower(trim(track.language)) <> lower(chosen)
   then raise exception 'Song language differs from verified inventory'; end if;
   quoted := fmt.video_price;
   service_code := 'EX250';
 elsif p_confirm_unavailable is true then
   if r.inventory_track_id is not null then
     select * into fmt from public.receptionist_inventory_formats where inventory_track_id=r.inventory_track_id;
     if fmt.verified_at is not null and
       (case when r.karaoke_format='audio' then fmt.audio_available else fmt.video_available end)
     then raise exception 'A verified ready-made track exists for this format'; end if;
   end if;
   service_code := case
     when r.karaoke_format='audio' then 'AU150'
     when lower(chosen) in ('malayalam','മലയാളം','ml','ml-in') then 'ML350'
     else 'OL450' end;
   quoted := case service_code when 'AU150' then 150 when 'ML350' then 350 else 450 end;
 else
   raise exception 'Stock is not verified. Confirm unavailable to quote custom production';
 end if;

 select price into catalog_price from public.services where code=service_code and active=true;
 if not found then raise exception 'Matching sales service is inactive or missing'; end if;
 if service_code <> 'EX250' and catalog_price <> quoted
 then raise exception 'Existing service catalog price differs from the approved custom price'; end if;

 update public.receptionist_requests
 set song_language=chosen, language_status=case when service_code='EX250' then 'verified_inventory' else 'owner_verified' end,
     stock_status=case when service_code='EX250' then 'available' else 'not_available' end,
     inventory_track_id=case when service_code='EX250' then inventory_track_id else null end,
     quote_amount=quoted, quote_status='verified',
     -- If the owner-verified amount is different from the quoted amount heard on the call,
     -- the earlier consent is invalid; require the customer to explicitly approve the new price.
     caller_approved=case when r.quote_amount=quoted then r.caller_approved else false end,
     approval_utterance=case when r.quote_amount=quoted then r.approval_utterance else null end,
     reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now()
 where id=p_request_id returning * into r;
 return r;
end;
$$;

create or replace function public.receptionist_create_order(
 p_request_id uuid,
 p_customer_name text default null,
 p_whatsapp_phone text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
 r public.receptionist_requests%rowtype;
 call_record public.receptionist_calls%rowtype;
 selected_service uuid;
 service_code text;
 catalog_price numeric;
 ready_price numeric;
 quote_language text;
 phone_digits text;
 whatsapp_digits text;
 customer_name_value text;
 resulting_order uuid;
begin
 perform akocp_private.assert_active_user();
 if not public.is_founder() then raise exception 'Founder access required' using errcode='42501'; end if;
 select * into r from public.receptionist_requests where id=p_request_id for update;
 if not found then raise exception 'Call enquiry not found'; end if;
 if r.linked_order_id is not null then return r.linked_order_id; end if;
 if not r.caller_approved or char_length(trim(coalesce(r.approval_utterance,'')))<2
 then raise exception 'Customer did not explicitly approve this request'; end if;
 if r.review_status='rejected' then raise exception 'Rejected enquiries cannot be converted'; end if;
 if r.quote_status<>'verified' or r.quote_amount is null
   or r.language_status not in ('verified_inventory','owner_verified')
 then raise exception 'Founder must verify inventory, language and price before creating the order'; end if;
 select * into call_record from public.receptionist_calls where id=r.call_id;
 if not found then raise exception 'Call record not found'; end if;
 phone_digits := regexp_replace(call_record.caller_phone,'[^0-9]','','g');
 if phone_digits ~ '^91[6-9][0-9]{9}$' then phone_digits:=substring(phone_digits from 3); end if;
 if phone_digits !~ '^[0-9]{10,15}$' then raise exception 'Caller phone must be verified'; end if;
 customer_name_value:=trim(coalesce(nullif(p_customer_name,''),r.customer_name,''));
 if char_length(customer_name_value) not between 2 and 100
 then raise exception 'Customer name is required and must be 2 to 100 characters'; end if;
 whatsapp_digits:=regexp_replace(coalesce(nullif(p_whatsapp_phone,''),r.whatsapp_phone,''),'[^0-9]','','g');
 if whatsapp_digits<>'' and whatsapp_digits !~ '^[0-9]{10,15}$'
 then raise exception 'WhatsApp number is invalid'; end if;
 -- No phone is silently assumed to have WhatsApp.
 if whatsapp_digits<>'' and r.whatsapp_confirmed_by_caller is not true and p_whatsapp_phone is null
 then whatsapp_digits:=''; end if;

 if r.stock_status='available' then
   if r.karaoke_format<>'video' then raise exception 'Ready-made audio service needs review'; end if;
   select (case when r.karaoke_format='audio' then f.audio_price else f.video_price end)
      into ready_price
   from public.receptionist_inventory_formats f join public.inventory_tracks t on t.id=f.inventory_track_id
   where f.inventory_track_id=r.inventory_track_id and f.verified_at is not null
     and t.deleted_at is null and f.video_available and lower(trim(t.language))=lower(trim(r.song_language));
   if ready_price is null or ready_price<>r.quote_amount
     then raise exception 'Inventory price/availability changed; re-verify before ordering'; end if;
   service_code:='EX250';
 else
   if r.stock_status<>'not_available' then raise exception 'Inventory must be reviewed'; end if;
   service_code:=case when r.karaoke_format='audio' then 'AU150'
     when lower(trim(r.song_language)) in ('malayalam','മലയാളം','ml','ml-in') then 'ML350'
     else 'OL450' end;
   if r.quote_amount<>(case service_code when 'AU150' then 150 when 'ML350' then 350 else 450 end)
   then raise exception 'Custom quote does not match the fixed rate'; end if;
 end if;
 select id,price into selected_service,catalog_price from public.services
   where code=service_code and active=true;
 if selected_service is null then raise exception 'Selected service is inactive'; end if;
 if service_code<>'EX250' and catalog_price<>r.quote_amount
 then raise exception 'Service catalog changed; re-verify'; end if;

 resulting_order:=public.create_order_priced(
   customer_name_value,phone_digits,
   whatsapp_digits, null::text, selected_service,
   case when service_code='EX250' then r.inventory_track_id else null end,
   r.song_title, r.song_language,
   null::date, auth.uid(), 'Created from verified AI receptionist call enquiry',
   null::text, null::integer,'other'::text,r.quote_amount
 );
 update public.receptionist_requests set linked_order_id=resulting_order,
   review_status='reviewed',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
 where id=r.id;
 return resulting_order;
end;
$$;

revoke all on function public.receptionist_verify_quote(uuid,text,boolean) from public,anon;
revoke all on function public.receptionist_create_order(uuid,text,text) from public,anon;
grant execute on function public.receptionist_verify_quote(uuid,text,boolean) to authenticated;
grant execute on function public.receptionist_create_order(uuid,text,text) to authenticated;
commit;
