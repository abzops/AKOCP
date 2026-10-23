# AK OCP v1 operations runbook

## First production launch

1. Run `supabase/schema.sql`, then every ordered migration, in the supplied project.
2. Register the owner's account. All new accounts now await approval. On a fresh database only, a trusted project administrator must promote the verified owner's profile to `role = 'founder', active = true` in the SQL Editor. Never promote an unknown account.
3. Register Operations accounts; the Founder approves them under Settings -> Team access. Existing accounts retain their roles and active states when the hardening migration runs.
4. Confirm that the four service prices match the approved catalog.
5. Create a small test order, upload a proof, confirm it, complete it, and add the track to inventory.
6. Verify the payment appears once in the wallet and the track shows one order and its linked revenue.
7. Remove or clearly label the test order if it should not remain in operational reporting.

## Daily workflow

1. Search inventory before selecting a service.
2. Use `EX250` only when an inventory asset is selected.
3. Upload proof after receiving payment; the Founder confirms it.
4. Complete production only after confirmation.
5. Add newly created karaoke to inventory unless it should remain customer-only.
6. Record expenses on the date they occur.
7. Review withdrawal requests and perform the UPI transfer manually after approval.

## Recovery and controls

- The app caches the last successful snapshot for read-only offline access.
- A Founder customer privacy purge removes identifying operational data and proofs while preserving anonymous wallet totals and a content-free tombstone.
- A privacy purge requires typing the exact customer name. Review the affected counts before confirming.
- If proof cleanup reports `failed`, the cleanup job is retained and retried by the purge Edge Function.
- The wallet derives from its transaction ledger, not an editable balance field.
- Audit logs capture changes to operational and financial tables.
- Enable Supabase backups or a scheduled `pg_dump` before relying on the system for production operations.

## Reliability release (23 October 2026)

- Do not rerun `schema.sql` or historical data imports on production. Apply only pending migrations after confirming the earlier schema is present.
- Export a private data snapshot and the installed function/policy definitions before applying changes. Compare business table counts and fingerprints plus the wallet sum afterward. The access/finance migration performs no business-row updates or deletes. The model migration changes only `ai_settings`.
- Use `supabase/checks/data-snapshot.sql` for the read-only export. Save exported data under ignored `.private-backups/`; the SQL source contains no business data. This captures rows and storage metadata, not Auth credentials or file bytes.
- Apply `20261023083334_access_finance_reliability.sql`, `20261023084118_nvidia_supported_model.sql`, `20261023091524_nvidia_lightning_agent.sql`, then `20261023103000_delivered_order_payment_updates.sql`. The final migration permits payment confirmation after delivery while retaining final-status and identity protection. Short lock and statement timeouts make contention fail with rollback instead of waiting indefinitely. Retry a failed transaction only after the blocking query finishes.
- Store the supplied NVIDIA credential as the Edge Function secret `NVIDIA_API_KEY`. `.env.edge.local` is ignored by Git and contains no frontend `VITE_` variable. Never upload this file with the static site.
- Deploy `ai-copilot` and `customer-privacy-purge`, then the matching frontend. Keep JWT verification enabled. The supported configured model is NVIDIA-hosted `nvidia/nemotron-3.5-lightning-30b-a3b`; verify provider health under Founder settings.
- Both expense and withdrawal approval functions use the same transaction advisory lock. Approval still records an outflow, and the UPI transfer remains manual.
- Service revenue uses confirmed payment amounts. Original order prices remain unchanged, including historical cases where the received amount differs.
- Run `npm test`, `npm run test:db`, `npm run test:edge`, `npm run lint`, and `npm run build` before release. Database tests use isolated PGlite Postgres with minimal Auth/Storage scaffolding; they do not connect to production or simulate genuinely concurrent sessions.
