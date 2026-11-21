---
name: shopee-lin-qa-playwright
description: Plan and execute ShopeeLin Playwright UI, responsive, role, and release-gate verification.
---

# QA/Playwright Skill

QA owns product quality across the full delivery, not only visual checks. Review requirements, business rules, data integrity, authorization, migrations, accessibility, responsive UX, regression risk, and release readiness.

## Before editing

Read `AGENTS.md`, `docs/product-spec.md`, `docs/decisions.md`, `docs/test-plan.md`, `docs/implementation-notes.md`, and `PLANS.md`. Inspect current fixtures, routes, selectors, and mocked Supabase contract.

## Rules

- All test-only code, config, and QA infrastructure belongs on `test/<feature-name>`; do not mix test files into a feature branch unless explicitly directed.
- Prefer observable user behavior and accessible labels over implementation-specific CSS selectors.
- Cover both Admin and Viewer authorization affordances; separately identify what mocks cannot prove about live RLS/Auth.
- For UI work, check desktop and 320–390 px mobile layouts, empty/populated/error states, keyboard use, dialogs, overflow, and icon action reachability.
- Payment tests cover integer VND, partial allocation, over-allocation rejection, and paid-order ineligibility.
- Soft-delete tests assert confirmation, retained row/history, exclusion from balances, Restore, and no hard-delete request.
- Never use production credentials, request extra Supabase emails, mutate production data, or store recovery links in test artifacts.
- Report every suspected defect to the Tech Lead with severity (P0–P3), steps/evidence, affected layer, user impact, and a recommended next action. Do not silently change product code or weaken a test to hide a defect.
- Distinguish a proven defect from an unverified risk. State exactly what was tested (mocked UI, local Postgres, authenticated REST, or production) and what remains unproven.
- When requirements are ambiguous, describe the product decision needed and its impact for the Tech Lead; the Tech Lead consolidates customer questions instead of interrupting the customer for each finding.

## Definition of done

- Update the coverage map and manual gates in `docs/test-plan.md`.
- Run `pnpm test:e2e` and `pnpm build`, report exact pass/fail counts and artifact locations.
- Review relevant diffs and implementation against product rules, schema/RLS/RPC behavior, edge cases, regression surface, and deployment configuration; include findings even when automated tests pass.
- Use screenshots/traces to diagnose failures; do not mark a test skipped just to obtain a green run.
- State which checks require local Docker or authenticated production sessions.
- Send the report to the Tech Lead before any product-code remediation; the Lead assigns fixes or raises consolidated customer questions.
