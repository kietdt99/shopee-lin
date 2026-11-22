# Implementation plan

## v0.1.4 planned

- [ ] Add a scheduled nightly GitHub Actions run for the full Playwright suite on Chrome and Edge. Keep PR/push checks unchanged, do not deploy from the scheduled workflow, and retain failure traces/artifacts for QA triage. Decide whether to run the mocked browser suite only or include the local API/RLS job after verifying runner support and CI cost.

## v0.1.0

## Product polish backlog

- [ ] Add an Admin-only **Thanh Toán** tab to upload the full QR image and edit its note; render the image as-is for Viewer without repeating bank/account details. Persist settings in Supabase and retain replaced QR images.
- [ ] Add restrained interaction animations: short transitions for navigation changes, dialogs, filter menus, and action feedback; respect `prefers-reduced-motion`, avoid animating layout dimensions, and keep motion from delaying input.
- [ ] Run a visual consistency pass for spacing, typography, color hierarchy, and component states across Overview, Orders, Installments, Reports, Accounts, and dialogs. Keep Shopee orange as the accent and use consistent neutral surfaces, borders, and status colors.
- [ ] Validate the visual pass at the four agreed targets: 2560×1440 desktop (2K 27-inch), 1366×768 laptop (14-inch reference viewport), 384×854 Samsung S23 Ultra CSS viewport, and 384×854 Samsung S25 Ultra CSS viewport. Record actual device/browser measurements when available; CSS viewports are not substitutes for physical-device review.
- [ ] Add Playwright coverage for animation reduced-motion behavior, dialog/filter transitions, and visual regression checks for key desktop/mobile screens before enabling motion broadly.

