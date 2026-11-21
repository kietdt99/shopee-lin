# Manual test plan

This checklist is the release QA plan for v0.1.0. It describes expected behavior; an unchecked item is not evidence that the flow has been tested. Use test orders where possible and clean them up before release.

Install the browser once with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. The current Playwright suite runs on desktop and mobile Chromium and mocks Supabase requests. It covers login layout/error handling, Admin account/recovery-link UI, Viewer navigation and hidden Admin controls, QR guidance, empty orders plus populated installment/report views, and the ledger/export/cycle-close flows listed below. These tests validate mocked UI behavior only; live Supabase Auth/RLS/database checks below remain required.

### Playwright coverage map

| Flow | Current coverage | Manual/release check |
| --- | --- | --- |
| Order create and edit | Implemented: creates May 20, May 21, and Dec 21 orders, asserts cycle assignment including year rollover, then edits an order and checks the PATCH payload and displayed amount. | Live database assignment and closed-cycle constraints remain part of release QA. |
| Unpaid order delete/restore | App code uses `soft_delete_order` and `restore_deleted_order`; the current Playwright test is stale and still expects the row to be removed. | Update the test on `test/orders-management`; verify retained row, deleted styling, no edit/delete, restore, and server denial for paid/allocated orders. |
| Partial payment across multiple orders and over-allocation rejection | Implemented: checks one payment across two selected orders, allocations and statuses, then confirms an excessive second payment is rejected without another payment record. | Verify live RPC allocation, ledger balance, and invalid-input behavior. |
| Paid order cancellation/refund | Implemented: cancels a paid order, checks the refund amount sent to the RPC, cancelled UI state, and refund ledger adjustment. | Verify live refund limits and resulting report totals. |
| Admin cycle close/reopen UI | Implemented: closes a mocked populated cycle, checks the close RPC payload, snapshot totals and closed-state UI; reopens it, checks the reopen RPC, and verifies the next cycle's prior opening balance is restored in the UI. Runs on desktop and mobile Chromium. | Verify the live end-date guard, persisted snapshot stability, downstream balance restoration, Viewer/RLS denial, and close/payment/cancellation concurrency. |
| 20th/21st billing-cycle boundary and year rollover | Implemented: asserts May 20→May cycle, May 21→June cycle, and Dec 21→January 2027 cycle. | Verify persisted assignment and ending-month labels against live data. |
| Excel-compatible export | Implemented: downloads the selected cycle's `.xls` report and checks workbook content, order/payment details, and filename. | Reconcile exported values with live ledger/report data. |
| PDF/print action | Implemented: verifies the print action invokes `window.print()` and print media hides app navigation/actions while retaining the report. | Confirm browser print dialog behavior and output on target devices. |
| Profile name/avatar edit | Name editing was covered through the constrained RPC. The new Hồ Sơ dialog uses private avatar upload plus `update_my_profile`; browser coverage is pending. | Add avatar upload/error/read-only email/save tests on `test/orders-management`; verify self-only Storage/RPC access in local Supabase. |

Automated ledger scenarios use mocked order/payment/cycle data and assert the UI plus key request payloads. The mocked close/reopen test exercises UI state and modeled balance changes; it does not prove the RPC's persisted database effects. Keep database authorization, ledger integrity, live close/reopen behavior, and export reconciliation against real data in the manual/release checks; mocked browser coverage cannot establish those guarantees.

## Preconditions

- [ ] Run the app locally against the intended Supabase project and confirm the URL uses the project root, not `/rest/v1/`.
- [ ] Confirm required database migrations are applied, including ledger/report and profile display-name migrations.
- [x] Confirm local and GitHub Pages callback URLs are in Supabase Auth's redirect allowlist (verified with Supabase CLI config diff after the production update).
- [x] Confirm GitHub Actions variables exist for Supabase URL/publishable key and VietQR recipient name, account, and bank.
- [x] Confirm the Admin recovery Edge Function is deployed with JWT verification enabled and Auth Email OTP expiry is configured to 300 seconds. This is a project-wide setting that also shortens activation and self-service recovery links.
- [ ] Use the Admin, Viewer test alias, and Bé Lin accounts. Keep recovery links and passwords out of test notes and screenshots.
- Supabase's built-in email provider is limited to two emails per hour. Reserve sends for the Admin and Bé Lin production accounts; do not request new activation or recovery emails for the already-confirmed Viewer test account or for QA.

## Responsive layout and navigation

Run each check at a narrow mobile width (320–390 px) and desktop width (1280 px or wider).

- [ ] Login form, alerts, tabs, cards, lists, and dialogs fit without unintended horizontal page overflow.
- [ ] On mobile, tabs remain reachable when they overflow the viewport; Admin-only **Tài khoản** appears only for Admin.
- [ ] Long display names truncate in the header; the profile edit dialog remains usable on mobile and desktop.
- [ ] Order, payment, installment, report, and account rows remain readable at both widths.
- [ ] Dialogs fit the viewport, scroll when their content is taller than the screen, and close using the close control and backdrop.

