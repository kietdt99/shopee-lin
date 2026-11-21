# Product specification

## Purpose

Shopee Lin tracks purchases made by Bé Lin, the debt Bé Lin owes, settlement payments, and a separate S25 Ultra installment plan.

## Users

- Admin: Can create, update, cancel, settle, and close records.
- Viewer: Bé Lin. Can only view balances, reports, installments, and payment details.
- Viewer test: A separate Gmail plus-alias account that delivers to the Admin inbox.

## Core rules

- A billing cycle normally runs from the 21st of one month to the 20th of the next month.
- Orders and settlement payments are separate records.
- One payment can settle many orders. Admin selects the applicable outstanding orders after money has arrived.
- An order can be unpaid, paid, or cancelled/refunded.
- S25 Ultra installments remain separate from ordinary Shopee debt.
- The viewer sees a static TPBank VietQR payment card and this highlighted text: "Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé."
- There is no bank API integration, receipt upload, or automatic payment verification in v0.1.0.

