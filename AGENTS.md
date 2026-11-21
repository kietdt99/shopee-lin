# Shopee Lin

Before changing application code, read `docs/product-spec.md`, `docs/decisions.md`, `docs/implementation-notes.md`, and `PLANS.md`.

## Working agreement

- Use `main` as the integration branch. Build one application feature on one `feature/...` branch. Test-only infrastructure and QA changes use a `test/...` branch.
- Production deploys only from immutable `release/vX.Y.Z` branches. Do not add features directly to a release branch.
- Do not commit `.env*` files containing real values, Supabase secrets, user credentials, or personal payment evidence.
- Money is stored and calculated as whole VND integers. Do not use floating point amounts.
- The app is mobile-first. Check narrow and desktop layouts for every UI change.
- Enforce roles in Supabase Row Level Security. Hiding an interface control is never authorization.