- [x] Establish repository guidance and branch strategy.
- [x] Create Supabase schema, roles, and Row Level Security policies.
- [x] Build role-aware application shell; switch routine login to email/password with one-time email activation and password recovery.
- [x] Implement Admin account management with a one-time recovery link for provisioned Viewer accounts. Production `admin-reset-password-link` is deployed with JWT verification enabled; Auth email OTP expiry is configured to 300 seconds. Live authorized-link, single-use, and expiry tests remain open.
- [x] Add per-user display name editing with constrained self-only update RPC.
- [x] Add a Hồ Sơ dialog with private per-user avatar upload, editable display name, and read-only email. The migration is applied on local Supabase and mocked browser coverage passes; local cross-user Storage authorization remains to verify.
- [x] Implement Admin order create/edit/delete and cancellation/refund flow.
- [x] Replace hard delete with reversible order soft-delete/restore; retain reopened cycle snapshots; remove database DELETE access for all app business tables. The migration is applied locally; all nine public app tables report no `DELETE` privilege for `authenticated`, and the local Viewer API/RPC check passed.
- [x] Redesign Orders as a responsive table with explicit cycle labels, manual-submit search, multi-select cycle/status filters, safe multi-item descriptions, and optional Shopee URL viewing. The table was visually checked locally; 77 Playwright tests pass on `test/orders-management` across 1280/390/320 px.
- [x] Expand the desktop frame to 2048px and style the sidebar as a separate panel; place profile controls and the `v0.1.0` label at its bottom. Verify on 2560/1920 desktop and representative S23 Ultra/S25 Ultra CSS viewports.
- [x] Align the sidebar version label to the left and show an enlarged profile card with the account avatar or a shared default avatar and labeled actions.
- [x] Keep profile email view-only for every role with visible styling and mark required display name with `*`.
- [x] Keep required field asterisks inline with their labels in Hồ Sơ and order create/edit forms.
- [x] Assign orders to 21st–20th cycles; implement cycle close, reports, and Admin reopen with database guards.
- [x] Record lump payments and allocate across selected orders, including partial allocations.
- [x] Add installment plan/payment entry and history.
- [x] Add cycle report (opening balance, purchases, payments, closing balance) and Excel-compatible/print-to-PDF export.
- [x] Generate and review one-time legacy SQL including May 2026, order history, payments, opening credit, and S25U; reconcile Shopee balance 2,999,619 VND and S25U balance 18,000,000 VND.
- [x] Apply import to Supabase and verify persisted rows and balances (2026-11-21: 60 orders; 2 payments / 24 allocations; Shopee debt 2,999,619 VND; S25U remaining 18,000,000 VND).
- [ ] Verify password setup and email/password sign-in for Admin, Viewer test, and Bé Lin; exercise Viewer write denial through the authenticated PostgREST API. A post-ACL production SQL role simulation confirmed Viewer reads, denied installment-plan insert and payment RPC, and rolled back with no fixture. Viewer test magic-link sign-in succeeded locally and its existing confirmed account must be reused without requesting more email. Reserve Supabase's two-per-hour built-in email quota for the Admin and Bé Lin production accounts. Bé Lin has no provisioned profile yet after an earlier email rate limit (HTTP 429).
- [x] Configure local and GitHub Pages Auth redirect URLs, set Supabase Auth Email OTP expiry to 300 seconds, and deploy `admin-reset-password-link` with JWT verification enabled. The global setting also shortens activation and self-service recovery links. [ ] Verify real generated recovery links are single-use and expire after 300 seconds.
- [x] Apply `supabase/migrations/20261121_profile_display_names.sql` to Supabase and verify default names plus self-only updates (2026-11-21: Admin and Viewer test defaults confirmed; RPC succeeded in a simulated Viewer transaction that was rolled back).
- [x] Check the deployed unauthenticated login shell at mobile and desktop widths and confirm the production bundle includes the configured Supabase and TPBank values. [ ] Run authenticated app smoke checks against Supabase for QR rendering, reports, balances, and role visibility; mocked E2E covers empty/cancelled/installment/payment UI cases.
- [x] Configure GitHub Pages deployment through Actions and confirm all five required Actions variables exist. Cut and protect immutable `release/v0.1.0`; deployment succeeded and the production login shell returned HTTP 200 at mobile and desktop widths with no horizontal overflow. [ ] Complete real Auth/RLS, report, QR, and recovery smoke checks, then create tag `v0.1.0`.
- [ ] Establish reliable Supabase migration history before the next CLI-managed schema change: production schema/data and ACLs are applied and verified, but the project has no `supabase_migrations.schema_migrations` history table, and the original five date-only migration filenames all parse as version `20261121`. Do not run `db push` against these files.
- [x] Complete one-time import guide; keep this plan/decision notes current.
- [x] Add Playwright UI regression coverage, QA test plan, and PR quality workflow using isolated mocked Supabase requests. Coverage includes Chrome and Edge only, automated WCAG scans, local authenticated API/RLS checks, and a production bundle-size budget; full cross-browser run and any remaining accessibility findings stay release gates until retested.
- [x] Add an isolated local Supabase bootstrap and one-click Admin/Tester login shortcuts. Docker Desktop is installed, the local stack starts without resetting the DB, and both local Auth accounts are seeded.
- [x] Expand Playwright E2E coverage for order create/edit/soft-delete/restore, multi-order payment and excess rejection, 20th/21st plus year rollover, cancellation/refund, cycle close/reopen UI with modeled snapshot and downstream-opening restoration, selected-cycle Excel export, print layout, profile/avatar editing, and target device layouts. Latest `pnpm test:e2e` passes 89/89; retain live Supabase RLS/Auth/ledger checks as separate gates.
- [x] Serialize payment allocation and cancellation RPCs with cycle-before-order locks, including the payment-date cycle; reject repeated cancellation before adding another refund entry.
- [x] Apply `supabase/migrations/20261121130000_serialize_order_financial_rpcs.sql` to Supabase; audit found zero prior refund rows. A temporary live RPC smoke test verified payment allocation and duplicate-cancellation rejection, and confirmed temporary rows were cleaned up.
- [x] Local startup/import verification (2026-11-22): 60 workbook orders, 2 payments, 24 allocations; Shopee debt 2,999,619 VND; S25 Ultra remaining 18,000,000 VND. The import SQL remains ignored and local-only.
- [x] Local Viewer Auth/PostgREST smoke (2026-11-22): profile/orders reads succeed; installment plan insert is denied at RLS; payment/cancellation/cycle close/reopen RPCs are rejected by Admin guards. Local catalog confirms no authenticated DELETE privilege on the nine app tables.
- [x] Run `pnpm build` after the final local copy pass on integrated `main`; TypeScript/Vite build passed with 1,628 modules (2026-11-22). Rerun before the eventual production release.
- [x] Update `docs/implementation-backlog.md`, `docs/test-plan.md`, and `docs/implementation-notes.md` with branch-local status and explicit unverified production gates.
- [x] Merge `feature/orders-management` and `test/orders-management` into local `main`; run the integrated suite (77/77), production build, and `git diff --check`. The local `main` branch is ahead of `origin/main`; it has not been pushed.
- [x] Run a two-request payment/cancellation concurrency check; final synthetic state had one allocation and a cancelled order, and all test rows were removed.
- [x] Run live cycle-close races against cancellation and a payment dated inside the cycle (2026-11-21): close won the cancellation race and the cancel RPC rejected; payment won its race and close stored the matching 5,555 VND purchases / 4,321 VND payment snapshot. All isolated 2000-dated synthetic rows were removed and verified absent.
- [x] Apply `20261121213000_restrict_anonymous_function_execute.sql` to production and run `supabase/verification/function_execute_acl.sql`; verifier returned zero rows, and direct anonymous calls to six app RPCs returned HTTP 401. Authenticated Viewer API/RPC denial checks remain open; the legacy full-payment RPC is not client-executable.


