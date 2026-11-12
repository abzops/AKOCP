# AKOCP Malayalam AI Receptionist — Phase 1

## Status
Feature branch only. Not deployed to the production site, original AKOCP database, Sarvam, or BSNL.
This is an **additive** module on top of AKOCP's existing inventory, services, customers, order ledger, finance and authentication. It records **enquiries**, NOT paid orders. No real orders are inserted by the voice agent.

## What is implemented
- Authenticated owner/operator dashboard at /receptionist (GitHub Pages /AKOCP/receptionist).
- Secure Edge Function actions: lookup, quote, capture; and call-end webhook.
- Search the existing AKOCP inventory using its existing search_inventory RPC.
- A song is only sold as ready-made when an owner verified the requested audio or video format and the price in receptionist_inventory_formats.
- Custom quotation: audio ₹150 (any language), lyrics video ₹350 (Malayalam), ₹450 (other recognized languages). Quote refuses unresolved language and blocks discrepancies with the AKOCP service catalog.
- Call lead captured once per interaction_id + item_number. Caller approval is recorded separately from owner review and financially confirmed orders.
- Record caller contact, requested track, language, format, approved quote, and optional transcript with consent.
- Owner can edit the WhatsApp contact number, open a prepared Malayalam WhatsApp message and manually open the existing order-entry form.
- No automatic WhatsApp send, no arbitrary WhatsApp existence checking, no recording playback without a private proxy.

## Architecture
BSNL SIM → verified call forwarding to Sarvam inbound number → Malayalam Voice Agent → authenticated AKOCP Edge Function → existing inventory/services → receptionist calls/requests → owner review → optional existing order workflow and WhatsApp click-to-chat.

## Security
**Never put the Sarvam key from the screenshot, Supabase service-role key, webhook URL token, or tool token into this public repository, the browser, or a VITE_ variable.** If any secret was copied into a screenshot/chat, rotate it before production.

Use distinct 32-byte-or-more random tokens:
- AKOCP_VOICE_TOOL_TOKEN: supplied as masked Bearer credential in Sarvam API tool headers.
- AKOCP_VOICE_WEBHOOK_TOKEN: supplied in the Sarvam webhook destination URL query parameter (treat URL as a secret; avoid provider/proxy access logs; rotate regularly).

The receptionist Edge Function uses verify_jwt=false only because it implements independent token authentication **before any database operation**. All other Edge Functions retain their existing JWT requirement. Supabase service role lives exclusively in server-side environment variables.

RLS: new calls/requests tables are read only by active operators. Browser may update only request review and WhatsApp fields. Only Founder can maintain inventory format verification. No browser insert/delete on call/request records.

## Deployment checklist (not executed)
1. Verify the original AKOCP Supabase project is accessible. The repository currently references project ref cqptdpkhaiomitwzjysp; this is **not** the connected xs-gym project. Do not apply a migration to XS Gym.
2. Review and apply supabase/migrations/20261112190000_sarvam_receptionist_foundation.sql using AKOCP's approved database change process. No other order, customer, or financial schema is changed.
3. Assign verified availability + selling prices to receptionist_inventory_formats; never initialize all existing songs as verified automatically.
4. Configure two secret values in the actual AKOCP Supabase project's Edge Function environment. Deploy supabase/functions/receptionist with JWT verification disabled only for that function.
5. Configure Sarvam Malayalam inbound voice agent and API tools; test on a sandbox/temporary number before any BSNL forwarding.
6. Confirm BSNL forwarding and original caller ID propagation, call recording consent, and legal/rights obligations.
7. Run scripts/tests and manual handset tests before merging this PR to master.

## Sarvam API tools
Endpoint: POST https://<AKOCP-PROJECT>.supabase.co/functions/v1/receptionist

Tool authentication header: Authorization: Bearer <AKOCP_VOICE_TOOL_TOKEN> (masked/secure in Sarvam; not in agent prompt)

### lookup_karaoke
{ "action": "lookup", "query": "<spoken song title>", "format": "audio" }
Response: candidate_matches with exact title, language, selected format, availability and **confirmed_price_inr only for verified format**. If ambiguous, ask for movie/artist.

### quote_custom_karaoke
{ "action": "quote", "song_language": "Malayalam", "format": "video" }
Response: quoted / needs_language / manual_review. Video quotes are provisional until language is checked.

### capture_karaoke_request
{ "action": "capture", "interaction_id": "<stable call id>", "user_phone_number": "<caller id>", "item_number": 1, "song_title": "<song>", "song_language": "Malayalam", "format": "video", "inventory_track_id": "<verified matching UUID or omitted>", "customer_name": "<name>", "whatsapp_phone": "<caller-confirmed number>", "whatsapp_confirmed_by_caller": true, "caller_approved": true, "approval_utterance": "<actual affirmative words spoken>" }

If caller did not approve, send caller_approved=false and omit approval_utterance. Repeated call-item writes are deduplicated. Response status queued_for_owner_review is **not** confirmation of a paid or inserted order.

### End-of-call webhook
POST https://<AKOCP-PROJECT>.supabase.co/functions/v1/receptionist?webhook_token=<AKOCP_VOICE_WEBHOOK_TOKEN>

The handler expects interaction_id, user_phone_number, duration, and agent_variables.recording_consent. It stores transcript only for granted consent. Call recording playback is explicitly not implemented. Use provider docs to verify the exact webhook shape before production.

## Malayalam agent system instructions
> You are the Abhinand Karaokes AI receptionist. Start in natural, concise Malayalam, identify yourself as AI, explain call recording and obtain consent before any storage. Ask the exact song title, movie or artist if uncertain, and audio karaoke versus lyrics video. Search using lookup_karaoke and never invent inventory or ready-made prices. If unavailable, offer a custom creation quote. Quote custom audio ₹150 in any language, video ₹350 if Malayalam and ₹450 for other languages. If language is uncertain, say you will confirm the rate. Confirm the song, format and quote; only record caller_approved after an explicit yes. Ask whether their calling number is their WhatsApp number; collect an alternative if not. Save with capture_karaoke_request. Do not say payment is complete or the financially recorded order has been created. If services fail, offer a human callback and do not guess.

Greeting example: “നമസ്കാരം, അഭിനന്ദ് കരോക്കെയ്സിലേക്ക് സ്വാഗതം. ഞാൻ AI റിസപ്ഷനിസ്റ്റാണ്. ഓർഡർ വിവരങ്ങൾക്കായി കോൾ റെക്കോർഡ് ചെയ്യുന്നതിന് സമ്മതമാണോ? ഏത് പാട്ടിന്റെ കരോക്കെയാണ് വേണ്ടത്?”

## Pre-launch gates
- Correct Malayalam and Manglish recognition, multi-song calls and ambiguous titles.
- Format-specific inventory matching; negative and unavailable cases.
- Exact ₹150/₹350/₹450 quotes; non-Malayalam and unresolved-language handling.
- Duplicate webhook/agent-tool retries and owner-review preservation.
- Recording refusal, missing/invalid WhatsApp number and data retention.
- Sarvam latency and real call reliability.
- Caller ID verification and callback/fallback procedure.
- Private recording player, verified song-language research, automatic owner-approved order creation, and accurate post-call analytics remain future phases.

## Local verification
npm ci
npm run typecheck
npm run lint
npm test
npm run build

Never publish or turn on live phone forwarding before these checks, a reviewed migration, and real-call acceptance tests have passed.
