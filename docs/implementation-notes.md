# Implementation notes

## 2026-11-21

- Supabase project URL must be the project root URL, not the `/rest/v1/` endpoint.
- Use only the Supabase publishable key in the browser. Never use a secret key in this application.
- Historical Excel dates are mixed between text and spreadsheet date cells. Import needs a review step before data is marked final.
- The initial schema is already applied. Apply `supabase/migrations/20261121_allowlisted_profiles.sql` before either user first signs in.
- Apply `supabase/migrations/20261121_v01_ledger_reports.sql` to upgrade an existing database before using the new order, payment, cycle-close, refund, and ledger UI.
- The one-time import generator reads the workbook with `openpyxl`; generated data SQL belongs only in ignored `supabase/local/` and is never committed.
- GitHub Pages builds require repository Actions variables for Supabase URL/publishable key and the VietQR payee details. Supabase Auth must allow both local and `/shopee-lin/` callback URLs.
- Historical data was imported to Supabase on 2026-11-21 and reconciled to 2,999,619 VND Shopee debt and 18,000,000 VND S25U remaining. The Supabase-GitHub integration is optional and is not required for the GitHub Pages deployment; keep it disabled unless DB migration automation is intentionally configured.
- Supabase installs `pgcrypto` in the `extensions` schema. The security-definer auth provisioning trigger must call `extensions.digest` explicitly while keeping its search path restricted; apply `20261121_fix_auth_profile_digest.sql` to projects created from the earlier schema.
- Live auth check on 2026-11-21: the Admin and Viewer test OTP requests succeeded using `http://127.0.0.1:5173/`, and their profiles were provisioned with `admin` and `viewer` roles. The Viewer test magic link was opened and its read-only dashboard loaded with the reconciled balances; the Admin link still needs to be opened. Bé Lin's OTP request was rate limited (HTTP 429). A transaction-level `authenticated` role simulation confirmed Viewer can read orders and cannot insert one; the live PostgREST write-denial check remains pending.
- Login UX uses email/password for normal sessions. First-time password setup activates/provisions the allowlisted account through one magic link, then stores a password; reset password uses Supabase recovery email. No SMTP change is needed for routine login. Existing accounts need one activation link to set their password; a browser session remains persistent by Supabase client defaults.
- Planned Admin recovery fallback: generate a single-use recovery link for an already-provisioned Viewer through an Admin-authorized Edge Function. It does not send email; share the link privately and do not store it. Its actual expiry is controlled by the project's global Email OTP expiry, which must be set to 300 seconds (and shortens all Auth email links) before the UI can claim five minutes. Deployment needs a project-scoped Supabase token with Edge Function deploy and Auth config write permissions.
- `20261121_profile_display_names.sql` was applied to production on 2026-11-21. Verified the Admin and Viewer test default names and invoked `update_my_display_name(text)` under a simulated Viewer identity inside a rolled-back transaction. The function changes only the caller's `full_name`; direct profile table updates remain governed by the Admin-only RLS policy.

