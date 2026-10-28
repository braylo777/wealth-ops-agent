import { generate, Dataset } from "../src/data";
import { reconcile, applyApproved, score, Break } from "../src/reconcile";
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);
const usd = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let data: Dataset, breaks: Break[] = [], decided = new Map<string, "approve" | "reject">(), audit: any[] = [];
function load(seed: number) { data = generate(seed); breaks = reconcile(data); decided = new Map(); audit = []; render(); }
function render() {
  const s = score(breaks, data);
  $("sum").innerHTML = `${data.crm.length} CRM accounts · ${data.custodian.length} custodian accounts · ${data.trades.length} trades · <b>${breaks.length} breaks</b> (planted ${s.planted}; precision ${(s.precision * 100).toFixed(0)}%, recall ${(s.recall * 100).toFixed(0)}%)`;
  $("rows").innerHTML = breaks.map(b => { const d = decided.get(b.id);
    return `<tr class="${d ?? ""}"><td>${b.id}</td><td>${b.kind.replace(/_/g, " ")}</td><td>${b.account}${b.symbol ? " · " + b.symbol : ""}</td><td>${usd(b.impactCents)}</td><td>${esc(b.explanation)}<div class=muted>Proposed: <code>${esc(JSON.stringify(b.proposedFix))}</code> · confidence ${b.confidence}</div></td>
    <td>${d ? d + "d" : `<button data-a="approve" data-id="${b.id}">${b.proposedFix.action === "escalate" ? "Escalate" : "Approve"}</button> <button class=ghost data-a="reject" data-id="${b.id}">Reject</button>`}</td></tr>`; }).join("");
  $("audit").textContent = audit.length ? audit.map(a => `${a.at}  ${a.by}  ${a.breakId}  ${a.action}  ${a.result}`).join("\n") : "No changes applied yet. Nothing is written until you approve.";
}
document.addEventListener("click", e => { const t = e.target as HTMLElement; const id = t.dataset.id, a = t.dataset.a as any;
  if (id && a) { decided.set(id, a); if (a === "approve") { const r = applyApproved(data, breaks, new Set([id]), "reviewer", new Date().toISOString().slice(0, 19)); audit.push(...r.audit); data = r.data; } render(); } });
$("load").addEventListener("click", () => load(+(($("seed") as HTMLInputElement).value) || 1));
$("rerun").addEventListener("click", () => { const before = breaks.length; breaks = reconcile(data); decided = new Map(); render(); $("note").textContent = `Re-reconciled: ${before} → ${breaks.length} open breaks.`; });
load(1);
