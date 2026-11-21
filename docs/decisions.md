# Decisions

## 2026-11-21 — Minimal payment flow

The app shows a static TPBank VietQR card. Bé Lin tells the Admin after transferring. The Admin confirms and allocates payment to orders manually. Bank APIs, transfer notifications, and receipt uploads are out of scope.

## 2026-11-21 — Data source

Supabase Postgres is the source of truth. The supplied Excel workbook is a one-time historical import source only. After release, the Admin enters and maintains all new records in the application; Excel may be used only as an exported report.

## 2026-11-21 — Branching and release

Each application feature uses a `feature/...` branch; test-only infrastructure and QA work use a `test/...` branch. Both merge into `main`. A `release/vX.Y.Z` branch is cut from `main` for production deployment. Production deploys only from `release/*`; releases are tagged after deployment.

Protect `main` with pull requests, the passing `build-and-e2e` check, up-to-date branches, and resolved review conversations; block force-pushes and deletion. Do not require an approval because this repository has one maintainer. Protect release branches from direct pushes, force-pushes, and deletion. Limit the GitHub Pages environment to `release/*` branches.

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

## 2026-11-22 — Desktop navigation and product identity

Use a vertical left navigation sidebar on desktop and a compact horizontal navigation on mobile. Show a clickable ShopeeLin wordmark that returns to Tổng Quan. Use Title Case labels for the main navigation tabs.

## 2026-11-22 — No hard deletion and retained close history

Application records are never hard-deleted. Admin can soft-delete an unpaid order only when it has no payment allocations; the row remains visible as “Đã Xóa”, is excluded from debt totals, and can be restored while its cycle is open. Orders with any allocation, including paid orders, use the cancellation/refund flow. Reopening a billing cycle marks its closing snapshot as reopened and retains it; a later close creates a new snapshot version. App database roles must not have direct DELETE access to business tables.

## 2026-11-22 — Optional Shopee order URL

An order may store a validated Shopee purchase URL. Admin can open it using the View action in a new tab. Historical workbook rows do not include regular Shopee order URLs, so their View actions remain disabled until a URL is added.

## 2026-11-22 — Orders table scan and required fields

Put the selection checkbox before the order date, and show billing cycle in its own column after amount so long descriptions remain readable. Mark required order fields (description, date, and amount) with an asterisk in both create and edit dialogs; keep Shopee URL explicitly optional. Use a ChevronDown icon for the cycle/status filter control. The billing-cycle choices use a searchable, fixed-height scroll area and still require the explicit Apply Filter action.

## 2026-11-22 — Private user avatars

Profiles may store a private avatar object path. Each signed-in user can read/upload only within their own UUID folder; only JPEG, PNG, and WebP up to 2 MiB are accepted. The UI stores the object path and uses a short-lived signed URL for display. No client delete policy exists; replaced and abandoned uploads remain retained to honor the no-hard-delete rule. Profile name and avatar path update through a self-only RPC.

## 2026-11-22 — Distinct installment actions

Creating a repayment plan records the liability name and total. Recording a contribution adds one dated amount to that existing plan's history. The UI labels these actions separately; users record S25 Ultra contributions on its existing plan and create a plan only for a new installment liability.

## 2026-11-22 — Preserve financial invariants after allocation

Once an order has any payment allocation, its amount, placed date, and billing cycle are immutable; descriptive text and Shopee URL may be updated without changing debt history. Installment contributions cannot exceed the remaining plan balance, even under concurrent requests. An earlier cycle cannot be reopened while a later cycle is closed; reopen from newest to oldest so stored snapshots remain consistent.

## 2026-11-21 — Serialize order financial writes

`record_order_payment` and `cancel_order` lock billing cycles before order rows in a stable order. Payment allocation locks both the selected orders' cycles and the cycle(s) containing `p_paid_at`, because reports include payments by paid date. This serializes payment allocation with cancellation and cycle close. `cancel_order` also rejects an already-cancelled order before writing a refund adjustment, preventing concurrent or repeated calls from recording duplicate refunds. Apply the migration before relying on these guards in Supabase.

## 2026-11-22 — One-click local test accounts

Local development uses an isolated Supabase stack with seeded Admin and Viewer-test Auth users. The login shortcuts appear only in Vite development when the configured Supabase API is loopback on port 54321. They authenticate against local Supabase using a local-only password; production builds and hosted Supabase URLs never show the shortcuts. Local test accounts use the same allowlisted emails to exercise the real role trigger and RLS, but local data and passwords are separate from production. The stack starts from the checked-in schema snapshot in a generated, ignored local workspace so it does not replay the unresolved hosted migration history.


## 2026-11-22 — Wide desktop content frame

Cap the centered application shell at 2048px instead of 1480px. This uses large desktop displays more effectively while preserving a centered frame and the existing 900px tablet/mobile layout behavior.

## 2026-11-22 — Sidebar panel and footer

Give the left navigation its own white bordered card surface so it reads separately from the page canvas. Show a larger profile card at the bottom with an avatar, display name, and two compact side-by-side actions labeled `Hồ Sơ` and `Đăng Xuất`. Use a bundled default avatar for every account without an uploaded image. Place the `v0.1.0` label below and left-aligned. Constrain sidebar children to the panel width so long action text cannot stretch the navigation column. At mobile widths, preserve horizontal tabs and adapt the profile card to a compact row with actions below it.

Keep profile email read-only for all roles and give it a visible read-only treatment. Mark the required display name with `*` in the Hồ Sơ dialog.

