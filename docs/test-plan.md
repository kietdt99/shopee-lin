# Manual test plan

This checklist is the release QA plan for v0.1.0. It describes expected behavior; an unchecked item is not evidence that the flow has been tested. Use test orders where possible and clean them up before release.

### Latest verification — 2026-11-23

- Mocked auth routing regression on Chrome and Edge: stale password-setup marker, valid `?set-password=1` with unrelated query/hash preservation, failed password login, and signed-in session refresh/new-tab return passed 8/8. An expired callback (`?set-password=1&error_code=otp_expired`) failed 0/2: the expired-link message is shown but the app still renders Password Setup instead of the login form. The regression tests disable trace, screenshot, and video artifacts and assert that access/refresh tokens or auth codes do not appear in the URL. No live Auth/email was used; the expired callback defect remains open for app-source correction.

### Latest verification — 2026-11-22

- 2026-11-22 Playwright alternate-port regression: redirect assertions now derive the app root from the active page origin instead of assuming port 4173. Both affected cases passed across Chrome/Edge desktop, 390px, and 320px on alternate port bases 4373 and 4473 (12/12 each). The full `app.spec.ts` subset passed 276/276 across those six projects on port base 4573. Playwright's `PLAYWRIGHT_PORT_BASE` continues to configure both runner base URLs and owned Vite servers; artifacts were isolated per run.
- 2026-11-22 Viewer overview payment CTA layout: targeted Chrome/Edge desktop, 390px, and 320px checks passed 6/6. The CTA stays right-aligned in its own desktop grid column; on narrow mobile it appears below the description, left-aligned, with no text overlap or page overflow.
- 2026-11-22 newest-cycle default and filter option alignment: targeted Chrome/Edge desktop, 390px, and 320px checks passed 42/42. Admin and Viewer default to the newest billing cycle with all statuses unchecked; clearing cycles applies all orders while cycle/status controls remain visually unchecked after Apply. Cycle options meet the 48px touch-row minimum, keep checkboxes centered with their labels, and stay within the menu bounds. The check waits for the menu's own entrance animation before measuring layout; the strict geometry assertion remains enabled.
- 2026-11-22 final integrated source snapshot: pnpm exec playwright test --workers=1 passed 292/292 in 5.3 minutes across Chrome/Edge desktop, 390px/320px mobile, accessibility, and QR fallback. This full run included the latest-cycle filter defaults and Viewer overview CTA checks; all mocked E2E checks passed. Local Supabase/API and production gates remain separate.
- 2026-11-22 clarified filter UX and status-badge containment: targeted Chrome/Edge desktop, 390px, and 320px checks passed 24/24 for Admin and Viewer. Empty cycle/status selections apply as All while remaining visually unchecked when reopened; unpaid status text stays within its status cell and table/card bounds, including the 2560px desktop viewport.
- 2026-11-22 QA maintenance on `test/orders-quality`: updated stale expectations for custom dialogs, whole-order payment, no partial status, Vietnamese labels, URL-backed tabs, supported sort fields, payment-settings, and QR image/note. `pnpm test:e2e` passed twice consecutively, 268/268 each run (2.9m per run), across Chrome/Edge desktop, 390px/320px mobile, and QR fallback. Targeted filter/action regressions passed; axe passed 12/12 role/viewport scans after the test waits for page animations to finish before scanning, eliminating transition-state color contrast false positives. This remains mocked browser QA; local API/RLS was not rerun because Docker is unavailable, and hosted production checks remain separate gates.

