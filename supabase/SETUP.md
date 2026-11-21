# Supabase setup

## 1. Apply the schema

Open **SQL Editor** in the Supabase dashboard, paste `schema.sql`, and run it once. This creates all application tables, the payment transaction function, and Row Level Security policies.

## 2. First sign-in creates users automatically

No dashboard user creation is needed. When these users first enter their email in the application, Supabase sends a passwordless magic link and the database trigger creates the correct role:

- Admin account
- Viewer test account (Gmail plus-alias, delivered to the Admin inbox)
- Viewer account

## 3. Configure Auth

- In **Authentication → URL Configuration**, add the local URL used for development and the final GitHub Pages URL as redirect URLs.
- The database allowlist rejects every other email address, even while Supabase sign-ups remain enabled for the two passwordless users.

## 4. Deploy variables

Create GitHub Actions repository variables named `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PAYEE_NAME`, `VITE_PAYEE_ACCOUNT`, and `VITE_PAYEE_BANK`. These are browser runtime values, not Supabase secret keys.