## Authentication and role access

- [ ] First-time activation through the email link provisions only an allowlisted account with the expected role and default display name.
- [ ] An unknown email cannot obtain an application profile or access application data.
- [ ] Admin and Viewer test can sign in with email/password after password setup. Refreshing and reopening the same browser preserves the session; explicit sign-out clears it.
- [ ] Wrong email/password shows a generic failure and does not expose whether an account exists.
- [ ] Self-service password recovery, when used, returns to the app's password setup view and accepts the new password.
- [ ] Viewer sees no order mutation, payment recording, installment editing, cycle close/reopen, or Account tab controls.
- [ ] Viewer and Admin can change only their own display name. Verify defaults: **Bé Kịt Thần Kỳ**, **Tester Quèn**, **Bé Lin Tốc Độ Cao**. Display-name editing cannot change email, role, or another user's profile.

## Admin account recovery

Only test this for already-provisioned Viewer accounts; the Admin recovery endpoint is not the first-time account provisioning flow.

- [ ] Admin sees provisioned accounts and a **Reset password** action for Viewer accounts; the Viewer cannot access this tab or invoke the Edge Function successfully.
- [ ] Resetting a Viewer generates a recovery link without sending an email or changing the current password immediately.
- [ ] The link is displayed only for the current dialog session, can be copied, and is never persisted in browser storage, logs, or repository files. Share it only through a private channel.
- [ ] Confirm the link expires after 300 seconds using Supabase Auth configuration, not just the UI countdown. A link that expires must not complete password recovery.
- [ ] Open a valid link in the intended browser, set a new password, and sign in with it. Confirm a second use of the same link fails.
- [ ] Confirm expired, reused, malformed-target, and disallowed-redirect requests fail without exposing a recovery link.
- [ ] Confirm the function rejects Viewer callers and attempts to target an Admin account.

## Row Level Security

Use both the Viewer UI and authenticated API/PostgREST calls. UI hiding alone does not count as authorization.

- [x] Run `supabase db query --remote=<project-ref> --read-only --file supabase/verification/function_execute_acl.sql`; after applying the ACL migration, it returned zero rows. Anonymous calls to all six exposed app RPCs returned HTTP 401; trigger-only and legacy full-payment functions are not client-executable.
- [x] Run a rollback-only production SQL role simulation with the Viewer identity after ACL hardening: Viewer can read orders, cannot insert an installment plan or call the payment RPC, and no fixture remains.
- [ ] With a Viewer session, call table writes and Admin-only RPCs through PostgREST; verify RLS and `is_admin()` deny them. Catalog checks and SQL role simulation do not replace this authenticated API test.

- [ ] Viewer can read the approved ledger, orders, payments, installment plans/history, cycles, and reports.
- [ ] Viewer API writes to orders, payments, allocations, installment plans/payments, ledger entries, cycle status/closings, and profiles are denied.
- [ ] Viewer cannot alter `profiles.role`, another user's profile/display name, or Admin-owned records through direct API calls.
- [ ] Viewer cannot call Admin-only RPCs such as payment recording, order cancellation, cycle close/reopen, or the recovery Edge Function.
- [ ] Admin can perform the documented mutations and retains access to reports and account recovery.

## Orders and payment allocation

