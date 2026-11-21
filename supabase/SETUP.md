# Supabase setup

## 1. Apply the schema

Open **SQL Editor** in the Supabase dashboard, paste `schema.sql`, and run it once. This creates all application tables, the payment transaction function, and Row Level Security policies.

For an existing project, apply `migrations/20261121213000_restrict_anonymous_function_execute.sql` after the schema and other function migrations. It removes default `PUBLIC`/`anon` execution from app RPCs, keeps only the `authenticated` grants required by the app and RLS, and disables client execution for trigger-only and legacy functions. New projects created from `schema.sql` receive the same ACLs.

Verify the effective grants with the read-only check in `verification/function_execute_acl.sql`; it should return zero rows. Do not apply that migration through production release automation without reviewing the SQL diff.

## 2. First-time account activation

No dashboard user creation is needed. On first use, each allowlisted user enters their email and chooses **Đặt password lần đầu**. Supabase sends one activation magic link; opening it in the same browser provisions the role through the database trigger and lets the user set a password. Routine sign-ins then use email/password and do not send email. Password recovery sends an email only when needed.

- Admin account
- Viewer test account (Gmail plus-alias, delivered to the Admin inbox)
- Viewer account

Default display names are **Bé Kịt Thần Kỳ**, **Tester Quèn**, and **Bé Lin Tốc Độ Cao**. Each user can edit their own display name from the profile header.

## 3. Configure Auth

- `supabase/config.toml` declares the production GitHub Pages site URL, local development callback patterns (`localhost` and `127.0.0.1` on port 5173), the Pages app-path callback pattern, and the 300-second Email OTP expiry.
- Use a short-lived project-scoped CLI token with Auth configuration and Edge Functions access. Review `supabase config diff --remote=wrcaejfcifbvmzcuukrd` before pushing; preserve undeclared remote settings and verify the diff contains only the intended site URL, redirect allowlist, and OTP expiry updates.
- Push the reviewed configuration with `supabase config push --remote=wrcaejfcifbvmzcuukrd`. Then confirm the deployed Auth URL Configuration and OTP expiry in Supabase.
- The database allowlist rejects every other email address, even while Supabase sign-ups remain enabled for the three approved identities.
- The 300-second Email OTP expiry is project-wide and also shortens activation, password recovery, and other Auth email links.

## 4. Admin-assisted password recovery

For a provisioned Viewer account, Admin can generate a single-use recovery link from the app. Supabase generates the link without sending email; the Viewer opens it and chooses a new password. Treat the link as a bearer credential and share it privately. The five-minute expiry is only in effect after the global `300`-second Auth setting above has been applied.

Create a short-lived, project-scoped Supabase CLI credential with the permissions required by `config push` and Edge Function deploy: Auth config read/write plus project admin write; Edge Functions read/write; and the read access listed by `supabase config push --help` (database config/read/SSL/network, infra add-ons, Data API, Realtime, Storage, project and production branch read).
Store the scoped token in the Supabase CLI credential store with `supabase login --name shopee-admin-recovery --token ...`. Subsequent CLI commands use the stored credential; `--profile` is a different CLI setting and does not select a token by name.

```powershell
$cli = ".\node_modules\.bin\supabase-cli\supabase.exe"
& $cli config diff --remote=wrcaejfcifbvmzcuukrd
```

Inspect that diff and confirm the Auth changes are limited to the intended site URL, redirect allowlist, and OTP expiry at 300 seconds. The project-wide expiry also shortens activation and self-service recovery links. Then run these separately:

```powershell
& $cli config push --remote=wrcaejfcifbvmzcuukrd --yes
```

```powershell
& $cli functions deploy admin-reset-password-link --remote=wrcaejfcifbvmzcuukrd --use-api
```

Do not put a Supabase secret key in the browser or repository; the Edge Function uses Supabase's server-injected service-role environment variable.

## 5. Deploy variables

Create GitHub Actions repository variables named `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PAYEE_NAME`, `VITE_PAYEE_ACCOUNT`, and `VITE_PAYEE_BANK`. These are browser runtime values, not Supabase secret keys.

