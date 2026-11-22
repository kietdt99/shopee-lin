---
name: shopee-lin-frontend-ui
description: Implement and review ShopeeLin React UI, interaction, localization, and responsive behavior.
---

# Frontend/UI Skill

Frontend owns the user-visible product layer: interaction behavior, page/component states, information hierarchy, responsive layout, accessibility, UI copy, and client-side input handling. It does not own authorization or financial truth; it must rely on the database contract and surface any missing server guard to the Tech Lead.

## Before editing

Read `AGENTS.md`, `docs/product-spec.md`, `docs/decisions.md`, `docs/implementation-notes.md`, and `PLANS.md`. Inspect the current component and style patterns before adding abstractions.

## Rules

- Keep mobile-first layouts usable at 320–390 px and desktop layouts at 1280 px or wider.
- Main navigation labels use the product's requested Title Case. Use natural sentence casing for explanatory Vietnamese copy; do not mechanically capitalize every word.
- Keep the Shopee orange/white/neutral palette and the ShopeeLin identity.
- Never treat hidden controls as authorization; respect the database role/API contract.
- Preserve financial history. Never add hard-delete UI or direct delete calls. Deleted orders must follow the documented soft-delete/restore rules.
- VND amounts remain integer values; validate with safe integer checks and do not introduce floating-point math.
- Keep user-facing copy in Vietnamese unless a familiar technical term is clearer. Use explicit labels, empty states, disabled-state explanations, and accessible names for icon-only controls.
- Avoid exposing database IDs in the UI; format billing cycle labels for humans.
- Review all states for the changed flow: initial, loading, empty, success, validation error, API error, disabled, and retained/deleted history.
- For financial actions, validate UX inputs but assume clients are bypassable; request a server-side invariant for every money/status rule.
- Keep form values stable after server errors, prevent duplicate submits, and explain why an action is unavailable.
- Do not add a dependency, route, preference, or user-facing feature outside the assigned scope without Tech Lead agreement.

## Required review surface

- Product requirement and existing decision notes.
- React state/data-loading behavior, Supabase request shape, RPC/table contract, and error paths.
- Accessible labels, keyboard controls, focus/dialog behavior, target sizes, long text, Vietnamese copy, and mobile/desktop layout.
- Security assumptions: no role check in the UI may substitute for RLS; no secret or recovery token is persisted or logged.
- Regression risk to other roles/tabs, billing cycles, exports/print, and local-only login behavior.

## Handoff to Tech Lead

Return: user story/acceptance behavior addressed; files changed; API/RPC contract assumptions; responsive/accessibility checks; build result; Playwright cases needed; unresolved backend or product decisions. Report any mismatch as a finding with severity and reproduction evidence. Do not silently change database authorization or test files on a feature branch.

## Definition of done

- Include responsive states and keyboard/accessibility behavior in the implementation.
- State which interactions and breakpoints need Playwright coverage.
- Run `pnpm build` after source changes. Add/update Playwright tests only on a `test/...` branch.
- Report touched files, behavior changes, build result, and remaining backend prerequisites.
