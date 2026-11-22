# Shopee Lin

Before changing application code, read `docs/product-spec.md`, `docs/decisions.md`, `docs/implementation-notes.md`, and `PLANS.md`.

## Working agreement

- Use `main` as the integration branch. Build one application feature on one `feature/...` branch. Test-only infrastructure and QA changes use a `test/...` branch.
- Production deploys only from immutable `release/vX.Y.Z` branches. Do not add features directly to a release branch.
- Do not commit `.env*` files containing real values, Supabase secrets, user credentials, or personal payment evidence.
- Money is stored and calculated as whole VND integers. Do not use floating point amounts.
- The app is mobile-first. Check narrow and desktop layouts for every UI change.
- Enforce roles in Supabase Row Level Security. Hiding an interface control is never authorization.

## Agent skill playbooks

Before starting delegated work, read the matching reusable playbook in `.agents/skills/`:

- Frontend and interaction work: `.agents/skills/frontend-ui/SKILL.md`
- Database schema, RLS, RPC, migration, or data safety: `.agents/skills/database-security/SKILL.md`
- Workbook/import work: `.agents/skills/data-migration/SKILL.md`
- Tests, visual QA, and release verification: `.agents/skills/qa-playwright/SKILL.md`
- Lead integration and review: `.agents/skills/tech-lead-review/SKILL.md`

Agents use the same repository and shared tool permissions. A playbook is a repeatable workflow and definition of done, not a separate credential or an authorization grant. The Tech Lead reviews every diff, checks shared-file conflicts, and reports unverified external gates explicitly.

QA is responsible for end-to-end product quality: requirements, business logic, data integrity, security/RLS/Auth, migration safety, UI/responsive/accessibility, regression, and release readiness. QA reports findings with severity and evidence to the Tech Lead. The Tech Lead decides whether to fix directly, assign an implementation task, or ask the customer for a consolidated product decision.

