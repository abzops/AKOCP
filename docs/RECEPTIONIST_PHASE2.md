# AKOCP Voice Receptionist — Phase 2 / Deployment Playbook

**Source status:** Phase 2 draft PR, stacked on Phase 1. NO live database, phone or voice deployment was performed.

## Existing infrastructure and strict project separation
- GitHub: https://github.com/abzops/AKOCP (default branch \`master\`).
- The AKOCP repository references Supabase project \`cqptdpkhaiomitwzjysp\`.
- The connected Supabase app was not authorized to access that project during this development session. Never deploy these migrations to the other accessible XS Gym database or reuse its service-role key.
- If Supabase account access is restored, inspect **AKOCP** project region, database status, migrations, RLS and backups **before** making any change.

## Phase 2 features in source
1. Founder verifies each inventory track's audio and lyrics-video availability separately. When an item exists, enter its *actual ready-made price*; never substitute custom-production prices.
2. Quote verification RPC checks the real available format or requires Founder to confirm the format is missing. A video song's language must be verified manually before the quote becomes final.
3. Founder-only \`receptionist_create_order\` creates one linked order per approved request using existing AKOCP \`create_order_priced\`, preserving payment and ledger rules. It is idempotent under concurrent retries. Caller approval alone **does not create a financially posted order** without Founder review.
4. Authenticated \`receptionist-recording\` streams consent-gated WAV from Sarvam. Every request validates the caller's AKOCP Auth session, active profile, and internal call ID before using the server-only Sarvam key.
5. Dashboard shows source caller, spoken approval text, contact editor, quotation state, linked order and manual WhatsApp draft.

## Current limitations
- **Do not activate incoming calls until the actual Sarvam API tool + inbound webhook have been tested.**
- Ready-made audio cannot yet convert to an AKOCP order because the original schema only has \`EX250\` *Ready-Made Karaoke Video* service. It stays blocked instead of mislabeled.
- Sarvam's provider-side recording may begin before the agent asks for consent; withholding transcript/playback in AKOCP does **not** delete provider recordings. Confirm a compliant consent/retention procedure with Sarvam before accepting real customer calls.
- A telephone number's format cannot prove it is registered on WhatsApp. Always ask the customer and send the prepared WhatsApp message manually.
- Automatic song-language research through an external catalog is not yet integrated. Founder verifies it; the AI may quote provisionally but cannot approve an unverified video quote.
- Recording player remains untested against real Sarvam media until the actual AKOCP project and Sarvam workspace credentials are connected.

## Required server-only environment secrets
Set through Supabase project settings / Edge Function secrets on **AKOCP** project, not GitHub or Vite:
- \`AKOCP_VOICE_TOOL_TOKEN\`: distinct cryptographically random 32+ character Bearer credential for Sarvam API tools.
- \`AKOCP_VOICE_WEBHOOK_TOKEN\`: another 32+ character random token for inbound post-call webhook (URL query parameter). Limit URL logging and rotate if exposed.
- \`SARVAM_API_KEY\`: current private Sarvam workspace key. **Rotate any key exposed in a screenshot or conversation before deployment.**
- \`SARVAM_ORG_ID\`, \`SARVAM_WORKSPACE_ID\`, \`SARVAM_VOICE_APP_ID\`: identifiers for the voice agent used for recordings.
- Supabase \`SUPABASE_URL\`, \`SUPABASE_ANON_KEY\`, \`SUPABASE_SERVICE_ROLE_KEY\` are provided to Supabase Edge Functions by the project runtime; never put service-role values in a browser/client build.

## Functions
- \`receptionist\`: **verify_jwt=false**, but validates either independent Bearer tool token or post-call webhook URL token before doing anything.
- \`receptionist-recording\`: **verify_jwt=true**, validates the logged-in user's token again using Auth and checks active profile and stored call consent. Proxy sends \`X-API-Key\` only to \`apps.sarvam.ai\` over HTTPS and streams WAV with no-store.

## Voice agent tool payloads
Use Sarvam Voice Agent API tools (name them \`lookup_karaoke\`, \`quote_custom\`, \`capture_request\`). Configure the secure API tool Bearer token through Sarvam's masked Secrets UI. Map **Interaction ID** and **User Identifier** as call-context variables, not LLM-generated values.

Lookup JSON: \`{"action":"lookup","query":"<song words>","format":"video"}\`  
Quote JSON: \`{"action":"quote","song_language":"Malayalam","format":"video"}\`  
Capture JSON: \`{"action":"capture","interaction_id":"<Call Interaction ID>","user_phone_number":"<Caller ID>","item_number":1,"song_title":"<exact title>","song_language":"Malayalam","format":"video","caller_approved":true,"approval_utterance":"<verbatim affirmative>","whatsapp_phone":"<caller-confirmed number>","whatsapp_confirmed_by_caller":true}\`.

Webhooks: \`POST /functions/v1/receptionist?webhook_token=<secret>\`. Use Sarvam's documented inbound \`interaction_id\`, \`user_phone_number\`, \`agent_phone_number\`, \`duration\`, \`final_agent_variables\`/ \`output_agent_variables\`, and \`interaction_transcript\` fields.

Important: when inventory results are ambiguous, ask the movie/artist. Never make up stock, song language or price. When the web lookup fails, log enquiry and offer human callback, not a guessed order.

## Release sequence
1. Check original AKOCP project and take a recoverable backup of critical business data.
2. Run migration \`20261112190000_sarvam_receptionist_foundation.sql\` then \`20261112214500_receptionist_owner_conversion.sql\`; verify all existing orders/payments remain intact and RLS and grants pass.
3. Deploy \`receptionist\` and \`receptionist-recording\` Edge Functions using the exact version of code from the reviewed PR.
4. Test song lookup and negative inventory results with Sarvam's API tool test tool, then post-call delivery retries. Confirm the stored consent behavior and transcript.
5. Use the Founder dashboard to verify 10 actual karaoke titles and both media-format variants. Test one approved call to linked order and one unapproved call that must *not* create an order.
6. Confirm private WAV retrieval returns 401/403 for signed-out/inactive users, 404 for unknown calls, and cannot fetch calls without consent.
7. Check all orders against service catalog pricing, payment invariants, and no duplicate creation.
8. Confirm carrier forwarding fees and caller-ID propagation with BSNL; use an inbound test number first.
9. Only after verified handset tests and sign-off, consider activation of BSNL forwarding.

References:
- https://docs.sarvam.ai/voice-agents/build/tools/https-tool
- https://docs.sarvam.ai/voice-agents/api/deployments/webhooks/webhook-payload
- https://docs.sarvam.ai/voice-agents/api/analytics/recordings
- https://supabase.com/docs/guides/functions/auth
