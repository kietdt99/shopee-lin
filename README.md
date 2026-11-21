# Shopee Lin

Private two-person tracker for Shopee spending, debt settlement, and the S25 Ultra installment plan.

## Stack

- React, TypeScript, Vite and CSS
- Supabase Auth and Postgres with Row Level Security
- GitHub Pages deployment from `release/v*`

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run `npm install` then `npm run dev`.

## Branches

- `feature/...`: one implementation scope
- `main`: reviewed integration branch
- `release/vX.Y.Z`: production deployment branch, tagged after deployment

