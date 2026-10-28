import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { generate } from "../src/data";
import { reconcile, applyApproved, score } from "../src/reconcile";

describe("reconciliation", () => {
  it("finds every planted error with no false positives (seed 1)", () => { const d = generate(1); const s = score(reconcile(d), d); expect(s.recall).toBe(1); expect(s.precision).toBe(1); });
  it("clean books produce zero breaks", () => { const d = generate(5); const clean = { ...d, custodian: d.crm.map(a => ({ id: a.id, positions: a.positions.map(p => ({ ...p })), cash: a.cash })), trades: [], planted: [] }; expect(reconcile(clean)).toEqual([]); });
  it("every break has an explanation, a fix and confidence in (0,1]", () => { for (const b of reconcile(generate(2))) { expect(b.explanation.length).toBeGreaterThan(20); expect(b.confidence).toBeGreaterThan(0); expect(b.confidence).toBeLessThanOrEqual(1); } });
  it("ticker typo is classified as typo, not as a missing + extra position", () => { const d = generate(3); const b = reconcile(d); const p = d.planted.find(x => x.kind === "symbol_typo")!; expect(b.some(x => x.kind === "symbol_typo" && x.account === p.account)).toBe(true); expect(b.some(x => x.account === p.account && (x.kind === "missing_position" && x.symbol === p.symbol))).toBe(false); });
  it("missing/orphan accounts escalate, never auto-fix", () => { for (const b of reconcile(generate(4))) if (b.kind === "missing_account" || b.kind === "orphan_account") expect(b.proposedFix.action).toBe("escalate"); });
});

describe("approval gate", () => {
  it("nothing changes without approval", () => { const d = generate(6); const r = applyApproved(d, reconcile(d), new Set(), "u", "t"); expect(r.data).toEqual(d); expect(r.audit).toEqual([]); });
  it("does not mutate the input", () => { const d = generate(7); const snap = structuredClone(d); const b = reconcile(d); applyApproved(d, b, new Set(b.map(x => x.id)), "u", "t"); expect(d).toEqual(snap); });
  it("approving one break resolves exactly that break and logs it", () => { const d = generate(8); const b = reconcile(d); const t = b.find(x => x.kind === "qty_mismatch")!;
    const r = applyApproved(d, b, new Set([t.id]), "brandon", "2026-10-28T10:00"); const after = reconcile(r.data);
    expect(after.length).toBe(b.length - 1); expect(r.audit).toEqual([{ breakId: t.id, action: "set_crm_qty", by: "brandon", at: "2026-10-28T10:00", result: "applied" }]); });
  it("property: approving all fixable breaks leaves only escalations, for any seed", () => fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), seed => {
    const d = generate(seed); const b = reconcile(d); const ok = new Set(b.filter(x => x.proposedFix.action !== "escalate").map(x => x.id));
    const after = reconcile(applyApproved(d, b, ok, "p", "t").data); expect(after.every(x => x.proposedFix.action === "escalate")).toBe(true); expect(after.length).toBe(b.length - ok.size);
  }), { numRuns: 200 }));
  it("property: recall is 1 across seeds", () => fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), seed => { const d = generate(seed); expect(score(reconcile(d), d).recall).toBe(1); }), { numRuns: 200 }));
});
