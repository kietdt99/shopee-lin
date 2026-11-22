---
name: shopee-lin-database-security
description: Design and review ShopeeLin Postgres schema, migrations, RLS, RPC authorization, and financial concurrency.
---

# Database Security Skill

Database Security owns persisted truth and access control: schema, constraints, RLS, grants, triggers, SECURITY DEFINER RPCs, referential history, migrations, locking, and downgrade/operational risks. It must design for requests that bypass the UI.

## Before editing

Read `AGENTS.md`, `docs/product-spec.md`, `docs/decisions.md`, `docs/implementation-notes.md`, `docs/data-model.md`, and `PLANS.md`. Inspect the production/current schema and every migration that defines the affected object.

## Rules

- Treat `supabase/schema.sql` as the canonical fresh-install snapshot and provide an additive migration for existing installations.
- Never hard-delete application or financial history. Remove app-role DELETE/TRUNCATE grants, remove broad `FOR ALL` policies, prevent cascade deletion/detachment, and use reversible soft-delete or state transitions.
- Enforce Admin/Viewer permissions in RLS and SECURITY DEFINER RPCs; use a restricted `search_path`, validate `auth.uid()`, and explicitly revoke `PUBLIC`/`anon` execution.
- All VND values are integer `bigint`; validate positive amounts, allocations, and upper bounds in the database.
- Preserve immutable billing close snapshots. Serialize financial writes with cycle close/reopen using a documented, consistent lock order.
- Migrations must be rerunnable where practical, data-preserving, and safe against existing constraints/policies. Do not use `db reset` on an existing local database.
- Never run remote Supabase commands unless specifically assigned; never inspect or print secrets.
- For each business invariant, identify the enforcement point and privilege boundary (table constraint, trigger, RPC, RLS/grant, or a justified combination).
- Treat financial and close-history rows as append-only; account for FK cascades, service-role paths, and `TRUNCATE`, not only visible Delete buttons.
- Define global lock order for concurrent payment, cancellation, order edit, installment contribution, close, and reopen operations; avoid row-lock/advisory-lock inversion.
- Protect history when editing parent data: allocations must remain reconcilable, cycle snapshots must not become stale, and plan contributions must not exceed principal.
- Keep old RPC signatures/return types compatible unless a new migration intentionally replaces them and the client is updated in the same feature.
- Detect and report pre-existing data anomalies before adding `NOT NULL`, validated checks, or unique indexes. A migration must fail with diagnostic IDs/counts rather than silently rewriting financial history.

## Definition of done

- Describe schema changes, authorization paths, FK/trigger behavior, locking, and upgrade impact.
- Compare migration and canonical snapshot behavior.
- Validate SQL syntax/behavior with PostgreSQL when available; if unavailable, state that limitation rather than claiming it passed.
- Provide a safe verification query/QA scenario and note whether it was actually run.
- Handoff includes: invariant→enforcement map, roles/grants/RLS, affected existing rows, concurrency/lock order, migration ordering/idempotence, rollback/data-retention impact, exact verification commands, and unverified limitations.
- Report as a P1/P0 to the Tech Lead if an invariant is currently bypassable through authenticated REST/RPC or a migration can destroy/detach history. Do not apply or repair hosted data independently.
