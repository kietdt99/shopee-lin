# Excel migration

The source workbook contains monthly sheets from `05.2026` to `11.2026` and a separate `Góp S25U` installment sheet. It is a one-time migration source, not an ongoing input workflow.

1. Import all 60 purchase lines from `05.2026` through `11.2026` as orders with positive VND amounts. `05.2026` has no per-order date, so those seven rows use May 18 as a documented legacy date within the partial May cycle.
2. Import the two positive "Bé Lin trả nợ" entries as payments and allocate FIFO to the oldest prior unpaid orders. The payment remains a separate record and can cover multiple orders.
3. Store the initial 5,000,000 VND as a signed opening credit ledger entry, not as an order. Carry-forward balances from the workbook seed the historic billing-cycle opening balances.
4. Normalize ambiguous spreadsheet date cells as `dd/mm/yyyy`. The supplied workbook used mixed text dates and Excel dates parsed as `mm/dd/yyyy`; dates are interpreted in the Vietnamese billing-cycle context.
5. Import S25U as a separate installment plan with its two dated payments.
6. Generate the reviewed SQL locally with `python scripts/import_legacy.py "bé Lin thiếu nợ.xlsx" > supabase/local/import_legacy.sql`. The output directory is ignored by Git because it contains personal purchase history.
7. The importer aborts unless final Shopee debt is 2,999,619 VND and S25U remaining is 18,000,000 VND. The reviewed totals are 14,936,951 VND of purchases, 6,937,332 VND paid, 5,000,000 VND opening credit, and 3,599,000 VND installment payments.
8. Apply the schema upgrades and generated import once to Supabase. Run as the database owner through the Supabase CLI because app order-write guards require an authenticated Admin session. In one transaction, temporarily disable only `protect_closed_cycle_orders` for the legacy order insert, re-enable it before commit, then verify persisted cycle/order/payment/allocation/plan rows and balances before deleting or archiving the local source workbook.

## Live import record

- Applied to project `wrcaejfcifbvmzcuukrd` on 2026-11-21.
- Verified: 60 orders, 14,936,951 VND purchases, 2 payments totaling 6,937,332 VND, 24 allocations, and -5,000,000 VND opening credit.
- Verified Shopee debt: 2,999,619 VND.
- Verified S25 Ultra: 21,599,000 VND total, 3,599,000 VND paid, 18,000,000 VND remaining.
- Verified the order guard trigger was enabled after import. The failed first attempt rolled back and left all ledger tables empty.

