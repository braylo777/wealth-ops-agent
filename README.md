# Wealth-Ops Agent: CRM ↔ Custodian Reconciliation

> **SYNTHETIC DATA ONLY.** Fictional households, accounts, prices and trades with deliberately planted errors. Not connected to any CRM, custodian or real client data.

An operations agent for a wealth-management back office. It reconciles the CRM (book of record) against the custodian feed (source of truth for holdings) and the trade blotter, explains every break in plain English with its dollar impact, proposes a fix, and **applies nothing until a human approves it**. Account-level breaks (missing or unknown accounts) can only be escalated, never auto-fixed. Every approval is written to an audit log.

**Live approval UI:** https://wealth-ops-agent.braylo777.workers.dev · eval: `/eval.json`

## Break types
quantity mismatch · position missing at custodian · extra position at custodian · cash mismatch · account missing at custodian (escalate) · orphan custodian account (escalate) · duplicate trade · ticker typo (one-character symbol difference with identical quantity, classified as a typo rather than a missing + extra pair).

## Results (synthetic)
`npm run eval`: 50 seeded books × 11 planted errors = 550 errors.

| Metric | Value |
| --- | --- |
| Recall | 550 / 550 (100%) |
| Precision | 550 / 550 (100%), 0 false positives |
| After approving every non-escalation fix | only the 100 escalations remain |

**Read these honestly:** detection is deterministic rules run against a generator I wrote, so perfect scores show the rules are correct for the error types modeled, not that they'd be perfect on a real custodian feed (corporate actions, pending settlement, fractional shares and pricing timing are not modeled yet).

## Safety design
- `reconcile()` is pure; `applyApproved()` returns a new dataset and never mutates input.
- Only approved break ids are applied; escalations change no data.
- Property tests (fast-check, 200 seeds each): recall stays at 1, and approving all fixable breaks leaves exactly the escalations.

## Develop
`npm ci && npm test` (10 tests) · `npm run build` → `dist/worker.js`. Deploys and rollback points: [DEPLOYS.md](DEPLOYS.md).