- 2026-11-22 QA expansion on `test/qa-coverage-chrome-edge`: Playwright was configured to use installed Chrome and Edge channels for desktop, mobile emulation (390px/320px), and QR fallback. Added axe WCAG 2.1 A/AA scans, local authenticated API/RLS probe, and gzip bundle budget. The initial axe run reported transition-state contrast findings and a brand accessible-name mismatch; later verification showed the contrast findings came from scanning during the dialog/backdrop animation, and the brand label was corrected. The current `test/orders-quality` suite passes 268/268 twice, including 12/12 axe scans. Bundle budget passed at 117.5 KiB JS gzip / 4.6 KiB CSS gzip.
- 2026-11-22 local API/RLS probe passed against loopback Supabase: Admin and Viewer authentication/roles and order reads succeeded; Viewer installment-plan insertion, Orders DELETE, and installment/soft-delete/cycle close/reopen RPCs were denied. The probe uses no production credentials and creates no retained rows. PostgreSQL function ACL verification was run locally; no production authorization claim is inferred from these checks.
- 2026-11-22 full UX regression audit: expanded the suite to assert current-period range and neutral label, compact table cycle label, single-column filter option layout/range, Admin-only deleted filter availability, no-selection styling for interactive controls, text-selectable search, filter outside-click/Escape closure and focus restoration, and dialog backdrop semantics. `pnpm test:e2e` passed 104/104 in 36.8s across desktop, mobile 390/320px, target viewports, and QR fallback. `pnpm build` passed (1,629 modules). Automated Supabase remains mocked; live RLS/Auth/Storage gates are unchanged.
- After the local login card identity change: `pnpm test:e2e` passed 77/77 (30.9s), including checks that Admin/Viewer role and display name are visible and both emails are absent from their cards.
- `pnpm build` passed on the feature branch (1,628 modules).
- After the final Vietnamese API/Storage error copy pass: `pnpm test:e2e` passed 77/77 on integrated local `main` (32.7s), covering desktop Chromium (1280 px), mobile Chromium (390 px and 320 px), and hosted-login/QR fallback.
- 2026-11-22 sidebar/profile follow-up: audited selectors and assertions for the changed UI, added explicit nav inset alignment, left-aligned version, default avatar loading, Admin and Viewer email read-only, required display-name, and compact-action assertions. `pnpm test:e2e` passed 89/89 in 35.1s across desktop, 390px/320px mobile, four target viewports, and QR fallback. This is mocked browser QA; actual phone scaling, private Storage ownership, and production Auth remain separate checks.
- 2026-11-22 profile/overview polish: sidebar role is centered below the display name in smaller gray text; action labels do not wrap (stacked on desktop, side-by-side on mobile); duplicate Admin badge is removed from the current-period card; the total-paid metric is removed from the overview for all roles. Current-period label is neutral gray and the value shows cycle label plus the 21st-to-20th range. Added regression assertions for role geometry/style and overview visibility.
- `pnpm build` passed after the same source changes (1,628 modules); run `git diff --check` before committing.
- Local Supabase started without `db reset`; the one-time workbook import is present in local Postgres: 60 orders, 2 payments, 24 allocations, 2,999,619 VND outstanding Shopee debt, and 18,000,000 VND S25 Ultra remaining.
- Local Admin signed into the app. A real local Viewer Auth session read its profile and orders through PostgREST; Viewer installment-plan insert was denied by RLS (HTTP 403), and payment/cancellation/close/reopen RPCs were rejected by Admin guards. No production Auth email was requested.
- PostgreSQL reports `authenticated` has no table-level `DELETE` privilege on any of the nine public app tables. This does not test every trigger/FK behavior or prove hosted policies.
- The suite is mocked and cannot establish local financial concurrency, avatar Storage ownership, or production Auth/QR/recovery behavior. Keep the release gates below open until those checks are performed.

Run `pnpm test:e2e` with desktop Chrome and Edge installed. The configured projects use only the Chrome and Edge channels: desktop (1280 px), mobile emulation (390 px and 320 px) in both browsers, and hosted-login/QR fallback in both browsers. Target-device layout assertions cover 2560×1440 desktop, 1366×768 laptop, and 384×854 representative CSS viewports for both Samsung S23 Ultra and S25 Ultra. These are emulated CSS sizes and do not establish physical-device behavior. The mocked login shortcuts exercise only the development UI; they do not prove real Auth/RLS. Run `pnpm test:api:local` against the isolated Docker-backed Supabase stack for authenticated local API/RLS checks. Neither suite proves hosted production policy behavior.

