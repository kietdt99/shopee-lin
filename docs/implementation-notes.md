# Implementation notes

## 2026-11-21

- Supabase project URL must be the project root URL, not the `/rest/v1/` endpoint.
- Use only the Supabase publishable key in the browser. Never use a secret key in this application.
- Historical Excel dates are mixed between text and spreadsheet date cells. Import needs a review step before data is marked final.
- The initial schema is already applied. Apply `supabase/migrations/20261121_allowlisted_profiles.sql` before either user first signs in.

