# Data model

- `profiles`: authenticated users and their `admin` or `viewer` role.
- `billing_cycles`: start/end dates, opening balance, status, and closing snapshot.
- `orders`: a purchase tied to a billing cycle. Amount is a positive whole VND value.
- `payments`: a transfer that the Admin has confirmed receiving.
- `payment_allocations`: connects one payment to one or more orders, including partial settlement support.
- `installment_plans`: a separate financed purchase such as S25 Ultra.
- `installment_payments`: payments made against an installment plan.
- `payment_settings`: the current payment display configuration edited by Admin and read by authenticated users; uploaded QR revisions remain in private Storage.

