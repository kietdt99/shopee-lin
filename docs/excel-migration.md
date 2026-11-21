# Excel migration

The source workbook contains monthly sheets from `05.2026` to `11.2026` and a separate `Góp S25U` installment sheet. It is a one-time migration source, not an ongoing input workflow.

1. Import purchase lines as orders with positive VND amounts.
2. Import positive "Bé Lin trả nợ" entries as payments, then allocate them to prior outstanding orders after reconciliation.
3. Treat the May 2026 opening balance and each monthly carry-forward as reconciled historical balance adjustments, not purchase orders.
4. Verify dates stored as text before importing. Do not infer ambiguous values automatically.
5. Import S25U as a separate installment plan with its payment history.