### Playwright coverage map

| Flow | Current coverage | Manual/release check |
| --- | --- | --- |
| Pure domain helpers | `pnpm test:unit` checks billing-cycle 20th/21st assignment and month/year rollover, cycle date ranges, whole-VND parsing/safe-integer rejection, order status derivation, status ordering, missing-cycle-last sorting, stable ties, and unchanged input when no sort key is selected. These tests do not cover rendering or persisted database rules. | Keep the focused Chrome/Edge Orders E2E and live cycle/RPC checks as separate gates. |
| Order create and edit | Implemented: creates May 20, May 21, and Dec 21 orders, asserts cycle assignment including year rollover, edits an order, and checks the update RPC payload/display. Allocated orders expose locked date/amount fields. The mocked orders endpoint respects its selected-column list; an allocated-order edit asserts the existing notes value is sent to `update_order` and remains persisted. | Live date/cycle guards, notes persistence, and direct API bypass denial remain local Supabase checks. |
| Orders table and required fields | Implemented: selection is the first column, cycle follows amount and remains a compact month/year label; create/edit forms mark description/date/amount required while Shopee URL remains optional. A new 2560px assertion protects long descriptions from the former 640px content cap. | Check table fit/scroll and required markers at 1280 px, 390 px, and 320 px. |
| Target device layout | Automated viewport coverage: 2K 27-inch desktop (2560×1440), 14-inch laptop (1366×768), and Samsung S23 Ultra/S25 Ultra representative CSS viewports (384×854 each); asserts expected shell width, centered desktop frame, and no horizontal overflow. These are emulated CSS sizes, not physical-device proof. | Spot-check actual browsers, OS scaling, and zoom on the owner's Samsung phones, laptop, and 27-inch display. |
| Mobile order date spacing | Implemented: measure the visible gap between the generated “Ngày” label and date text at both 320px and 390px, with the check included in the Chrome and Edge layout runs. | Confirm on physical Samsung devices at the system font scaling the owner uses. |
| Reduced-motion interaction | Implemented: confirms nonessential filter/dialog animation and transition durations are suppressed with `prefers-reduced-motion: reduce`, and exercises the filter and order form without waiting for animations. | Screen-reader and OS-level motion behavior should be spot-checked on target devices. |
| Viewer payment QR download | Mocked Chrome and Edge UI checks verify the configured signed image URL is fetched only on click and downloaded with a stable `ShopeeLin-QR-Thanh-Toan` basename plus the matching `.png`, `.jpg`, or `.webp` extension; no configured QR exposes no download action; fetch failure shows an accessible alert and a safe new-tab recovery link to the same signed image. | Validate save/download behavior on physical Samsung devices and cross-origin storage configuration in authenticated staging. |
| Sidebar and profile form | Assert sidebar tabs fill the padded inner width, the left-aligned version label, non-wrapping profile actions (stacked on desktop, side-by-side on mobile), centered role beneath display name, default avatar image load, Admin/Viewer read-only email, required display-name marker/validation, and profile dialog outside-click behavior. | Confirm actual account avatar signed URLs load from private Storage for each user. |
| Overview role visibility | Assert role appears in the sidebar for Admin and Viewer; the current-period card uses a neutral label and cycle label plus exact 21st-to-20th range with no duplicate role badge; the total-paid metric is absent for both roles. | None; confirm current-period data against local Supabase. |
| Viewer overview payment action | Assert Viewer’s payment CTA occupies the right-side grid column on desktop and moves below the description, left-aligned, at widths ≤600px; assert it does not overlap text or overflow the balance card/page. | Spot-check touch target and content at phone font scaling. |
| Required marker placement | Assert every `*` in profile and order create/edit forms shares one line with its label text at desktop and mobile widths. | None for layout; verify native required-field validation remains consistent when fields are empty. |
| Dialog interaction | Assert profile dialog stays open for inside clicks and closes when clicking the backdrop; create/edit dialogs also close from their visible close control. | Check scroll behavior on actual mobile devices for the longest dialogs. |
| Search and filters | Implemented: typing does not search until Enter/Search; clear-X appears only with text, clears the applied search, restores the list under current filter selections, and sits left of Search. Both roles default to the newest billing cycle; status and cycle checkboxes start unchecked. Multi-select filters apply only after Apply and combine; empty selection means all, and reopening preserves unchecked state. Cycle options have a 48px minimum touch row with centered checkbox/text and remain inside the menu. The popover disables accidental text selection, closes on outside click/Escape, and Escape returns focus to its trigger; search input remains text-selectable. | No DB check needed; inspect 320/390 px filter reachability and real touch interaction. |
| Order search suggestions | Added focused Chrome/Edge desktop and mobile assertions: focus/typing opens suggestions; labels are shortened while accessible names retain full descriptions; list is capped at six; typing does not filter rows before selection; ArrowUp/ArrowDown plus Enter and mouse selection apply the chosen full description; Escape and outside click dismiss; focusing again reopens suggestions. Search behavior is role-independent, so the focused coverage uses Admin. | No DB check; confirm touch selection and keyboard/focus behavior on supported browsers after UI changes. |
| Order status badge containment | Implemented: Admin and Viewer unpaid-order badges fit inside the status cell and remain within the table/card at desktop/mobile widths; desktop coverage also checks 2560 px. | Spot-check other translated/localized long status labels if copy changes. |
| Order sorting | Implemented: date, amount, cycle, and status sort in both directions; description is not sortable; missing cycles sort last and stable ties preserve the default order. Desktop controls and mobile sort select are covered. | Verify real touch behavior at 320/390 px. |
| Order action column by role | Implemented: Admin sees the action header and supported actions; Viewer sees neither the action header nor action cells, avoiding an empty column. | Confirm against seeded local role sessions after product changes. |
| URL-backed tab navigation | Mocked Chrome/Edge desktop regressions cover clicking every tab, refresh restoration, browser Back/Forward, preserving unrelated query and auth-callback hash state, and safe Viewer redirects from crafted `accounts` and `payment-settings` URLs. These prove client routing/visibility only; mocked profiles do not prove database authorization. | Verify hosted GitHub Pages routing and real Viewer API/RLS authorization separately. |
| Long cycle history filter | Implemented: a chevron icon indicates open/closed state; cycle search filters a fixed-height scrollable list with each cycle's date range while Apply remains explicit. | Verify scrolling and keyboard access when many cycles exist at mobile and desktop widths. |
| Description lines and Shopee URL | Implemented: flattened three-item sample splits into three lines while an ambiguous description stays intact; valid URL gets safe new-tab attributes and invalid URL is disabled. | Verify no imported URL is inferred; URL validation is client UX, not auth/security. |
| Unpaid order delete/restore | Implemented: confirmation triggers `soft_delete_order`, retains and greys the row, removes edit/delete actions, excludes debt, allows Restore, and sends no DELETE request. | Local Supabase must verify retained history and server denial for Viewer, allocated/paid, deleted, and closed-cycle orders. |
| Admin deleted-order filter | Assert Admin always sees the `Đã Xóa` filter option, including with no deleted rows; Viewer does not see this Admin-only option by default. A deleted row remains visible with its status and Admin Restore action. | Verify against retained deleted data in local Supabase. |
| Full payment across selected orders and paid-order eligibility | Implemented: confirms the exact total outstanding for selected unpaid orders, cancellation writes nothing, confirmation allocates full balances and sets them paid, and no partial status is produced. Existing/historical allocations remain represented in the ledger. | Verify live RPC atomicity, integer-VND invariants, ledger reconciliation, and direct Viewer/Admin API authorization. |
| Shopee-stopped unpaid order cancellation/refund | Implemented: confirms the designed cancellation dialog for an unpaid order Shopee stopped before completion, checks the refund amount sent to the RPC, cancelled UI state, refund ledger adjustment, and Overview debt calculation when a retained payment allocation and partial refund offset another unpaid order; paid/completed orders have no cancel action. | Verify live refund limits and resulting report totals against the persisted ledger. |
| Admin cycle close/reopen UI | Implemented: closes a mocked populated cycle, checks the close RPC payload, snapshot totals and closed-state UI; reopens it, checks the reopen RPC, and verifies the next cycle's prior opening balance is restored in the UI. Runs on desktop and mobile Chromium. | Verify the live end-date guard, persisted snapshot stability, downstream balance restoration, Viewer/RLS denial, and close/payment/cancellation concurrency. |
| 20th/21st billing-cycle boundary and year rollover | Implemented: asserts May 20→May cycle, May 21→June cycle, and Dec 21→January 2027 cycle. | Verify persisted assignment and ending-month labels against live data. |
| Excel-compatible export | Implemented: downloads the selected cycle's `.xls` report and checks workbook content, order/payment details, and filename. | Reconcile exported values with live ledger/report data. |
| PDF/print action | Implemented: verifies the print action invokes `window.print()` and print media hides app navigation/actions while retaining the report. | Confirm browser print dialog behavior and output on target devices. |
| Profile name/avatar edit | Implemented: self profile name save, read-only email, unsupported MIME and >2 MiB client rejection, upload/signed preview, and self avatar path save via mocked Storage/RPC. | Local Supabase must prove owner-only upload/read, private signed URL access, and self-only profile RPC; mocks prove no RLS. |
| Local login shortcut UI | Implemented: cards show only **Admin / Bé Kịt Thần Kỳ** and **Viewer / Tester Quèn**, never email; shortcut click submits the expected local-only email/password. Hosted-login project covers regular password form error. | Start Docker/Supabase separately to verify seeded Auth users, role trigger, sessions and RLS. Playwright network mocks do not authenticate against local Supabase. |
| Mocked Auth routing regression | Chrome/Edge hosted-config projects cover valid setup marker, unrelated query/hash preservation after password save, failed normal login, same-context session restore after refresh/new tab, and stale local marker. Expired setup callback currently fails: `error_code=otp_expired` leaves Password Setup visible alongside the expired-link message. Auth tests disable trace/video/screenshot capture and assert URL token/code absence. | Fix the expired-callback route behavior, then rerun this focused suite. Local Supabase activation/recovery callback behavior and single-use/expired links remain AUTH-5 release gates. |
| Installment plan and contributions | Implemented: no-plan states for both roles, existing plan with no history, Admin create, cap rejection, contribution history/progress/remaining; Viewer has no mutation action. | Local Supabase must verify `record_installment_payment` authorization, cumulative cap including concurrent requests, and persisted totals. |
| Automated accessibility | Axe scans cover the local account picker, Admin overview/orders/installments/reports/account management/profile, and Viewer payment/orders. The latest cross-browser checks passed 12/12 role/viewport scans after waiting for dialog/backdrop animations to finish; no accessible-name or WCAG 2.1 A/AA violations remain in that audited scope. | Automated axe does not replace keyboard/screen-reader review. |
| Local API config safety | Vitest resolver tests cover a missing file, incomplete/malformed synthetic env text, hosted and unsafe URL rejection, and valid loopback URLs on port 54321; tests stub `fetch` and make no API requests. The resolver reports setting names and safe next steps without echoing values. | `pnpm test:api:local` reads only `.env.development.local`; run it only after starting the isolated Docker-backed Supabase stack and confirming that file came from the local bootstrap. |
| Authenticated local API/RLS | `pnpm test:api:local` uses seeded local accounts and real PostgREST/Auth: verifies both roles, order reads, Viewer plan insert denial, DELETE denial, and Admin-only RPC denial. Prior local run passed on 2026-11-22; this config hardening task did not rerun live API checks. | Run after local migrations change. Production policy behavior, avatar Storage cross-user denial, and concurrent transactions require separate live/local checks. |
| Performance budget | `pnpm test:bundle` builds production assets and enforces gzip budgets of 250 KiB JavaScript and 50 KiB CSS. | This is a bundle-size regression guard, not a runtime/load test. Test large ledgers and production network/device latency separately before serving a broader audience. |
| Cross-browser | Playwright runs the UI suite on desktop Chrome and Edge, 390px/320px emulation in both, plus QR fallback in both. No Firefox or WebKit project is configured per customer scope. | Physical Samsung rendering/scaling and production browser Auth remain manual release checks. |

