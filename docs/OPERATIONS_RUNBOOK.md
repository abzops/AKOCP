# AK OCP v1 operations runbook

## First production launch

1. Run `supabase/schema.sql` in the supplied project.
2. Register Abhinand first so that the profile receives the Founder role.
3. Register Roshan second; the account defaults to Operations.
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
- Financial rows are soft-deleted or immutable; no destructive UI is exposed.
- The wallet derives from its transaction ledger, not an editable balance field.
- Audit logs capture changes to operational and financial tables.
- Enable Supabase backups or a scheduled `pg_dump` before relying on the system for production operations.
