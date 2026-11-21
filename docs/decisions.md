# Decisions

## 2026-11-21 — Minimal payment flow

The app shows a static TPBank VietQR card. Bé Lin tells the Admin after transferring. The Admin confirms and allocates payment to orders manually. Bank APIs, transfer notifications, and receipt uploads are out of scope.

## 2026-11-21 — Data source

Supabase Postgres is the source of truth. The supplied Excel workbook is a one-time historical import source only. After release, the Admin enters and maintains all new records in the application; Excel may be used only as an exported report.

## 2026-11-21 — Branching and release

Each feature uses a `feature/...` branch and merges into `main`. A `release/vX.Y.Z` branch is cut from `main` for production deployment. Production deploys only from `release/*`; releases are tagged after deployment.

## 2026-11-21 — User provisioning

Neither user is created manually in the Supabase dashboard. Passwordless first sign-in self-provisions only the two allowlisted email addresses through a database trigger. The trigger assigns Kiet Do the admin role and Bé Lin the viewer role. Unknown email addresses are rejected.

## 2026-11-21 — Viewer test account

A Gmail plus-alias is a third allowlisted identity with the viewer role. It delivers to the Admin inbox, while Supabase treats it as an independent account for testing the Viewer experience.

## 2026-11-21 — Legacy date normalization

During the one-time Excel import, date cells parsed as `mm/dd/yyyy` are normalized to `dd/mm/yyyy`, matching the Vietnamese billing cycles and the confirmed source convention.

## 2026-11-21 — Historical debt sign convention

Purchases and received payments are separate positive records. A signed ledger entry represents opening credit or a historical adjustment; the initial 5,000,000 VND is a -5,000,000 VND debt offset. Imported payment allocations are assigned oldest outstanding order first. The import must reconcile to 2,999,619 VND Shopee debt and 18,000,000 VND S25U remaining.

## 2026-11-21 — Cycle reports and exports

Cycles use the ending month label for a 21st-to-20th range. Closing stores a read-only snapshot; only Admin may reopen. Reports export an Excel-compatible workbook and PDF via the browser print dialog.

