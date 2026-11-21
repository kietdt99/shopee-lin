# Decisions

## 2026-11-21 — Minimal payment flow

The app shows a static TPBank VietQR card. Bé Lin tells the Admin after transferring. The Admin confirms and allocates payment to orders manually. Bank APIs, transfer notifications, and receipt uploads are out of scope.

## 2026-11-21 — Data source

Supabase Postgres is the source of truth. The supplied Excel workbook is a one-time historical import source only. After release, the Admin enters and maintains all new records in the application; Excel may be used only as an exported report.

## 2026-11-21 — Branching and release

Each application feature uses a `feature/...` branch; test-only infrastructure and QA work use a `test/...` branch. Both merge into `main`. A `release/vX.Y.Z` branch is cut from `main` for production deployment. Production deploys only from `release/*`; releases are tagged after deployment.

## 2026-11-21 — Browser testing

Use Playwright for deterministic browser E2E smoke tests on desktop and mobile Chromium. Mock Supabase Auth and REST at the network boundary; do not add app-level auth bypasses or use production credentials in the suite. Playwright verifies rendered behavior and responsive layout, while actual RLS, email-link expiry, and deployed Auth configuration remain separate live QA checks.

## 2026-11-21 — User provisioning

Neither user is created manually in the Supabase dashboard. Passwordless first sign-in self-provisions only the two allowlisted email addresses through a database trigger. The trigger assigns Kiet Do the admin role and Bé Lin the viewer role. Unknown email addresses are rejected.

## 2026-11-21 — Viewer test account

A Gmail plus-alias is a third allowlisted identity with the viewer role. It delivers to the Admin inbox, while Supabase treats it as an independent account for testing the Viewer experience.

## 2026-11-21 — Password login after one-time email activation

Use email/password for routine sign-in so users do not need to open email on every login. A first-time password setup or password reset uses a Supabase email link; the existing allowlist trigger remains the authority for which identities may receive profiles. Supabase's default persistent browser session remains enabled.

## 2026-11-21 — Reserve Supabase email quota for production users

Supabase's built-in email provider is limited to two emails per hour. Reserve that quota for the Admin and Bé Lin production accounts. Do not request new activation or recovery emails for the Viewer test account or during routine QA; use its existing confirmed account and password login. Routine application sign-in must remain email/password and must not send email.

## 2026-11-21 — Admin-assisted password recovery

For a provisioned Viewer who cannot receive a reset email, Admin can generate a single-use Supabase recovery link without sending email. The link is a bearer credential and must be shared privately; the app does not retain it. Set the project's global Email OTP expiration to 300 seconds before describing the link as a five-minute link. This also shortens other Auth email links, including activation and self-service recovery. The reset endpoint runs in an Edge Function and authorizes Admin from the database profile role.

## 2026-11-21 — Per-user display names

Profiles use the requested default display names, and each authenticated user can update only their own display name through a constrained database function. Role changes remain unavailable through this profile edit flow.

## 2026-11-21 — Legacy date normalization

During the one-time Excel import, date cells parsed as `mm/dd/yyyy` are normalized to `dd/mm/yyyy`, matching the Vietnamese billing cycles and the confirmed source convention.

## 2026-11-21 — Historical debt sign convention

Purchases and received payments are separate positive records. A signed ledger entry represents opening credit or a historical adjustment; the initial 5,000,000 VND is a -5,000,000 VND debt offset. Imported payment allocations are assigned oldest outstanding order first. The import must reconcile to 2,999,619 VND Shopee debt and 18,000,000 VND S25U remaining.

## 2026-11-21 — Cycle reports and exports

Cycles use the ending month label for a 21st-to-20th range. Closing stores a read-only snapshot; only Admin may reopen. Reports export an Excel-compatible workbook and PDF via the browser print dialog.

## 2026-11-21 — Shopee-inspired UI palette

Use Shopee orange as the app's accent color with white cards and neutral gray backgrounds/text. Keep the app's own compact layout and identity rather than copying Shopee's full interface or logo.

## 2026-11-21 — Serialize order financial writes

`record_order_payment` and `cancel_order` lock billing cycles before order rows in a stable order. Payment allocation locks both the selected orders' cycles and the cycle(s) containing `p_paid_at`, because reports include payments by paid date. This serializes payment allocation with cancellation and cycle close. `cancel_order` also rejects an already-cancelled order before writing a refund adjustment, preventing concurrent or repeated calls from recording duplicate refunds. Apply the migration before relying on these guards in Supabase.

