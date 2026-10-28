import { writeFileSync } from "node:fs";
import { generate } from "../src/data";
import { reconcile, applyApproved, score } from "../src/reconcile";
const rows = [...Array(50)].map((_, i) => { const d = generate(i + 1); const b = reconcile(d); const s = score(b, d);
  const fixable = new Set(b.filter(x => x.proposedFix.action !== "escalate").map(x => x.id)); const after = reconcile(applyApproved(d, b, fixable, "eval", "t").data);
  return { seed: i + 1, ...s, residualAfterApprovingAll: after.length, escalations: b.length - fixable.size }; });
const sum = (k: string) => rows.reduce((a, r: any) => a + r[k], 0);
const out = { note: "SYNTHETIC CRM/custodian data, 50 seeds x 11 planted errors", planted: sum("planted"), found: sum("found"), tp: sum("tp"), precision: +(sum("tp") / sum("found")).toFixed(4), recall: +(sum("tp") / sum("planted")).toFixed(4), residualAfterApprove: sum("residualAfterApprovingAll"), escalations: sum("escalations"), misses: rows.flatMap(r => r.missed.map(m => `${r.seed}:${m}`)).slice(0, 10), fps: rows.flatMap(r => r.falsePositives.map(m => `${r.seed}:${m}`)).slice(0, 10) };
writeFileSync("reports/eval.json", JSON.stringify(out, null, 2)); console.log(JSON.stringify(out));
