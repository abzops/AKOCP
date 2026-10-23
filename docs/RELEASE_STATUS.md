# Reliability release status - 23 October 2026

## Implemented and verified

- Founder approval and active-profile enforcement, including existing JWTs and direct RPC access.
- Shared wallet lock for expense and withdrawal approvals; confirmed-payment workflow protection.
- Complete paged loading for business history, payment-based service revenue, offline recovery, and password reset.
- NVIDIA GPT OSS 20B configuration, bounded provider timeout, and Edge Function streaming CORS correction. Credentials remain outside Git and frontend code.
- 23 frontend tests, 13 isolated Postgres checks, and 7 AI Edge Function tests pass. Lint, TypeScript, production/PWA build, and credential exclusion scan pass.
- Database tests preserve every existing public row during access/finance migration. Model migration changes only AI settings. Tests use isolated PGlite with minimal Auth/Storage scaffolding, not simultaneous production sessions.

## Live backend release

Project: `cqptdpkhaiomitwzjysp`, organization: `doelnnlsdgiwgilvpbje`.

Both new migrations were applied successfully through the signed-in Supabase dashboard. An initial lock conflict was rolled back automatically; the successful transaction acquired its table locks without waiting. Both approval paths now share the wallet lock and privileged entry points enforce active access.

The supplied credential replaced the existing encrypted `NVIDIA_API_KEY` secret. Its saved digest matches the supplied key. The corrected `ai-copilot` function was deployed, and the previously missing `customer-privacy-purge` function was created. JWT verification remains enabled for both.

A complete private pre-release snapshot and the previous agent source are saved under ignored `.private-backups/`. Post-migration comparison confirms all original business IDs remain present and existing ledger entries are unchanged. Concurrent Founder payment confirmations and track completion were verified against the audit trail. Financial values and exported business data are kept out of this document and Git.

## Final release verification

Frontend publication and authenticated agent checks are being completed. Do not rerun historical schema/data imports. Use `supabase/checks/data-snapshot.sql` for private verification exports and `docs/OPERATIONS_RUNBOOK.md` for recovery details.
