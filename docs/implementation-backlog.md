# Implementation Backlog

This file is the working checklist for the next ShopeeLin build. It separates code that can be completed in the repository from actions that require local Docker or a production account. `PLANS.md` remains the version-level release plan.

## Current work: Orders and data safety

### Application behavior

- [x] Desktop left sidebar, clickable ShopeeLin brand, mobile navigation, and Title Case navigation tabs.
- [x] Responsive Orders table with Date / Order / Amount / Status / Actions columns.
- [x] Search submits only on Enter or the search button.
- [x] Multi-select cycle and status filters apply only after the user clicks Apply.
- [x] Show human-readable cycle labels instead of database UUIDs.
- [x] Render multi-product orders as separate item lines while retaining the original description.
- [x] Optional Shopee order URL field; Admin Eye action opens validated Shopee order links in a new tab and is disabled without a valid URL.
- [x] Soft-delete confirmation and Restore action in the Orders UI; deleted orders are visually muted and excluded from balances/reports.
- [x] Prevent selecting already-paid orders for another payment allocation.
- [x] Keep the Viewer overview focused on debt and installments; show total received only to Admin.
- [x] Clarify installment actions: create a plan versus recording a contribution.
- [x] Show “Tổng đã thanh toán” only to Admin; keep Viewer overview focused on their debt and repayment.
- [x] Complete Hồ Sơ dialog: private avatar upload, editable display name, read-only email, and one Save Changes action. Browser test and database runtime validation remain open.
- [ ] Finish app-wide copy/layout pass: inconsistent English, Vietnamese sentence casing, font sizes, alignment, spacing, and mobile touch targets.

### Database and import

- [x] Historical workbook importer includes all monthly sheets, including `05.2026`, historical payments/allocations, opening offset, and S25 Ultra contributions.
- [x] Importer reconciles to 2,999,619 VND Shopee debt and 18,000,000 VND S25 Ultra remaining; stable IDs are unchanged by description normalization.
- [x] Preserve separate product blocks in multi-item order descriptions.
- [x] Review and statically validate the no-hard-delete migration, FK behavior, close/reopen snapshot retention, RLS grants, and order soft-delete RPCs. PostgreSQL runtime validation remains unavailable here.
- [x] Ensure insert/update against an open order cycle cannot race a cycle close; the shared transaction advisory lock serializes direct order writes and financial/cycle RPCs.
- [x] Ensure the local bootstrap never wipes an existing local database silently; it applies pending migrations without running `db reset`.
- [x] Enforce a contribution cap so installment payments cannot exceed the plan total, including concurrent writes; the Admin UI calls the guarded RPC and direct authenticated inserts are revoked. Local Postgres verification remains open.
- [x] Prevent amount/date/cycle edits on orders with allocations when they could invalidate payment history; the Admin UI calls a guarded RPC and direct authenticated order updates are revoked. Local Postgres verification remains open.
- [x] Require nonblank descriptions and a valid 21st–20th cycle on order insert/update; preflight the existing rows before migration constraints are applied.
- [x] Prevent reopening an earlier closed cycle while any later cycle remains closed, even if a later snapshot is missing.
- [ ] Start Supabase local, seed only the local Admin and Tester accounts, and load the one-time history into the isolated local DB when Docker is available.
- [ ] Verify local Admin/Viewer RLS and soft-delete/restore using the local stack.
- [x] Do not apply the new migration to hosted Supabase or change production data during this local implementation task.

## Test-only branch: `test/orders-management`

- [ ] Update stale Playwright tests that expect hard deletion and old labels (QA report completed; implementation remains on `test/orders-management`).
- [ ] Cover soft delete confirmation, deleted styling, no Edit/Delete, Restore, and restore state.
- [ ] Cover payment eligibility so paid orders cannot be selected; partial orders use only their remaining amount.
- [ ] Cover installment overpayment rejection and allocated-order financial-field immutability.
- [ ] Cover search submit behavior, multi-select filters, explicit Apply, human-readable cycle labels, and multiline item rendering.
- [ ] Cover valid/invalid/missing Shopee links and safe new-tab behavior.
- [ ] Cover Hồ Sơ avatar loading, unsupported/oversized files, save, signed URL refresh, and mobile layout.
- [ ] Cover installment create/contribution wording and empty history.
- [ ] Check 360–390 px mobile and 1280 px+ desktop without horizontal overflow; verify dialogs and action controls remain reachable.
- [ ] Run the full mocked Playwright suite and `pnpm build`; mocked tests do not prove live RLS or real email/Auth behavior.