- [x] Remove the duplicate Admin badge from the current-period card and remove the redundant “Tổng đã thanh toán” Overview metric for all roles; cycle reports remain the source for period payment totals.
- [x] Show the account role beneath the sidebar display name and keep profile actions aligned without wrapping.

- [x] Match the current-period label to the neutral metric-label style and remove the duplicate “Kỳ” from its value.
- [x] Show date ranges consistently in Overview, Orders filtering, and Reports while keeping the Orders table cycle column compact.
- [x] Simplify the cycle filter list into grouped single-column options for narrow and desktop layouts.
- [x] Constrain the report cycle selector width to prevent mobile horizontal overflow with date-range labels.
- [x] Keep `Đã Xóa` available as an Admin Orders filter status even when no deleted rows currently exist.
- [x] Remove “Trả Một Phần” as an order status. New Admin payments must settle every selected order's full outstanding amount; show a custom confirmation with selected count and total; preserve imported historical allocations and keep any remaining balance under “Chưa Thanh Toán”.
- [x] Prevent accidental text highlighting when clicking the order filter while preserving text selection in its search field.
- [x] Audit and prevent accidental text selection across clickable controls and filter options throughout the app; preserve input text selection.
- [x] Close the Orders filter on outside click and Escape; restore focus to its trigger on Escape.
- [x] Keep Orders cycle/status filter controls persistently visible. Entering Orders selects the newest cycle for both roles; statuses start unchecked and mean all. Empty selections mean all matching results and stay unchecked when reopened. Add select-all checkboxes, retain explicit Apply, and prevent the menus from opening together. The mobile CSS stacks the controls; physical-device fit still needs a release spot-check.
- [x] Enforce Shopee completion semantics: Chưa Thanh Toán means awaiting delivery/transport; Đã Thanh Toán means complete and cannot be edited, cancelled, or refunded. Guard both UI and `cancel_order` RPC.
- [x] Replace native browser alert/confirm/prompt product flows with custom ShopeeLin dialogs or inline errors; native print remains for PDF export.
