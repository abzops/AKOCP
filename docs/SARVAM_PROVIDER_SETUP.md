# AKOCP — Sarvam AI provider and secure server setup

**Production project:** \`cqptdpkhaiomitwzjysp\` ("AKOCP" in Supabase, **NOT** XS Gym).  
**Voice AI:** Sarvam Voice Agents / Samvaad, hosted by Sarvam (no extra AI VPS).  
**Business backend:** AKOCP Supabase Edge Functions + existing Postgres inventory/orders.  
**Website:** https://abzops.github.io/AKOCP/#/receptionist  
**Tool endpoint:** https://cqptdpkhaiomitwzjysp.supabase.co/functions/v1/receptionist  
**Setup health endpoint:** deployed separately as \`receptionist-status\`, JWT required, accessible from the Founder dashboard. No secrets are ever returned.

## What is already deployed by the AKOCP team

- GitHub Pages frontend, React, Supabase Auth, 1,768-song inventory (count at setup time).
- \`receptionist\` call tools and end-call webhook; independently authenticated.
- \`receptionist-recording\` JWT-protected private audio playback.
- Receptionist calls, enquiries and per-track format verification tables; RLS-enabled.
- Backend quote checks: custom audio ₹150 any language; custom lyrics video ₹350 Malayalam, ₹450 other languages. Existing ready-made prices are **per catalog song and format**, not fixed rates.
- Founder-reviewed conversion to orders. Phone-call approval is NOT automatic payment, and does not insert a paid order.
- No audio/video ready-made product is assumed available until the owner verifies the actual file, selling price and rights in the dashboard.
- AI-approved order capture now checks \`quoted_price_inr\` against the backend's actual price. Without exact match no approved enquiry is inserted.

## Critical: never send credentials in ChatGPT, WhatsApp, or public GitHub

The **API key previously shown in a screenshot should be rotated** before actual calls.

There are two different kinds of Sarvam credentials:
1. **Sarvam workspace API key**: used only by the Supabase recording proxy to fetch recordings. Never paste into an API tool's Bearer-token field unless Sarvam explicitly requires it for its own APIs.
2. **AKOCP Voice Tool Token**: a dedicated random secret shared *only* by the Sarvam HTTP tools and your Supabase receptionist function. **Not** your Supabase anon key or service-role key.

There is a separate third secret for the call-end webhook. Do not reuse either credential.

## 1. Create strong AKOCP integration tokens

Generate two **different random strings of at least 32 characters**. On macOS/Linux in Terminal:

\`\`\`bash
openssl rand -hex 32
openssl rand -hex 32
\`\`\`

Copy each generated value privately into your password manager. If you are on a phone, use a reputable password-manager random generator to make two independent 64-character alphanumeric strings.

Never commit these values, never put them in \`VITE_...\`, and never send them in a chat.

## 2. Set six production secrets in Supabase

Open [AKOCP Supabase](https://supabase.com/dashboard/project/cqptdpkhaiomitwzjysp/functions) → **Edge Functions → Secrets** (sometimes listed as "Secrets" or "Environment variables"). Add:

| Name | Value you provide | Required for |
|---|---|---|
| \`AKOCP_VOICE_TOOL_TOKEN\` | First random 64-character secret | All three Sarvam HTTP tools |
| \`AKOCP_VOICE_WEBHOOK_TOKEN\` | **Different** second random secret | End-of-call webhook |
| \`SARVAM_API_KEY\` | Rotated workspace API key from Sarvam | Private call recording |
| \`SARVAM_ORG_ID\` | Sarvam Settings → Organisation → General | Private call recording |
| \`SARVAM_WORKSPACE_ID\` | Sarvam Settings → Workspace → General | Private call recording |
| \`SARVAM_VOICE_APP_ID\` | Voice agent menu ··· → Copy agent ID | Private call recording |

Save. Supabase injects its own \`SUPABASE_URL\`, \`SUPABASE_ANON_KEY\`, \`SUPABASE_SERVICE_ROLE_KEY\` into Edge Functions automatically. **Do not create or post copies of those keys**.

The Founder-only AKOCP "AI provider & server readiness" section reports secret presence, not their values. After saving, refresh the status there.

See https://supabase.com/docs/guides/functions/secrets

## 3. Create and configure the Malayalam agent

Visit https://indus.sarvam.ai/samvaad → **Voice Agents**.

Create a voice agent named **Abhinand Karaokes Receptionist**. Use:
- Starting language **Malayalam**.
- English as an allowed secondary language; enable language switching for code-mixed Malayalam/English customers. Add other languages only after testing.
- A natural, clear Malayalam-speaking voice. Avoid long greeting turns.
- 3 API tools (below); run **during conversation**, not on_start/on_end.
- Create a variable named \`recording_consent\` (allowed values: yes / no / unknown). Set yes only after express agreement, no on refusal. The call-end webhook must include it in \`final_agent_variables\` or \`output_agent_variables\`.
- Test in the browser's Voice and Chat test modes first. Only deploy an inbound number after the prompts and tools pass.

### Copy this into the agent's instructions

\`\`\`text
You are the AI receptionist of Abhinand Karaokes. Speak clearly and naturally in Malayalam first, with short conversational replies. Understand Malayalam, English and Manglish song titles and switch language only if the caller wants to.

Introduce yourself as an AI receptionist. Explain the call recording/processing and ask for consent. If they decline recording, do not claim that Sarvam has disabled platform-side recording; offer to finish without storing a transcript in AKOCP or transfer/offer a human callback as supported. Save recording_consent=yes only after express consent, otherwise recording_consent=no or unknown.

Ask the customer:
1. Which song? Ask movie/artist if ambiguous.
2. Audio karaoke or lyrics video karaoke?
3. Search via lookup_karaoke before claiming any ready-made song exists or saying its price.

Inventory rules:
- Treat exact verified available results as available at confirmed_price_inr only.
- If search returns multiple matches, ask them to pick the correct one; never invent a track or selling price.
- If no match or not_verified, explain availability is unconfirmed; do not say definitely unavailable. Offer owner review or a custom quote.
- Never read IDs aloud.

Custom creation:
- Audio: ₹150 for any language.
- Lyrics video: ₹350 for Malayalam, ₹450 for other languages.
- Call quote_custom_karaoke before quoting. If song language is unclear, ask; do not quote a final video price.
- Never use a custom creation price for ready-made inventory.

Only if the customer gives a clear yes after hearing the exact song, format and exact price, call capture_karaoke_request with caller_approved=true, the verbatim approval_utterance, AND quoted_price_inr as a NUMBER matching the backend quoted amount. Map interaction_id to the live Interaction ID call-context variable, and user_phone_number to the live User Identifier. Never generate these IDs or numbers.

For one call with multiple songs, use item_number=1,2,3... (up to 20) and confirm each separately.
If they do not approve, still log an enquiry with caller_approved=false, without any approval_utterance.
If capture returns price_reconfirmation_required, say the backend price aloud and obtain fresh approval before retrying with the same item number and the newly approved quoted_price_inr.

Ask if the caller's number is also their WhatsApp number; if not, collect the correct number, repeat it back and obtain permission. Do not promise that a WhatsApp message was sent: our dashboard prepares a draft that the owner sends manually.

The result is a quote/enquiry for Founder review, not a paid or confirmed order. Do not claim a payment was received, an order was financially posted, or work has started. If tools fail, offer a human callback; never invent prices, stock or delivery dates. Always end politely.
\`\`\`

Suggested greeting:
> നമസ്കാരം, അഭിനന്ദ് കരോക്കെയ്സിലേക്കു സ്വാഗതം. ഞാൻ AI റിസപ്ഷനിസ്റ്റാണ്. കരോക്കെ ഓർഡറുമായി ബന്ധപ്പെട്ട വിവരങ്ങൾക്കായി സഹായിക്കാം. കോൾ റെക്കോർഡ് ചെയ്യുന്നതിന് സമ്മതമാണോ?

## 4. Configure three HTTP tools

In Sarvam: **Build → Tools → Add tool → API**, select **POST**, then enter the same endpoint for every tool:

\`\`\`text
https://cqptdpkhaiomitwzjysp.supabase.co/functions/v1/receptionist
\`\`\`

Authentication: **Bearer token**, stored in Sarvam's secure/masked credential UI. Value = the FIRST random secret, matching \`AKOCP_VOICE_TOOL_TOKEN\`. Content type JSON. **Do not** put that token into the prompt, JSON body, or plain-text tool description.

### Tool A — \`lookup_karaoke\`

Run during conversation after asking song title and format. Request JSON:

\`\`\`json
{
  "action": "lookup",
  "query": "Song title heard from customer",
  "format": "audio"
}
\`\`\`

The \`format\` must be one of \`audio\` or \`video\`. Response contains \`candidate_matches\`, \`availability\`, \`confirmed_price_inr\`. Only an available result with a non-null confirmed price can be sold as ready-made.

### Tool B — \`quote_custom_karaoke\`

Run before speaking any custom price:

\`\`\`json
{
  "action": "quote",
  "song_language": "Malayalam",
  "format": "video"
}
\`\`\`

Returns \`quoted\` with \`amount_inr\` or \`needs_language\` / \`manual_review\`.

### Tool C — \`capture_karaoke_request\`

Run only once the caller has heard exact song, format, price and either explicitly accepted or requested more information.

\`\`\`json
{
  "action": "capture",
  "interaction_id": "<select @ Interaction ID>",
  "user_phone_number": "<select @ User Identifier>",
  "item_number": 1,
  "song_title": "Exact confirmed song name",
  "song_language": "Malayalam",
  "format": "video",
  "inventory_track_id": "",
  "customer_name": "Customer's spoken name",
  "whatsapp_phone": "+919876543210",
  "whatsapp_confirmed_by_caller": true,
  "caller_approved": true,
  "approval_utterance": "അതെ, ഈ വിലയ്ക്ക് ഓർഡർ ചെയ്യാം",
  "quoted_price_inr": 350
}
\`\`\`

For custom work, **omit** \`inventory_track_id\`. For a verified ready-made result, use the exact candidate's real UUID. For a non-approved enquiry use \`caller_approved:false\`, omit approval and quoted_price fields.

**Most important:** use Sarvam's \`@\` variable picker for Interaction ID and User Identifier. Don't send strings like \`<select @ Interaction ID>\`; they are placeholders for the editor.

If the backend reports \`price_reconfirmation_required\`, it has NOT saved an approved enquiry. Read back its \`expected_price_inr\`, ask again and retry.

In Sarvam's tool editor, configure an appropriate short timeout (e.g. 8 s) and an honest failure response such as "ഇപ്പോൾ സിസ്റ്റം പരിശോധിക്കാൻ കഴിയുന്നില്ല, ഞങ്ങൾ തിരിച്ചു വിളിക്കാം."

Documentation: https://docs.sarvam.ai/voice-agents/build/tools/https-tool

## 5. End-of-call webhook

On **Deploy → Inbounds**, create or edit the deployment and configure its **call-end webhook URL**:

\`\`\`text
https://cqptdpkhaiomitwzjysp.supabase.co/functions/v1/receptionist?webhook_token=<SECOND_RANDOM_SECRET>
\`\`\`

Replace the bracketed value **only in Sarvam's private deployment UI**, not GitHub or ChatGPT.

The webhook receives \`interaction_id\`, caller number, transcript and \`final_agent_variables\`/ \`output_agent_variables\`. AKOCP stores transcript only when recording consent was granted. Provider-side recording retention is a separate Sarvam setting; verify consent/retention requirements before public launch.

Webhook docs: https://docs.sarvam.ai/voice-agents/api/deployments/webhooks/webhook-payload

**Security caveat:** the webhook token lives in the URL query string because the current Sarvam deployment webhook config is URL-based. Treat the entire URL as secret and avoid sharing screenshots that display it. Rotate it if exposed.

## 6. Set up a test phone number

Use **Sarvam Deploy → Phone Numbers → Rent from Sarvam** (complete the mandatory KYC and buy a number) or connect an existing Exotel/Vobiz/Twilio account. Renting does NOT require configuring a separate VPS.

Set the purchased number to an **Inbound** deployment using the committed, tested version of the agent. Call the number from your own mobile; complete an approved and an unapproved sample request.

Do not route the existing **BSNL SIM** until:
- 3 real inbound test calls succeed in Malayalam, English and Manglish;
- matching inventory, quotes, callback behaviour and WhatsApp drafts work;
- the original caller number arrives correctly;
- caller recording consent and Sarvam's data retention are verified;
- approximate price per minute / spend limits are accepted;
- missed calls or a down provider have a manual fallback.

Then ask BSNL customer care whether conditional call forwarding is allowed on your specific SIM/plan, what forwarding charges apply, and whether caller ID is preserved. Enable forwarding to the TESTED Sarvam rental/provider number through BSNL's supported method. Test again from another phone.

Reference: https://docs.sarvam.ai/voice-agents/deploy/telephony/rent-from-sarvam

## 7. Go / no-go tests

- Tool A returns a verified price only when the format was approved in AKOCP; other songs show not_verified.
- Tool B returns exactly ₹150/₹350/₹450.
- Tool C refuses an AI approval at ₹350 when backend quote is ₹450.
- Tool C records an unapproved enquiry without creating an AKOCP order.
- Founder manually verifies track and price, then converts to a **single** existing AKOCP order. Duplicate clicks do not create multiple orders.
- The owner can open a manually prepared WhatsApp chat but the app does not send an automatic message.
- An unauthenticated operator cannot query \`receptionist-status\`, cannot read recordings, and cannot run Founder order RPCs.
- If the call declines recording consent, AKOCP does not store/play back the transcript; also check Sarvam provider-side retention independently.
- BSNL routing is only enabled after actual tests and a known fallback.

## 8. Who does what?

**Already implemented by code:** React dashboard, backend APIs, private recording proxy, database, price logic, Founder order review, JWT/RLS, live setup-readiness panel.

**Owner must do in external accounts:** generate and privately paste six secrets, rotate exposed key, create/configure Sarvam voice agent tools, accept telephony KYC/charges and buy/connect a number, confirm BSNL forwarding and legal recording consent. These actions require authenticated screens and a phone/provider account not connected to this ChatGPT session. Do not share secrets in chat.

The first dashboard readiness check will show which server credentials are still missing. A green server diagnostic is not itself proof that a real call will succeed.
