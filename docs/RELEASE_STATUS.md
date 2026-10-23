# Reliability release status - 23 October 2026

## Implemented and verified

- Founder approval and active-profile enforcement, including existing JWTs and direct RPC access.
- Shared wallet lock for expense and withdrawal approvals; confirmed-payment workflow protection.
- Complete paged loading for business history, payment-based service revenue, offline recovery, and password reset.
- NVIDIA Nemotron Lightning configuration, bounded provider timeout, and Edge Function streaming CORS correction. The provider uses complete JSON turns for reliable structured tool calls while the app retains its SSE response. Credentials remain outside Git and frontend code.
- 23 frontend tests, 15 isolated Postgres checks, and 8 AI Edge Function tests pass. Lint, TypeScript, production/PWA build, and credential exclusion scan pass.
- Payment confirmation after delivery preserves final status and credits the ledger exactly once. Current balance, period movement, and paid-delivery metrics have separate fields and definitions.
- New chat stays empty instead of reopening the previous conversation.
- Database tests preserve every existing public row during access/finance migration. Model migration changes only AI settings. Tests use isolated PGlite with minimal Auth/Storage scaffolding, not simultaneous production sessions.

## Live backend release

Project: `cqptdpkhaiomitwzjysp`, organization: `doelnnlsdgiwgilvpbje`.

The access/finance, model configuration, post-delivery payment, and AI summary migrations were applied through the signed-in Supabase dashboard. An initial access-migration lock conflict was rolled back automatically; the successful transaction acquired its table locks without waiting. Both approval paths now share the wallet lock and privileged entry points enforce active access.

The supplied credential replaced the existing encrypted `NVIDIA_API_KEY` secret. Its saved digest matches the supplied key. The corrected `ai-copilot` function was deployed, and the previously missing `customer-privacy-purge` function was created. JWT verification remains enabled for both.

A complete private pre-release snapshot and the previous agent source are saved under ignored `.private-backups/`. Post-migration comparison confirms all original business IDs remain present and existing ledger entries are unchanged. Concurrent Founder payment confirmations and track completion were verified against the audit trail. Financial values and exported business data are kept out of this document and Git.

## Final release verification

The frontend release passed GitHub checks and published successfully. The live PWA update was activated and the Nemotron Lightning controls and Available provider health were verified. Production Orders, Finance, Inventory, Customers, and Analytics pages load with live data. A fresh copilot conversation remains empty until a new prompt is submitted. Synthetic provider checks validate real structured tool calling; authenticated summary requests read live data.

The owner-authorized historical import and payment confirmations were verified separately using private before/after exports. No historical schema/data import should be rerun. Use `supabase/checks/data-snapshot.sql` for private verification exports and `docs/OPERATIONS_RUNBOOK.md` for recovery details. Privacy purge and irreversible deletion were not exercised on real customer data during release checks. Database regression tests use an isolated engine rather than simultaneous production sessions.