Automated ledger scenarios use mocked order/payment/cycle data and assert the UI plus key request payloads. The mocked close/reopen test exercises UI state and modeled balance changes; it does not prove the RPC's persisted database effects. Keep database authorization, ledger integrity, live close/reopen behavior, and export reconciliation against real data in the manual/release checks; mocked browser coverage cannot establish those guarantees.

## Preconditions

### Test maintenance rule

For every code change, QA reviews the related existing tests against the current product spec and implementation, searches for stale selectors/copy/expectations, and confirms the changed requirement has an observable assertion. Add regression coverage for confirmed defects; update this map and explicitly list material gaps that need manual or live-service checks. A green suite alone does not establish complete coverage.

Playwright runs use zero retries so intermittency remains visible. Accessibility scans wait until active page animations have completed; otherwise a dialog backdrop's opacity animation can create transient, viewport-dependent contrast findings. Keep runs sequential when they share configured ports and `test-results`; parallel runs require unique `PLAYWRIGHT_PORT_BASE` and `PLAYWRIGHT_OUTPUT_DIR` values.

- [x] Run the app locally against the isolated loopback Supabase project; confirm the URL uses the project root, not `/rest/v1/`.
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
- [x] Authenticated local Viewer API smoke: profile/orders reads succeed; installment-plan insert fails at RLS with HTTP 403; payment, cancellation, close, and reopen RPCs fail at Admin guards. No valid row was created.
- [x] Local Postgres confirms no `DELETE` privilege for `authenticated` on any of the nine public app tables.
- [ ] With a Viewer session, call table writes and Admin-only RPCs through PostgREST; verify RLS and `is_admin()` deny them. Catalog checks and SQL role simulation do not replace this authenticated API test.