## Release gates requiring real infrastructure or account access

- [ ] Local Supabase-backed end-to-end smoke test. Bootstrap prepared the ignored local workspace and confirmed the one-time import SQL is available; execution stops before startup because this host has no Docker CLI/Desktop.
- [ ] Authenticated Viewer API/RPC write-denial check, real Admin and Bé Lin login, and real recovery-link single-use/expiry check.
- [ ] Verify production QR image, reports, balances, roles, and recovery behavior with real authenticated sessions.
- [ ] Reconcile Supabase migration history before any CLI-managed production migration. The existing project has no usable migration history; do not run `db push` blindly.
- [ ] Merge reviewed feature and test branches into `main`, cut an immutable `release/vX.Y.Z`, deploy, smoke-test, and tag only after all release gates pass.
- [ ] Confirm release artifacts contain no secret keys, credentials, local database passwords, or personal payment evidence.

## Business logic coverage requirements

| Invariant | Playwright mock | Local Postgres/RLS |
| --- | --- | --- |
| Billing cycle uses 21st–20th, including year rollover | Verify assignment payload and label | Verify persisted cycle and closed-cycle rejection |
| One received payment allocates across eligible orders, partial/exact settlement works, excess fails atomically | Verify request payload, remaining amount, and status | Call RPC and verify allocations/ledger in rollback-only fixtures |
| Only unpaid orders with zero allocations can soft-delete; restore only while cycle is open | Verify confirm/state/actions and RPC payload | Verify RPC denies paid/partial/closed-cycle cases and no DELETE/TRUNCATE privileges exist |
| Cancel/refund preserves history, refund cannot exceed allocations, duplicate cancel is rejected | Verify UI sends amount and updates state | Verify ledger adjustments, duplicate guard, and concurrency behavior |
| Closed cycle blocks order/payment changes; reopen retains history and reclose appends a current snapshot | Verify UI state and RPC flow | Verify persisted snapshots, next opening balance, and competing writes |
| Installment contribution is positive and cannot exceed remaining principal | Verify form feedback and RPC payload | Verify concurrent contributions cannot exceed plan total |
| Viewer is read-only, including direct API/RPC/Storage calls | Verify controls are absent | Verify authenticated Viewer requests are denied by RLS/policies |
| Profile edits affect only current user's name/avatar path | Verify read-only email and UI flow | Verify RPC and Storage reject another user's path |
| Order description is non-empty; billing cycle is required and matches the 21→20 range | Verify whitespace-only/incorrect-cycle submission is blocked | Verify direct Admin API cannot insert blank description, null/wrong cycle, or edit an allocated order's amount/date/cycle |
| Reopening an old cycle cannot leave any later closed snapshot stale | Verify multi-cycle dialog/error state | Verify DB rejects reopening when a later closed cycle depends on the balance |
| VND parser never turns negative/decimal/malformed input into a different positive amount | Verify invalid values send no mutation request | Verify RPC rejects zero, negative, decimal, overflow, and out-of-capacity values |

## Team allocation for this pass

| Owner | Work |
| --- | --- |
| Leader | Integrate Orders UI, profile dialog, copy corrections, backlog, local build and test coordination. |
| Database agent | Review no-hard-delete migration, fix cycle-close race, and make local bootstrap non-destructive. |
| Profile agent | Implement the private avatar Storage migration and isolated reusable avatar upload component. |
| Data migration agent | Audit workbook shape, implement safe normalization, and prove deterministic IDs and financial reconciliation. |
| QA agent | Independently audit all product/business/security/data/UI/release behavior, report severity/evidence to Tech Lead, then implement test-only coverage on `test/orders-management` after feature acceptance. |
