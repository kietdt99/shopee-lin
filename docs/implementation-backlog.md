# Implementation Backlog

This backlog records the state of the Orders and data-safety release work as of 2026-11-22. `PLANS.md` tracks version-level release gates. The workbook is a one-time source; ordinary entries belong in the app.

## Current branch status

- Feature implementation commit: `26b8527` on `feature/orders-management`.
- Test-only commit: `fba15b6` on `test/orders-management`; its changes touch tests, test config, and the QA plan only.
- Both branches have been merged locally into `main`; integration commits are `39511f6` and `fe51b8a`.
- Local `main` is 6 commits ahead of `origin/main` after this local completion commit; it has not been pushed, and no PR, deployment, or tag was created.
- Local Vite app: `http://localhost:5173/`.
- Local Supabase: running at loopback only. It uses its own database and local Auth users; no hosted Supabase credentials are used by the app.
- No app data, migration, or deployment was changed on hosted production during this pass.

## Completed application work

- [x] Shopee-inspired orange UI, desktop left sidebar, clickable ShopeeLin brand, mobile navigation, and Title Case tabs.
- [x] Orders table, submitted search, staged multi-select cycle/status filters, human-readable cycle labels, and separate lines for reliably parsed multi-item orders.
- [x] Optional validated Shopee order link and disabled Eye action when absent or invalid.
- [x] Order create/edit, payment allocation across selected orders, partial payment balance, cycle close/reopen, reports, Excel-compatible export, and print-to-PDF action.
- [x] Reversible soft-delete for eligible unpaid orders; restore action; no direct `DELETE` privilege on any of the nine app tables. Allocated/paid orders use cancellation/refund while preserving the ledger.
- [x] Installment plan creation and dated contributions with a database-enforced total cap.
- [x] Admin-only Account tab for generating a temporary recovery link, and Hồ Sơ dialog with self-editable display name, read-only email, private avatar upload, and one Save Changes action.
- [x] Authentication, role-sensitive UI, and RLS/RPC guards; login, password, order/payment, and avatar Storage errors use Vietnamese user-facing fallbacks.
- [x] Local Admin and Tester one-click login exists only in Vite development against loopback Supabase.
- [x] Common UI labels, font sizing, alignment, and table layouts were reviewed on desktop/mobile. The table's desktop flex-row collision was fixed; the data table no longer overflows horizontally at the verified desktop viewport.

## Completed data and local infrastructure checks

- [x] Import the frozen workbook once into the isolated local database, including `05.2026`, historical payments/allocations, opening offset, and S25 Ultra contributions.
- [x] Reconcile local data: 60 orders; 2 payments; 24 allocations; Shopee debt 2,999,619 VND; S25 Ultra total 21,599,000 VND, paid 3,599,000 VND, remaining 18,000,000 VND.
- [x] Start Docker Desktop/Supabase local and apply pending local migrations without `db reset`.
- [x] Seed local Admin and Tester Auth users. Admin signed into the local app; Viewer test signed in through local Auth/PostgREST.
- [x] Verify Viewer can read orders and profiles but cannot insert installment plans (RLS 403) or call payment, cancellation, close-cycle, or reopen-cycle RPCs (Admin guard rejection).
- [x] Verify PostgreSQL reports no `DELETE` table privilege for the `authenticated` role on any of the nine public app tables.
- [x] Preserve the one-time import output, generated local environment, Auth credentials, and Docker database outside version control.

## Test-only branch: `test/orders-management`

- [x] Replace stale hard-delete/profile-label expectations and cover current local login UI.
- [x] Cover order search/filter submit behavior, cycle boundaries/year rollover, item-line parsing, and Shopee link validation/safe target attributes.
- [x] Cover soft-delete confirmation, retained/grey row, debt exclusion, restore, no hard-delete request, and paid/allocated order restrictions.
- [x] Cover multi-order/partial payment allocation and overpayment rejection; cancellation/refund; cycle close/reopen UI; export and print actions.
- [x] Cover profile email read-only, avatar validation/upload preview, installment creation/contributions/limits/history, and account role affordances.
- [x] Run at 1280 px desktop and 390 px / 320 px mobile; no horizontal overflow in covered pages.
- [x] Final integrated local `main` verification after copy changes: `pnpm test:e2e` 77/77 (32.7s), `pnpm build` passed (1,628 modules), `git diff --check` clean.
- [x] QA report: no P0–P3 product defects in the mocked Playwright suite. Mocks do not prove database, Auth, Storage, or production behavior.

## Remaining release gates

- [ ] Complete a production-authenticated Admin and Bé Lin smoke test for role visibility, balances, reports, configured QR, session persistence, and password recovery. Preserve Supabase's two-email-per-hour quota; do not request new emails for the Tester.
- [ ] Verify private avatar Storage ownership against authenticated local Supabase, including cross-user read denial.
- [ ] Verify live local financial invariants/concurrency for order edits, payment allocation, refunds, cycle close/reopen, and concurrent installment contributions with isolated rollback-safe fixtures.
- [ ] Reconcile Supabase migration history before using CLI-managed production migrations; do not run `db push` blindly against the legacy date-only migration files.
- [ ] Push the locally integrated `main` commits and complete the repository's protected-branch review/check workflow. Do not modify the existing immutable release branch with feature code.
- [ ] Choose the next release version from the reviewed `main`, deploy only from an immutable `release/vX.Y.Z`, run production smoke checks, and tag only after the authenticated gates pass.
- [ ] Confirm release artifacts contain no `.env*` values, service-role/secret keys, credentials, local database passwords, recovery links, or personal payment evidence.

## Business invariants

| Invariant | Mocked Playwright | Local live verification |
| --- | --- | --- |
| Billing cycle is 21st–20th, including year rollover | Passed | Persistence/closed-cycle mutation guard pending |
| Payment allocation is integer VND, supports partial/exact settlement, rejects excess | Passed | Authenticated Admin transaction/concurrency fixture pending |
| Only unpaid orders with no allocations can be soft-deleted; history is retained | Passed | Viewer API/RPC denial and no DELETE grants passed; Admin mutation fixture pending |
| Cancellation/refund preserves history and avoids duplicate refunds | Passed | Hosted production smoke/race was previously verified; local updated migrations need fixture verification |
| Closed cycles block changes; close/reopen snapshots remain coherent | Passed | Local snapshot/concurrency fixture pending |
| Installment contributions cannot exceed the total | Passed | Viewer Admin-guard denial passed; live concurrent Admin cap fixture pending |
| Viewer is read-only, including direct writes and Admin-only RPCs | UI passed | Viewer Auth, reads, RLS insert denial, and four Admin-only RPC denials passed; avatar Storage ownership pending |
| Profile can update only its own name/avatar path | Passed with mocks | Local cross-user Storage/RPC check pending |
| Orders require a description, valid cycle, and integer positive amount | Passed | Direct Admin invalid-input and allocated-order guards pending |
