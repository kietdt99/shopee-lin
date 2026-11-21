# Supabase setup

## 1. Apply the schema

Open **SQL Editor** in the Supabase dashboard, paste `schema.sql`, and run it once. This creates all application tables, the payment transaction function, and Row Level Security policies.

## 2. First-time account activation

No dashboard user creation is needed. On first use, each allowlisted user enters their email and chooses **Đặt password lần đầu**. Supabase sends one activation magic link; opening it in the same browser provisions the role through the database trigger and lets the user set a password. Routine sign-ins then use email/password and do not send email. Password recovery sends an email only when needed.

- Admin account
- Viewer test account (Gmail plus-alias, delivered to the Admin inbox)
- Viewer account

Default display names are **Bé Kịt Thần Kỳ**, **Tester Quèn**, and **Bé Lin Tốc Độ Cao**. Each user can edit their own display name from the profile header.

## 3. Configure Auth

- In **Authentication → URL Configuration**, add the local URL used for development and the final GitHub Pages URL as redirect URLs.
- The database allowlist rejects every other email address, even while Supabase sign-ups remain enabled for the three approved identities.
- To support Admin-assisted resets, set Auth **Email OTP expiration** to `300` seconds. This is a project-wide setting and also shortens activation, password recovery, and other Auth email links. The repository's `supabase/config.toml` declares this value; use the CLI config push command below and verify the diff before applying it.

## 4. Admin-assisted password recovery

For a provisioned Viewer account, Admin can generate a single-use recovery link from the app. Supabase generates the link without sending email; the Viewer opens it and chooses a new password. Treat the link as a bearer credential and share it privately. The five-minute expiry is only in effect after the global `300`-second Auth setting above has been applied.

Create a short-lived, project-scoped Supabase CLI profile with the permissions required by `config push` and Edge Function deploy: Auth config read/write plus project admin write; Edge Functions read/write; and the read access listed by `supabase config push --help` (database config/read/SSL/network, infra add-ons, Data API, Realtime, Storage, project and production branch read).

```powershell
$cli = ".\node_modules\.bin\supabase-cli\supabase.exe"
& $cli config diff --remote=wrcaejfcifbvmzcuukrd --profile shopee-admin-recovery
```

Inspect that diff and confirm the only Auth change is OTP expiry at 300 seconds. Then run these separately:

```powershell
& $cli config push --remote=wrcaejfcifbvmzcuukrd --profile shopee-admin-recovery --yes
```

```powershell
& $cli functions deploy admin-reset-password-link --remote=wrcaejfcifbvmzcuukrd --profile shopee-admin-recovery --use-api
```

Do not put a Supabase secret key in the browser or repository; the Edge Function uses Supabase's server-injected service-role environment variable.

## 5. Deploy variables

Create GitHub Actions repository variables named `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PAYEE_NAME`, `VITE_PAYEE_ACCOUNT`, and `VITE_PAYEE_BANK`. These are browser runtime values, not Supabase secret keys.

