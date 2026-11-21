# Implementation plan

## v0.1.0

- [x] Establish repository guidance and branch strategy.
- [x] Create Supabase schema, roles, and Row Level Security policies.
- [x] Build passwordless login and role-aware application shell.
- [x] Implement Admin order create/edit/delete and cancellation/refund flow.
- [x] Assign orders to 21st–20th cycles; implement cycle close, reports, and Admin reopen with database guards.
- [x] Record lump payments and allocate across selected orders, including partial allocations.
- [x] Add installment plan/payment entry and history.
- [x] Add cycle report (opening balance, purchases, payments, closing balance) and CSV/print-to-PDF export.
- [x] Generate and review one-time legacy SQL including May 2026, order history, payments, opening credit, and S25U; reconcile Shopee balance 2,999,619 VND and S25U balance 18,000,000 VND.
- [ ] Apply import to Supabase and verify persisted rows and balances.
- [ ] Verify magic-link sign-in for Admin, Viewer test, and Bé Lin; exercise Viewer write denial through RLS; configure local and GitHub Pages redirect URLs.
- [ ] Run app against updated Supabase; check mobile and desktop layouts, QR config, empty/cancelled/installment/payment cases.
- [ ] Configure GitHub Pages and Actions variables, cut immutable `release/v0.1.0`, deploy and verify production, then tag `v0.1.0`.
- [ ] Complete one-time import guide and keep this plan/decision notes current.

