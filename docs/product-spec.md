# Product specification

## Purpose

Shopee Lin tracks purchases made by Bé Lin, the debt Bé Lin owes, settlement payments, and a separate S25 Ultra installment plan.

The supplied Excel workbook is historical data for a one-time migration only. After release, the Admin enters and maintains all new records in the application.

## Users

- Admin: Can create, update, cancel, settle, and close records.
- Viewer: Bé Lin. Can only view balances, reports, installments, and payment details.
- Viewer test: A separate Gmail plus-alias account that delivers to the Admin inbox.
- Default display names: Admin — Bé Kịt Thần Kỳ; Viewer test — Tester Quèn; Bé Lin — Bé Lin Tốc Độ Cao. Each user can edit their own display name in the app.
- Hồ Sơ lets a user update their display name and avatar. Email is read-only for every role and visually marked as such. Display name is required and marked with `*`. Avatars are private, user-owned JPEG/PNG/WebP files up to 2 MB; old avatar objects are retained.
- Admin can generate a single-use recovery link for a provisioned Viewer without sending email; the Viewer chooses a new password from the link. Its five-minute expiry requires the project-wide Email OTP expiry to be configured to 300 seconds.
- Local test-account shortcuts show only the role and default display name; the email remains an internal sign-in identifier.
- The authenticated shell uses a visually distinct left navigation panel on desktop. The profile card at the bottom shows each signed-in user's display name, role, and avatar; the role is centered below the name in smaller gray text, and users without an uploaded avatar see the shared default avatar. Profile actions sit below the avatar, followed by a left-aligned small `v0.1.0` label. Mobile retains compact horizontal navigation. Billing-cycle labels in the Overview, cycle filter, and report cycle selector include the date range (for example, `12.2026 (21/11/2026 – 20/12/2026)`). Keep the Orders table cycle column compact and show only the ending-month label. The current-period card uses a neutral gray “Kỳ Hiện Tại” label and does not repeat the signed-in role.

## Core rules

- A billing cycle normally runs from the 21st of one month to the 20th of the next month.
- Orders and settlement payments are separate records.
- One payment can settle many orders. Admin selects orders after money has arrived; the app calculates the exact total outstanding and asks for confirmation in a ShopeeLin dialog. Confirming fully settles every selected order. Underpayment is rejected in the app and the database RPC.
- An order status is unpaid, paid, cancelled/refunded, or soft-deleted. There is no **Trả Một Phần** status or filter. Historical orders with a remaining balance stay unpaid and show the remaining amount.
- **Chưa Thanh Toán** represents a Shopee order waiting for delivery/transport. **Đã Thanh Toán** means an order completed on Shopee; completed orders cannot be edited, cancelled, or refunded in this app. Admin may cancel an unpaid order only when Shopee stops it before completion; a refund cannot exceed money already allocated to that order.
- Admin may soft-delete only an unpaid order with no payment allocations. Deleted orders remain stored and visible as history, are excluded from balances, and can be restored by Admin while their billing cycle is open. The Admin status filter always includes **Đã Xóa**, even if no deleted order currently exists. Orders with payment allocations cannot be deleted; they must be fully settled or cancelled/refunded if Shopee stops them before completion.
- Hard deletion is not available for application records. Reopened billing cycles retain prior closing snapshots as history.
- Admin may optionally save the Shopee order URL. Admin can open that link in a new tab from the Orders table; the View control is disabled if no valid Shopee order URL is saved. The Viewer Orders table omits the entire **Hành Động** column because it has no order actions.
- Orders show the selection checkbox before the date and place the billing-cycle column after amount. Order description, placed date, and positive VND amount are required and marked with `*`; the Shopee URL is optional.
- Orders search and filter controls remain visible without opening a parent filter panel. On entering Orders, both roles start with the newest billing cycle selected and applied; its selector summary shows that cycle label. The status selector starts with no options checked and its summary reads **Tất Cả**. Both selectors offer a **Chọn Tất Cả** checkbox and apply staged selections only after **Áp Dụng Bộ Lọc**. If no values are selected in a group, that group does not restrict results; applying an empty selection preserves the visibly unchecked options when the menu is reopened. If no cycle exists, the cycle filter does not restrict results. Only one selector menu may be open at once. Both cycle and status options use a single-column list; the cycle selector has a searchable, height-limited list so older cycles remain accessible without making the panel grow indefinitely. Each cycle option shows its label above the date range beside a left-aligned checkbox.
- Orders search shows up to six matching, shortened order-description suggestions while typing. Selecting a suggestion applies that order description as the query; Enter and the search button continue to apply typed text. Suggestions support arrow-key navigation and close on Escape or outside click.
- S25 Ultra installments remain separate from ordinary Shopee debt.
- An installment contribution must be a positive whole-VND amount no greater than the plan's remaining balance. Orders with existing payment allocations cannot change amount, placed date, or billing cycle; descriptive text and Shopee URL may still be corrected.
- Reopening an earlier billing cycle is rejected while any later cycle remains closed, preventing retained reports from becoming stale. Admin reopens closed cycles from newest to oldest before editing earlier history.
- The Viewer payment card shows the full QR image selected by Admin and the editable payment note; it does not repeat recipient name, bank, or account number below the image. Admin can update only the full QR image and note from an Admin-only **Thanh Toán** tab. Uploaded QR images are displayed as-is; the app validates that the upload is a supported, readable image within the size limit, but does not decode the QR or verify its destination.
- There is no bank API integration, receipt upload, or automatic payment verification in v0.1.0.

