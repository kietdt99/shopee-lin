# Product specification

## Purpose

Shopee Lin tracks purchases made by Bé Lin, the debt Bé Lin owes, settlement payments, and a separate S25 Ultra installment plan.

The supplied Excel workbook is historical data for a one-time migration only. After release, the Admin enters and maintains all new records in the application.

## Users

- Admin: Can create, update, cancel, settle, and close records.
- Viewer: Bé Lin. Can only view balances, reports, installments, and payment details.
- Viewer test: A separate Gmail plus-alias account that delivers to the Admin inbox.
- Default display names: Admin — Bé Kịt Thần Kỳ; Viewer test — Tester Quèn; Bé Lin — Bé Lin Tốc Độ Cao. Each user can edit their own display name in the app.
- Hồ Sơ lets a user update their display name and avatar. Email is read-only. Avatars are private, user-owned JPEG/PNG/WebP files up to 2 MB; old avatar objects are retained.
- Admin can generate a single-use recovery link for a provisioned Viewer without sending email; the Viewer chooses a new password from the link. Its five-minute expiry requires the project-wide Email OTP expiry to be configured to 300 seconds.
- Local test-account shortcuts show only the role and default display name; the email remains an internal sign-in identifier.

## Core rules

- A billing cycle normally runs from the 21st of one month to the 20th of the next month.
- Orders and settlement payments are separate records.
- One payment can settle many orders. Admin selects the applicable outstanding orders after money has arrived.
- An order can be unpaid, partially paid, paid, cancelled/refunded, or soft-deleted.
- Admin may soft-delete only an unpaid order with no payment allocations. Deleted orders remain stored and visible as history, are excluded from balances, and can be restored by Admin while their billing cycle is open. Paid or partially paid orders cannot be deleted; they follow the cancellation/refund flow.
- Hard deletion is not available for application records. Reopened billing cycles retain prior closing snapshots as history.
- Admin may optionally save the Shopee order URL. The Orders tab opens that link in a new tab; the View control is disabled if no valid Shopee order URL is saved.
- Orders show the selection checkbox before the date and place the billing-cycle column after amount. Order description, placed date, and positive VND amount are required and marked with `*`; the Shopee URL is optional.
- S25 Ultra installments remain separate from ordinary Shopee debt.
- An installment contribution must be a positive whole-VND amount no greater than the plan's remaining balance. Orders with existing payment allocations cannot change amount, placed date, or billing cycle; descriptive text and Shopee URL may still be corrected.
- Reopening an earlier billing cycle is rejected while any later cycle remains closed, preventing retained reports from becoming stale. Admin reopens closed cycles from newest to oldest before editing earlier history.
- The viewer sees a static TPBank VietQR payment card and this highlighted text: "Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé."
- There is no bank API integration, receipt upload, or automatic payment verification in v0.1.0.