The local API check above is evidence for the named local operations only. Production Viewer authorization, broader table writes, profile changes, avatar Storage ownership, and recovery-function access remain separate gates.

- [ ] Viewer can read the approved ledger, orders, payments, installment plans/history, cycles, and reports.
- [ ] Viewer API writes to orders, payments, allocations, installment plans/payments, ledger entries, cycle status/closings, and profiles are denied.
- [ ] Viewer cannot alter `profiles.role`, another user's profile/display name, or Admin-owned records through direct API calls.
- [ ] Viewer cannot call Admin-only RPCs such as payment recording, order cancellation, cycle close/reopen, or the recovery Edge Function.
- [ ] Admin can perform the documented mutations and retains access to reports and account recovery.

## Orders and payment allocation

- [ ] Empty order list shows a useful empty state for both roles; Viewer does not see Admin controls.
- [ ] Admin creates and edits an unpaid order; soft-deleting it requires confirmation, retains history, and can be reversed with Restore. All amounts must be positive whole-VND integers.
- [ ] Orders dated on the 20th and 21st are assigned to the expected 21st–20th billing cycles; cycle labels use the ending month.
- [ ] Admin selects one or more unpaid orders and confirms recording payment of their exact outstanding total. Check allocations, all selected order statuses, and resulting outstanding balance.
- [ ] The app does not offer partial order settlement or a “Trả Một Phần” status. Exact full settlement marks each selected order paid; partially allocated historical data stays unpaid and cannot be newly settled by entering a partial amount.
- [ ] Invalid whole-VND amounts and over-allocation are rejected by the server without partial records. The UI payment confirmation derives the amount from selected balances rather than accepting a manual amount.
- [ ] Soft-deleting an unpaid order with no allocations requires confirmation, preserves its row, excludes it from balances, displays a disabled Edit plus Restore action, and restoration returns it to unpaid. No app role can hard-delete an order through PostgREST.
- [ ] A paid order cannot be soft-deleted. It follows the Shopee cancellation/refund flow only when applicable; refund cannot exceed received allocations, and payment history remains intact.
- [ ] Reopening a cycle retains its prior close snapshot; re-closing creates a new active version. Admin cannot hard-delete cycles, payments, allocations, installment data, ledger rows, profiles, or close history through the API.
- [ ] Profile avatar accepts JPEG/PNG/WebP up to 2 MB, displays a private signed preview, and saves only the current user's object path. Unsupported/oversized files fail visibly; replaced avatar objects remain retained.
- [ ] Orders table displays cycle labels rather than UUIDs; search runs only on Enter/Search; multiple cycle and status filters apply only after clicking “Áp Dụng Bộ Lọc”.
- [ ] Shopee URLs open only through the Admin Eye action in a new tab; empty/invalid URLs leave the action disabled. The historical import should not infer URLs absent from the workbook.
- [ ] Multi-product descriptions preserve separate Excel blocks. For already flattened descriptions, split only when every chunk validates; otherwise keep the description intact.
- [x] Before applying `20261121130000_serialize_order_financial_rpcs.sql`, audit existing refund ledger rows for duplicates; 2026-11-21 check found zero refund rows. The migration does not reconcile historical entries.
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

