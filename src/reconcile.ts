import type { Dataset, PlantKind, CrmAccount } from "./data";
export interface Break { id: string; kind: PlantKind; account: string; symbol?: string; crm?: number; custodian?: number; impactCents: number; explanation: string; proposedFix: Fix; confidence: number }
export type Fix = { action: "set_crm_qty"; account: string; symbol: string; qty: number } | { action: "add_crm_position"; account: string; symbol: string; qty: number } | { action: "remove_crm_position"; account: string; symbol: string }
  | { action: "set_crm_cash"; account: string; cash: number } | { action: "rename_custodian_symbol"; account: string; from: string; to: string } | { action: "void_trade"; tradeId: string } | { action: "escalate"; reason: string };

const lev = (a: string, b: string) => { const d = [...Array(b.length + 1)].map((_, i) => i); for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; };
const usd = (c: number) => `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** Compares CRM (book of record) to custodian (source of truth for holdings) and the trade blotter. Pure; never mutates input. */
export function reconcile(d: Dataset): Break[] {
  const out: Break[] = []; const cust = new Map(d.custodian.map(c => [c.id, c])); const crm = new Map(d.crm.map(c => [c.id, c]));
  const add = (b: Omit<Break, "id">) => out.push({ id: `B${String(out.length + 1).padStart(3, "0")}`, ...b });
  for (const a of d.crm) {
    const c = cust.get(a.id);
    if (!c) { add({ kind: "missing_account", account: a.id, impactCents: a.cash + a.positions.reduce((s, p) => s + p.qty * (d.prices[p.symbol] ?? 0), 0), explanation: `${a.id} (${a.household}) is in the CRM but absent from the custodian feed. Could be a closed/transferred account or a feed gap; a human must confirm.`, proposedFix: { action: "escalate", reason: "account missing at custodian" }, confidence: 0.6 }); continue; }
    const cp = new Map(c.positions.map(p => [p.symbol, p.qty])); const ap = new Map(a.positions.map(p => [p.symbol, p.qty]));
    const unmatchedCust = c.positions.filter(p => !ap.has(p.symbol)); const unmatchedCrm = a.positions.filter(p => !cp.has(p.symbol));
    for (const u of [...unmatchedCust]) { const m = unmatchedCrm.find(x => x.qty === u.qty && lev(x.symbol, u.symbol) === 1);
      if (m) { unmatchedCust.splice(unmatchedCust.indexOf(u), 1); unmatchedCrm.splice(unmatchedCrm.indexOf(m), 1);
        add({ kind: "symbol_typo", account: a.id, symbol: m.symbol, crm: m.qty, custodian: u.qty, impactCents: 0, explanation: `Custodian shows "${u.symbol}" where the CRM has "${m.symbol}" with the identical quantity ${m.qty}; one-character difference, so this looks like a ticker typo in the feed, not a trade.`, proposedFix: { action: "rename_custodian_symbol", account: a.id, from: u.symbol, to: m.symbol }, confidence: 0.85 }); } }
    for (const p of a.positions) if (cp.has(p.symbol) && cp.get(p.symbol) !== p.qty) { const q = cp.get(p.symbol)!;
      add({ kind: "qty_mismatch", account: a.id, symbol: p.symbol, crm: p.qty, custodian: q, impactCents: (q - p.qty) * (d.prices[p.symbol] ?? 0), explanation: `${p.symbol}: CRM ${p.qty} vs custodian ${q} (${q - p.qty > 0 ? "+" : ""}${q - p.qty} shares, ${usd((q - p.qty) * (d.prices[p.symbol] ?? 0))}). Custodian is the source of truth for holdings.`, proposedFix: { action: "set_crm_qty", account: a.id, symbol: p.symbol, qty: q }, confidence: 0.9 }); }
    for (const p of unmatchedCrm) add({ kind: "missing_position", account: a.id, symbol: p.symbol, crm: p.qty, custodian: 0, impactCents: -p.qty * (d.prices[p.symbol] ?? 0), explanation: `${p.symbol} (${p.qty} sh) is in the CRM but not at the custodian; likely sold or transferred without a CRM update.`, proposedFix: { action: "remove_crm_position", account: a.id, symbol: p.symbol }, confidence: 0.75 });
    for (const p of unmatchedCust) add({ kind: "extra_position", account: a.id, symbol: p.symbol, crm: 0, custodian: p.qty, impactCents: p.qty * (d.prices[p.symbol] ?? 0), explanation: `Custodian holds ${p.qty} ${p.symbol} that the CRM does not record; likely a new buy or transfer-in not yet booked.`, proposedFix: { action: "add_crm_position", account: a.id, symbol: p.symbol, qty: p.qty }, confidence: 0.75 });
    if (c.cash !== a.cash) add({ kind: "cash_mismatch", account: a.id, crm: a.cash, custodian: c.cash, impactCents: c.cash - a.cash, explanation: `Cash: CRM ${usd(a.cash)} vs custodian ${usd(c.cash)} (difference ${usd(c.cash - a.cash)}).`, proposedFix: { action: "set_crm_cash", account: a.id, cash: c.cash }, confidence: Math.abs(c.cash - a.cash) > 100_000 ? 0.6 : 0.85 });
  }
  for (const c of d.custodian) if (!crm.has(c.id)) add({ kind: "orphan_account", account: c.id, impactCents: c.cash + c.positions.reduce((s, p) => s + p.qty * (d.prices[p.symbol] ?? 0), 0), explanation: `${c.id} is at the custodian but has no CRM record or household. Needs onboarding review before any change.`, proposedFix: { action: "escalate", reason: "unknown account at custodian" }, confidence: 0.6 });
  const seen = new Map<string, string>();
  for (const t of d.trades) { const k = `${t.account}|${t.symbol}|${t.qty}|${t.date}`; const prev = seen.get(k);
    if (prev) add({ kind: "duplicate_trade", account: t.account, symbol: t.symbol, impactCents: t.qty * (d.prices[t.symbol] ?? 0), explanation: `Trade ${t.id} duplicates ${prev} (same account, symbol, qty and date). Voiding it avoids a double booking.`, proposedFix: { action: "void_trade", tradeId: t.id }, confidence: 0.8 });
    else seen.set(k, t.id); }
  return out;
}

/** Applies ONLY approved fixes, returning a new dataset plus an audit log. Escalations never auto-apply. */
export function applyApproved(d: Dataset, breaks: Break[], approved: Set<string>, by: string, at: string) {
  const n: Dataset = structuredClone(d); const audit: { breakId: string; action: string; by: string; at: string; result: string }[] = [];
  const acct = (id: string) => n.crm.find(a => a.id === id) as CrmAccount;
  for (const b of breaks) { if (!approved.has(b.id)) continue; const f = b.proposedFix; let result = "applied";
    switch (f.action) {
      case "set_crm_qty": acct(f.account).positions.find(p => p.symbol === f.symbol)!.qty = f.qty; break;
      case "add_crm_position": acct(f.account).positions.push({ symbol: f.symbol, qty: f.qty }); break;
      case "remove_crm_position": { const a = acct(f.account); a.positions = a.positions.filter(p => p.symbol !== f.symbol); break; }
      case "set_crm_cash": acct(f.account).cash = f.cash; break;
      case "rename_custodian_symbol": n.custodian.find(c => c.id === f.account)!.positions.find(p => p.symbol === f.from)!.symbol = f.to; break;
      case "void_trade": n.trades = n.trades.filter(t => t.id !== f.tradeId); break;
      case "escalate": result = "escalated (no data change)"; break; }
    audit.push({ breakId: b.id, action: f.action, by, at, result }); }
  return { data: n, audit };
}

export function score(found: Break[], d: Dataset) {
  const key = (k: string, a: string, s?: string) => `${k}|${a}|${s ?? ""}`;
  const gold = new Set(d.planted.map(p => key(p.kind, p.account, p.symbol))); const got = new Set(found.map(b => key(b.kind, b.account, b.symbol)));
  const tp = [...got].filter(x => gold.has(x)).length;
  return { planted: gold.size, found: got.size, tp, precision: got.size ? tp / got.size : 1, recall: gold.size ? tp / gold.size : 1, missed: [...gold].filter(x => !got.has(x)), falsePositives: [...got].filter(x => !gold.has(x)) };
}