- [ ] Empty order list shows a useful empty state for both roles; Viewer does not see Admin controls.
- [ ] Admin creates and edits an unpaid order; soft-deleting it requires confirmation, retains history, and can be reversed with Restore. All amounts must be positive whole-VND integers.
- [ ] Orders dated on the 20th and 21st are assigned to the expected 21st–20th billing cycles; cycle labels use the ending month.
- [ ] Admin selects multiple unpaid orders and records one received payment. Check payment total, allocations, order statuses, and resulting outstanding balance.
- [ ] Partial payment leaves the relevant order unpaid with the correct remaining amount; exact settlement marks it paid.
- [ ] Zero, negative, decimal, or over-capacity payment input is rejected without writing partial records.
- [ ] Soft-deleting an unpaid order with no allocations requires confirmation, preserves its row, excludes it from balances, displays a disabled Edit plus Restore action, and restoration returns it to unpaid. No app role can hard-delete an order through PostgREST.
- [ ] A paid or partially allocated order cannot be soft-deleted. It follows the cancellation/refund flow; refund cannot exceed received allocations, and its payment history remains intact.
- [ ] Reopening a cycle retains its prior close snapshot; re-closing creates a new active version. Admin cannot hard-delete cycles, payments, allocations, installment data, ledger rows, profiles, or close history through the API.
- [ ] Profile avatar accepts JPEG/PNG/WebP up to 2 MB, displays a private signed preview, and saves only the current user's object path. Unsupported/oversized files fail visibly; replaced avatar objects remain retained.
- [ ] Orders table displays cycle labels rather than UUIDs; search runs only on Enter/Search; multiple cycle and status filters apply only after clicking “Áp Dụng Bộ Lọc”.
- [ ] Shopee URLs open only through the Admin Eye action in a new tab; empty/invalid URLs leave the action disabled. The historical import should not infer URLs absent from the workbook.
- [ ] Multi-product descriptions preserve separate Excel blocks. For already flattened descriptions, split only when every chunk validates; otherwise keep the description intact.
- [x] Before applying `20261121_z_serialize_order_financial_rpcs.sql`, audit existing refund ledger rows for duplicates; 2026-11-21 check found zero refund rows. The migration does not reconcile historical entries.
- [x] After applying the migration, run a synthetic RPC smoke test: payment allocation succeeded, first cancellation created one refund, second cancellation was rejected, and all temporary rows were removed. Post-apply function checks confirmed both routines remain `SECURITY DEFINER`, executable by `authenticated`, with the expected guards.
- [x] Live two-session payment/cancellation race on 2026-11-21: both RPC requests completed in a valid order; final order was cancelled with exactly one full allocation and no refund adjustment. The open cycle remained open; all synthetic rows were removed and verified absent.
- [x] Live concurrency QA (2026-11-21, isolated synthetic cycle): cycle close won the cancellation race, and cancellation rejected against the closed cycle; a payment dated inside the cycle won the payment race, then close stored the expected purchase/payment totals. No deadlock occurred; the cycle was reopened, all synthetic rows were removed, and read-only verification found zero remaining fixtures.
- [ ] Cancelled/refunded orders display the right state and do not inflate purchase totals. Verify a zero-refund and a valid partial/full refund case.
- [ ] Orders in a closed cycle cannot be added, edited, deleted, or moved by bypassing the UI.

## Installments

- [ ] No-plan state is readable and Admin sees the create action while Viewer is read-only.
- [ ] Admin creates an installment plan with a positive whole-VND total and adds one or more dated contributions.
- [ ] Progress, paid total, remaining total, and payment history match the inserted contributions.
- [ ] Empty payment history displays cleanly. Viewer cannot create plans or contributions by UI or API.

## Cycle close and reports

- [ ] Admin cannot close a cycle before its end date; after the end date, close stores a snapshot of opening balance, purchases, payments, adjustments, and closing balance.
- [ ] Closed-cycle report remains stable when later cycles change. Admin reopen restores the downstream opening balance and allows edits again; Viewer cannot close or reopen.
- [ ] Reports handle no cycles and a cycle with no orders without errors.
- [ ] For a populated cycle, reconcile displayed opening balance, purchases, payments, adjustments, and remaining balance to the ledger.
- [ ] Excel export downloads an Excel-compatible report for the selected cycle with correct dates, amounts, and statuses.
- [ ] PDF action opens the browser print dialog with report content and hides app navigation/actions in print layout.

## QR and payment guidance

- [ ] Viewer sees the configured TPBank VietQR with the correct recipient/account details. Admin does not see the Viewer payment action.
- [ ] Missing QR environment values show the fallback message rather than a broken image.
- [ ] Payment note displays exactly: **“Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé.”**
- [ ] No UI claims that transfers are automatically detected or verified; Admin still records payment after confirming money arrived.

## Release gate

- [ ] Complete manual checks above on local Supabase-backed UI at mobile and desktop widths; record failures and retest fixes.
- [ ] Run the documented production build and ensure it succeeds. Do not release with unresolved TypeScript/build errors.
- [x] Verify GitHub Pages deployment serves the production login shell (HTTP 200) at 390px and 1440px with no horizontal overflow. Confirm the production bundle contains the expected Supabase URL/publishable key and TPBank payee settings.
- [ ] Verify live Viewer API/RPC write denial and real Admin/Bé Lin Auth and recovery flows; smoke-test the authenticated production QR, reports, balances, and role visibility before creating tag `v0.1.0`. The Viewer session and Bé Lin's one-time activation are still pending.
- [ ] Reconcile Supabase migration history before the next CLI-managed database migration. Runtime schema and ACL changes are applied and verified, but the project has no migration-history table; do not run `db push` against the current date-only migrations.
- [ ] Merge feature branches into `main`; cut `release/vX.Y.Z` from the reviewed `main` commit. Do not add features to a release branch.
- [ ] Deploy only from the immutable release branch, smoke-test the production login, role visibility, debt totals, QR, reports, and a safe recovery flow, then tag the release.
- [ ] Ensure no `.env*` secrets, Supabase secret keys, credentials, or personal payment evidence are included in the release.

## Known coverage gaps

- The historical Excel workbook is a one-time import source and is not part of routine app-entry QA.
- No bank API, transfer webhook, receipt upload, or automatic payment verification exists in v0.1.0.
- Browser/device coverage is manual; this plan does not specify automated cross-browser, accessibility, or load testing.
- Admin-generated recovery is for provisioned Viewer accounts. First-time provisioning still uses the allowlisted email activation flow.