- [ ] Admin can open the Payment Settings tab, upload a valid image, save the note, and see validation for unsupported/oversized files. Viewer cannot see or access this tab.
- [ ] Viewer sees only the configured payment image and note; recipient name/account details are not duplicated in the UI. Admin does not see the Viewer payment action.
- [ ] Missing QR image shows the fallback presentation rather than a broken image; it retains the full note and does not invent recipient details.
- [ ] Default payment note displays exactly: **“Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé 😘”**; an Admin-saved note is trimmed and shown to Viewer after reload.
- [ ] No UI claims that transfers are automatically detected or verified; Admin still records payment after confirming money arrived.

## Release gate

- [ ] Complete manual checks above on local Supabase-backed UI at mobile and desktop widths; record failures and retest fixes.
- [x] Run the documented production build and ensure it succeeds. Do not release with unresolved TypeScript/build errors. (Verified locally 2026-11-22; rerun on the integrated branch before release.)
- [x] Verify GitHub Pages deployment serves the production login shell (HTTP 200) at 390px and 1440px with no horizontal overflow. Confirm the production bundle contains the expected Supabase URL/publishable key and TPBank payee settings.
- [ ] Verify live Viewer API/RPC write denial and real Admin/Bé Lin Auth and recovery flows; smoke-test the authenticated production QR, reports, balances, and role visibility before creating tag `v0.1.0`. The Viewer session and Bé Lin's one-time activation are still pending.
- [ ] Reconcile Supabase migration history before the next CLI-managed database migration. Runtime schema and ACL changes are applied and verified, but the project has no migration-history table; do not run `db push` against the current date-only migrations.
- [ ] Merge feature branches into `main`; cut `release/vX.Y.Z` from the reviewed `main` commit. Do not add features to a release branch.
- [ ] Deploy only from the immutable release branch, smoke-test the production login, role visibility, debt totals, QR, reports, and a safe recovery flow, then tag the release.
- [ ] Ensure no `.env*` secrets, Supabase secret keys, credentials, or personal payment evidence are included in the release.

## Known coverage gaps

- The historical Excel workbook is a one-time import source and is not part of routine app-entry QA.
- No bank API, transfer webhook, receipt upload, or automatic payment verification exists in v0.1.0.
- Automated cross-browser coverage is limited to Chrome and Edge and their emulated mobile viewports; physical device scaling, browser UI/OS behavior, runtime load under large datasets, and multi-user load remain manual.
- Axe audits automated WCAG rules but does not cover screen-reader usability, all keyboard flows, or every WCAG criterion.
- Admin-generated recovery is for provisioned Viewer accounts. First-time provisioning still uses the allowlisted email activation flow.
