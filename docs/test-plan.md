# Manual test plan

This checklist is the release QA plan for v0.1.0. It describes expected behavior; an unchecked item is not evidence that the flow has been tested. Use test orders where possible and clean them up before release.

Install the browser once with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. The current Playwright suite runs on desktop and mobile Chromium and mocks Supabase requests. It covers login layout/error handling, Admin account/recovery-link UI, Viewer navigation and hidden Admin controls, QR guidance, empty orders plus populated installment/report views, and the ledger/export/cycle-close flows listed below. These tests validate mocked UI behavior only; live Supabase Auth/RLS/database checks below remain required.

### Playwright coverage map

| Flow | Current coverage | Manual/release check |
| --- | --- | --- |
| Order create and edit | Implemented: creates May 20, May 21, and Dec 21 orders, asserts cycle assignment including year rollover, then edits an order and checks the PATCH payload and displayed amount. | Live database assignment and closed-cycle constraints remain part of release QA. |
| Unpaid order delete | Implemented: confirms the delete flow and verifies the order is removed. | Verify database delete policy and closed-cycle constraints. |
| Partial payment across multiple orders and over-allocation rejection | Implemented: checks one payment across two selected orders, allocations and statuses, then confirms an excessive second payment is rejected without another payment record. | Verify live RPC allocation, ledger balance, and invalid-input behavior. |
| Paid order cancellation/refund | Implemented: cancels a paid order, checks the refund amount sent to the RPC, cancelled UI state, and refund ledger adjustment. | Verify live refund limits and resulting report totals. |
| Admin cycle close/reopen UI | Implemented: closes a mocked populated cycle, checks the close RPC payload, snapshot totals and closed-state UI; reopens it, checks the reopen RPC, and verifies the next cycle's prior opening balance is restored in the UI. Runs on desktop and mobile Chromium. | Verify the live end-date guard, persisted snapshot stability, downstream balance restoration, Viewer/RLS denial, and close/payment/cancellation concurrency. |
| 20th/21st billing-cycle boundary and year rollover | Implemented: asserts May 20→May cycle, May 21→June cycle, and Dec 21→January 2027 cycle. | Verify persisted assignment and ending-month labels against live data. |
| Excel-compatible export | Implemented: downloads the selected cycle's `.xls` report and checks workbook content, order/payment details, and filename. | Reconcile exported values with live ledger/report data. |
| PDF/print action | Implemented: verifies the print action invokes `window.print()` and print media hides app navigation/actions while retaining the report. | Confirm browser print dialog behavior and output on target devices. |
| Profile display-name edit | Implemented: updates the current user's name through the constrained RPC and verifies the session header changes. | Verify the RPC cannot change another profile or role in live Supabase. |

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

- [ ] Run `supabase db query --remote=<project-ref> --read-only --file supabase/verification/function_execute_acl.sql`; it must return zero rows. Anonymous callers must not execute app RPCs, while `authenticated` retains only the app RPCs and `is_admin()` needed by policies. Trigger-only functions and the legacy full-payment RPC must not be client-executable.
- [ ] With the publishable key and no bearer token, call each app RPC directly; PostgREST must deny execution. With a Viewer session, the app RPCs may be callable but must reject Admin-only mutations through their `is_admin()` checks.

- [ ] Viewer can read the approved ledger, orders, payments, installment plans/history, cycles, and reports.
- [ ] Viewer API writes to orders, payments, allocations, installment plans/payments, ledger entries, cycle status/closings, and profiles are denied.
- [ ] Viewer cannot alter `profiles.role`, another user's profile/display name, or Admin-owned records through direct API calls.
- [ ] Viewer cannot call Admin-only RPCs such as payment recording, order cancellation, cycle close/reopen, or the recovery Edge Function.
- [ ] Admin can perform the documented mutations and retains access to reports and account recovery.

## Orders and payment allocation

- [ ] Empty order list shows a useful empty state for both roles; Viewer does not see Admin controls.
- [ ] Admin creates, edits, and deletes a fully unpaid order with positive whole-VND amounts.
- [ ] Orders dated on the 20th and 21st are assigned to the expected 21st–20th billing cycles; cycle labels use the ending month.
- [ ] Admin selects multiple unpaid orders and records one received payment. Check payment total, allocations, order statuses, and resulting outstanding balance.
- [ ] Partial payment leaves the relevant order unpaid with the correct remaining amount; exact settlement marks it paid.
- [ ] Zero, negative, decimal, or over-capacity payment input is rejected without writing partial records.
- [ ] Cancelling a fully unpaid order follows the delete confirmation path. Cancelling a paid or partially allocated order follows the cancellation/refund path; refund cannot exceed received allocations.
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
- [ ] Verify live Viewer API/RPC write denial and real Auth/recovery flows; reconcile database migration history; smoke-test production QR, reports, login, and role visibility after deployment. Auth redirects/OTP configuration, Edge Function deployment, RLS catalog policies, QR Actions variables, and Pages workflow configuration have been checked, but the Pages URL currently returns 404 because no release deployment has run.
- [ ] Merge feature branches into `main`; cut `release/vX.Y.Z` from the reviewed `main` commit. Do not add features to a release branch.
- [ ] Deploy only from the immutable release branch, smoke-test the production login, role visibility, debt totals, QR, reports, and a safe recovery flow, then tag the release.
- [ ] Ensure no `.env*` secrets, Supabase secret keys, credentials, or personal payment evidence are included in the release.

## Known coverage gaps

- The historical Excel workbook is a one-time import source and is not part of routine app-entry QA.
- No bank API, transfer webhook, receipt upload, or automatic payment verification exists in v0.1.0.
- Browser/device coverage is manual; this plan does not specify automated cross-browser, accessibility, or load testing.
- Admin-generated recovery is for provisioned Viewer accounts. First-time provisioning still uses the allowlisted email activation flow.
