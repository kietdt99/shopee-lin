# ShopeeLin Agent Skills

These repository-local `SKILL.md` files are durable role playbooks. `AGENTS.md` maps work to a playbook; each delegated agent must read the relevant file before starting. They define process and quality standards, not separate model capabilities, credentials, or permission grants.

| Skill | Owns | Required handoff |
| --- | --- | --- |
| `frontend-ui` | User-visible behavior, UI state, copy, responsiveness, accessibility, client validation | Changed behavior, API assumptions, build result, breakpoints, tests needed, unresolved backend rules |
| `database-security` | Persisted invariants, RLS/grants, RPCs, constraints, locking, migration/data-retention safety | Invariant enforcement map, anomaly checks, lock order, upgrade impact, SQL verification evidence |
| `data-migration` | Source workbook interpretation, normalization, stable IDs, reconciliation, generated-data privacy | Sheet/row/totals report, assumptions/anomalies, idempotency, execution target and reconciliation evidence |
| `qa-playwright` | End-to-end quality across requirements, logic, data integrity, security, UI, regressions, and release | Severity-ranked findings with reproduction evidence, mocked/local/live scope, and required follow-ups |
| `tech-lead-review` | Scope, delegation, integration, prioritization, customer clarification, verified status | Reviewed branch/diff, updated backlog/decisions, tests and limitations, next step and customer action |

## Shared workflow

1. Tech Lead checks the dirty tree and requirements, then assigns bounded work and file ownership.
2. Specialist reads its skill and product/context docs, implements or audits only its assigned scope, and returns evidence plus unresolved questions.
3. QA checks the complete outcome across layers. Product findings go to Tech Lead; tests do not get weakened to hide failures.
4. Tech Lead reviews all changes, resolves conflicts, assigns fixes or asks the customer only for decisions that materially affect product behavior.
5. Feature branches merge to `main`; tests are maintained in `test/...`; production is cut only from immutable `release/vX.Y.Z` after verified gates.
