# Implementation notes

## 2026-11-21

- Supabase project URL must be the project root URL, not the `/rest/v1/` endpoint.
- Use only the Supabase publishable key in the browser. Never use a secret key in this application.
- Historical Excel dates are mixed between text and spreadsheet date cells. Import needs a review step before data is marked final.
- The initial schema is already applied. Apply `supabase/migrations/20261121_allowlisted_profiles.sql` before either user first signs in.
- Apply `supabase/migrations/20261121_v01_ledger_reports.sql` to upgrade an existing database before using the new order, payment, cycle-close, refund, and ledger UI.
- The one-time import generator reads the workbook with `openpyxl`; generated data SQL belongs only in ignored `supabase/local/` and is never committed.
- GitHub Pages builds require repository Actions variables for Supabase URL/publishable key and the VietQR payee details. Supabase Auth must allow both local and `/shopee-lin/` callback URLs.

