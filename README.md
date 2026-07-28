# Abhinand Karaokes — Operations Control Center

AK OCP is the mobile-first operational command center for Abhinand Karaokes. It connects customer orders, reusable karaoke inventory, payment proof, wallet activity, expenses, withdrawal approvals, notifications, and Founder analytics in one installable PWA.

The interface follows the supplied brand system: premium black surfaces, `#F4C400` yellow, Montserrat/Poppins typography, high contrast, and restrained music/stage motifs.

## What v1 includes

- Supabase email authentication with automatic Founder/Operations role assignment
- inventory-first order creation to prevent duplicate karaoke work
- Malayalam, English, Manglish, tag, and partial-title inventory search
- controlled service catalog and price snapshots (`AU150`, `EX250`, `ML350`, `OL450`)
- payment screenshot upload and Founder confirmation
- completion workflow that optionally converts a new track into a reusable asset
- customer lifetime value and order history
- immutable wallet ledger from confirmed payments, expenses, and approved withdrawals
- Founder-controlled expenses, service pricing, withdrawal review, team roles, and audit view
- targeted realtime refresh, mobile pull-to-refresh, and explicit PWA update handling
- server-paged inventory search that loads 50 tracks at a time
- Founder-only customer privacy purge with anonymous financial retention
- IndexedDB snapshot cache and offline read-only behavior
- dashboard and analytics for services, tracks, customers, languages, costs, and revenue
- CSV exports, dark/light modes, global search, keyboard shortcuts, and installable PWA support

## Start locally

```powershell
npm install
npm run dev
```

Open the URL shown by Vite and sign in with an approved Supabase account.

Production configuration is in `.env.production`. The Supabase anon key is intentionally public in this browser application; authorization is enforced by Row Level Security, database functions, immutable ledgers, and private storage policies.

## Initialize Supabase

1. Open the SQL Editor for project `cqptdpkhaiomitwzjysp`.
2. Run [supabase/schema.sql](supabase/schema.sql) as one script.
3. Register the first account through the app. It becomes `founder`; later accounts default to `operations`.
4. In Authentication settings, choose whether email confirmation is required.

For an existing AK OCP project, apply migrations in `supabase/migrations` in filename order and deploy both Edge Functions:

```powershell
npx supabase db push
npx supabase functions deploy ai-copilot
npx supabase functions deploy customer-privacy-purge
```

Deploy the database migration and Edge Function before pushing the matching frontend release.

The schema creates all tables, indexes, search support, RLS policies, storage buckets, functions, realtime publication entries, service seeds, audit triggers, wallet controls, and notifications. Run it before creating production data.

## Commands

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

## Deploy to GitHub Pages

Push `main` or `master`. The included workflow builds, tests, and deploys `dist` to GitHub Pages. In repository **Settings → Pages**, select **GitHub Actions** as the source.

The Vite base path and PWA scope are configured for `https://abzops.github.io/AKOCP/`.

## Role boundary

| Capability | Founder | Operations |
|---|:---:|:---:|
| Create/manage orders | ✓ | ✓ |
| Search/add inventory | ✓ | ✓ |
| Upload payment proof | ✓ | ✓ |
| Complete/deliver orders | ✓ | ✓ |
| Confirm payment | ✓ | — |
| Add expenses | ✓ | — |
| Request withdrawal | ✓ | ✓ |
| Approve/reject withdrawal | ✓ | — |
| Change controlled prices | ✓ | — |
| Analytics, roles, audit | ✓ | — |

Database policies and guarded functions enforce these boundaries independently of the interface.
