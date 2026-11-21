# Supabase setup

## 1. Apply the schema

Open **SQL Editor** in the Supabase dashboard, paste `schema.sql`, and run it once. This creates all application tables, the payment transaction function, and Row Level Security policies.

## 2. First-time account activation

No dashboard user creation is needed. On first use, each allowlisted user enters their email and chooses **Đặt password lần đầu**. Supabase sends one activation magic link; opening it in the same browser provisions the role through the database trigger and lets the user set a password. Routine sign-ins then use email/password and do not send email. Password recovery sends an email only when needed.

- Admin account
- Viewer test account (Gmail plus-alias, delivered to the Admin inbox)
- Viewer account

## 3. Configure Auth

- In **Authentication → URL Configuration**, add the local URL used for development and the final GitHub Pages URL as redirect URLs.
- The database allowlist rejects every other email address, even while Supabase sign-ups remain enabled for the three approved identities.

## 4. Deploy variables

Create GitHub Actions repository variables named `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PAYEE_NAME`, `VITE_PAYEE_ACCOUNT`, and `VITE_PAYEE_BANK`. These are browser runtime values, not Supabase secret keys.

