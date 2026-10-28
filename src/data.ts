// SYNTHETIC data only: fictional households, accounts and custodian feeds with planted errors.
export interface Position { symbol: string; qty: number }
export interface CrmAccount { id: string; household: string; owner: string; type: "IRA" | "Brokerage" | "Roth" | "Trust"; positions: Position[]; cash: number /* cents */ }
export interface CustodianAccount { id: string; positions: Position[]; cash: number }
export interface Trade { id: string; account: string; symbol: string; qty: number; date: string }
export type PlantKind = "qty_mismatch" | "missing_position" | "extra_position" | "cash_mismatch" | "missing_account" | "orphan_account" | "duplicate_trade" | "symbol_typo";
export interface Plant { kind: PlantKind; account: string; symbol?: string }
export interface Dataset { crm: CrmAccount[]; custodian: CustodianAccount[]; trades: Trade[]; prices: Record<string, number>; planted: Plant[] }

const SYMS = ["VTI", "VXUS", "BND", "AAPL", "MSFT", "NVDA", "SCHD", "VNQ", "TLT", "GLD", "QQQ", "IWM"];
const NAMES = ["Alvarez", "Brooks", "Chen", "Dubois", "Eze", "Fischer", "Garcia", "Haddad", "Ito", "Jensen", "Kowalski", "Larsen", "Mensah", "Novak", "Okafor", "Patel"];
export function generate(seed = 1, households = 16): Dataset {
  let s = seed >>> 0 || 1; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const crm: CrmAccount[] = [];
  for (let h = 0; h < households; h++) { const n = 1 + Math.floor(r() * 3);
    for (let a = 0; a < n; a++) { const syms = [...SYMS].sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 4));
      crm.push({ id: `ACC-${1000 + crm.length}`, household: `HH-${NAMES[h % NAMES.length]}`, owner: `${NAMES[h % NAMES.length]} (synthetic)`, type: pick(["IRA", "Brokerage", "Roth", "Trust"] as const), positions: syms.map(symbol => ({ symbol, qty: 10 + Math.floor(r() * 490) })), cash: Math.floor(r() * 5_000_000) }); } }
  const custodian: CustodianAccount[] = crm.map(a => ({ id: a.id, positions: a.positions.map(p => ({ ...p })), cash: a.cash }));
  const prices = Object.fromEntries(SYMS.map(x => [x, Math.round((20 + r() * 480) * 100)]));
  const trades: Trade[] = crm.slice(0, 10).map((a, i) => ({ id: `T-${i}`, account: a.id, symbol: a.positions[0].symbol, qty: 5, date: "2026-10-27" }));
  const planted: Plant[] = []; const used = new Set<string>();
  const target = () => { let a; do a = pick(custodian); while (used.has(a.id)); used.add(a.id); return a; };
  const kinds: PlantKind[] = ["qty_mismatch", "qty_mismatch", "qty_mismatch", "missing_position", "extra_position", "cash_mismatch", "cash_mismatch", "missing_account", "orphan_account", "duplicate_trade", "symbol_typo"].sort((a, b) => (a === "orphan_account" ? 1 : 0) - (b === "orphan_account" ? 1 : 0));
  for (const kind of kinds) {
    if (kind === "orphan_account") { const id = `ACC-9${String(Math.floor(r() * 900)).padStart(3, "0")}`; custodian.push({ id, positions: [{ symbol: "VTI", qty: 12 }], cash: 0 }); planted.push({ kind, account: id }); continue; }
    if (kind === "duplicate_trade") { const t = pick(trades); trades.push({ ...t, id: t.id + "-dup" }); planted.push({ kind, account: t.account, symbol: t.symbol }); continue; }
    const c = target();
    if (kind === "missing_account") { custodian.splice(custodian.indexOf(c), 1); planted.push({ kind, account: c.id }); continue; }
    if (kind === "cash_mismatch") { c.cash += (r() < 0.5 ? -1 : 1) * (5_000 + Math.floor(r() * 200_000)); planted.push({ kind, account: c.id }); continue; }
    if (kind === "extra_position") { const sym = SYMS.find(x => !c.positions.some(p => p.symbol === x))!; c.positions.push({ symbol: sym, qty: 7 }); planted.push({ kind, account: c.id, symbol: sym }); continue; }
    const p = pick(c.positions);
    if (kind === "qty_mismatch") { p.qty += (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 40)); planted.push({ kind, account: c.id, symbol: p.symbol }); }
    if (kind === "missing_position") { c.positions.splice(c.positions.indexOf(p), 1); planted.push({ kind, account: c.id, symbol: p.symbol }); }
    if (kind === "symbol_typo") { const orig = p.symbol; p.symbol = orig.slice(0, -1) + (orig.endsWith("X") ? "Y" : "X"); planted.push({ kind, account: c.id, symbol: orig }); }
  }
  return { crm, custodian, trades, prices, planted };
}
