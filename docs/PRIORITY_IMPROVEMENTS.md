# Priority improvements

1. **Today’s plan:** current-month daily cash allocation, approximate order count based on the last 30 days of quoted order values, cash received today, delivery/revision/assignment queues, pending proofs, and payment differences. Order estimates do not guarantee collections. The daily allocation is the remaining monthly target divided by remaining calendar days including today; it is not a fixed daily quota minus today’s receipts.
2. **Forecast context:** separate confirmed cash receipts, newly booked quoted work, and delivered quoted work. Compare month-end cash scenarios using the last 7 and 30 calendar days, including zero days. Highlight when one day contributes at least 35% of current-month receipts. These scenarios are not predictions of order demand or profit. The existing target chart’s dotted projection is the month-average scenario.
3. **Order workflow board:** six current-status columns with due dates, assignment, payment balance labels, revision flags, and bounded initial rendering. Cards open the existing guarded order workflow. List view initially renders 50 rows, with more available on request. Filters and exports retain all matching orders.
4. **Payment balances:** original quote, actual confirmed receipts, pending proof amount, and quote difference, with full receipt history. Historical confirmed amounts are not rewritten. A confirmed order whose receipts differ from the quote is flagged for review; that difference is not automatically collectible. Additional receipts use the existing Founder confirmation and immutable ledger workflow. Multiple confirmed instalments are supported, with at most one pending proof per order. A new proof preserves prior confirmation. Each receipt has one ledger credit.
5. **Follow-ups:** customer segments for recent first-time, recent returning, 30+ day inactivity, and unknown last-order date. Customer and order details prepare editable message drafts. WhatsApp is opened only by an explicit user click, with no automatic sending. Review customer contact preference before sending.
6. **Delivery context:** optional HTTPS final-file link, current version label, revision flag/notes, assignment and due date in order details. Changes use existing order RLS and audit logging. These fields do not silently advance status or alter payment data. Saved revisions can be resolved by clearing the flag; finalized order status remains protected. Version changes are recorded in the existing Founder audit trail. Access to externally hosted file links must be managed by the file owner.
7. **Acquisition reporting:** optional source in new-order details and existing-order editor. Historical unknowns remain unassigned. Analytics reports order cohorts, orders with at least one receipt, receipt conversion, repeat orders, receipts, attributed approved Meta Ads costs, and receipts less ad costs. The latter is not accounting profit or causal advertising ROI. Costs use expense dates; cohort receipts may arrive later. Founder can attribute approved ad expense sources without changing amounts or approvals.

## Data protection and startup

Migration `20261023134455_operations_growth_delivery.sql` is deployed before the frontend. It adds nullable order/expense context columns, an invoker source-creation wrapper, an index allowing instalments while enforcing one pending proof, and preservation of existing confirmation when another proof is uploaded. The original create-order RPCs remain available. Existing business rows are not backfilled or rewritten. New source and delivery changes are subject to existing active-workspace policies and auditing.

Startup reads the user-scoped IndexedDB snapshot concurrently with the network. Saved data is read-only until a fresh network request succeeds. A late cache read cannot overwrite fresh data. Providers are keyed by user ID, and refresh does not restart just because the profile object is refreshed.

## Backup verification and owner setup

A private export of the 22 public business tables was restored into isolated in-memory Postgres and compared field-for-field, with the ledger reconciled. This verifies **business-row recovery**, not Auth credential or Storage file recovery. The private export also retains storage metadata and schema metadata. Never commit these exports.

Run a new business-export restore check with:

```powershell
node scripts/verify-business-backup.mjs <private-business-export.json>
```

`scripts/backup-workspace.mjs` prepares a full local backup containing a PostgreSQL custom-format dump plus Storage file bytes and bucket metadata. It writes only under ignored `.private-backups/`, hashes each saved file, and leaves a manifest incomplete if any step fails. Configure `AKOCP_DATABASE_URL`, `AKOCP_SERVICE_ROLE_KEY`, and optionally `AKOCP_PG_DUMP` in a private environment; never paste them into chat or put them in frontend variables. PostgreSQL tools matching the server version are required. Coordinate writes/uploads during full backup and restoration. Store a protected copy outside this computer after choosing its destination.

```powershell
node scripts/backup-workspace.mjs
node scripts/backup-workspace.mjs --verify <full-backup-directory>
```

**Not activated:** unattended full backups and a full Auth/Storage restore drill. The local CLI account currently cannot access the AKOCP organization, and no private database backup connection is configured. The helper fails clearly until configured; no schedule or “backup active” claim is created. Restore full backups into a separate approved project, never over live data. The business-row verifier never connects to production.

## Validation and remaining advisories

Frontend, isolated database and Edge Function tests, lint and production build precede publication. A live transaction verifies source and delivery saves plus two idempotent instalment confirmations and is rolled back. Pre/post migration fingerprints confirm existing business/financial rows are unchanged; concurrent AI chat activity is separate.

The Supabase security advisor reports pre-existing warnings about `pg_trgm` in public, anonymous execution grants on older guarded functions, and disabled leaked-password protection. This release introduces no new table or broad anonymous grant. See the [extension advisory](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [function execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Authenticated workflow functions intentionally retain their existing role guards. Moving the search extension or changing account authentication settings requires a separate compatibility review.
