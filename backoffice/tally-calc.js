/* Browser copy of mask-backoffice-api/src/calc.js — KEEP IN SYNC. */
(function () {
/*
 * Trade Tally calculation rules (GRD broker hisaab).
 *
 *   Gross (C.F.)  = NSE gross before interest + loss carried forward
 *   Interest      = the higher of GRD's interest and the minimum interest
 *                   (minimum = (fund - deposit) x rate / 365, rounded, x interest days)
 *   NSE NET       = Gross (C.F.) - interest - greek - facility - technical
 *   NET           = NSE NET + BSE NET
 *   Payable       = (NET > 0 ? NET x trader % : NET) + salary carried forward + adjustment
 *   Incentive     = Payable - salary - salaries of linked accounts      (salaried traders)
 *   Prof. fees    = Payable - salaries of linked accounts               (no salary)
 *   Jayesh Mehta  = NET x (JM % - trader %)      when NET > 0
 *   MG            = NET x MG %                   when NET > 0
 * Next month: a loss (NET < 0) carries into gross; salaries paid while not in profit are
 * recovered from the next profitable month.
 */

const N = (v) => (v === null || v === undefined || v === "" || isNaN(+v) ? 0 : +v);
const r2 = (x) => Math.round(x * 100) / 100;
const blank = (v) => v === null || v === undefined || v === "";

/** interest actually charged: max(GRD interest, minimum); falls back to a typed interest on older rows */
function finalInterest(e) {
  if (blank(e.grd_interest) && blank(e.min_interest)) return N(e.interest);
  return Math.max(N(e.grd_interest), N(e.min_interest));
}

function computeEntry(e, trader, linkedSalary = 0) {
  const grossCf = N(e.gross) + N(e.loss_cf);
  const interest = e.legacy ? e.interest : finalInterest(e);
  const nse = e.legacy ? N(e.nse_net) : grossCf - N(interest) - N(e.greek) - N(e.facility) - N(e.technical);
  const net = nse + N(e.bse_net);
  const profit = net > 0;
  const payable = (profit ? (net * N(e.trader_pct)) / 100 : net) + N(e.salary_cf) + N(e.adjustment);
  const salary = N(e.salary);
  let incentive = 0, prof = 0;
  if (!(trader && trader.linked_to)) {
    if (salary > 0) incentive = payable - salary - linkedSalary;
    else prof = payable - linkedSalary;
  }
  return {
    ...e,
    interest: e.legacy ? e.interest : r2(N(interest)),
    nse_net: r2(nse),
    net_total: r2(net),
    payable: r2(payable),
    incentive: r2(incentive),
    prof_fees: r2(prof),
    jm_share: profit ? r2((net * (N(e.jm_pct) - N(e.trader_pct))) / 100) : 0,
    mg_share: profit ? r2((net * N(e.mg_pct)) / 100) : 0,
  };
}

/** entries: [{trader_id, ...inputs}], traders: {id: trader} */
function computeMonth(entries, traders) {
  const present = new Set(entries.map((e) => e.trader_id));
  const linked = {};
  for (const e of entries) {
    const t = traders[e.trader_id];
    if (t && t.linked_to && present.has(t.linked_to)) linked[t.linked_to] = (linked[t.linked_to] || 0) + N(e.salary);
  }
  return entries.map((e) => computeEntry(e, traders[e.trader_id], linked[e.trader_id] || 0));
}

/** carry-forward values for the next month from a computed entry */
function carryForward(prev, trader) {
  if (!prev) return { loss_cf: 0, salary_cf: 0 };
  const net = N(prev.net_total);
  if (net > 0) return { loss_cf: 0, salary_cf: 0 };
  const ownSalary = trader && trader.linked_to ? 0 : N(prev.salary);
  return { loss_cf: net < 0 ? r2(net) : 0, salary_cf: r2(N(prev.salary_cf) - ownSalary) };
}

function interestEstimate(trader, days) {
  const perDay = Math.round(((N(trader.fund) - N(trader.deposit)) * N(trader.interest_rate)) / 100 / 365);
  return perDay * N(days);
}
window.TallyCalc = { N: N, r2: r2, finalInterest: finalInterest, computeEntry: computeEntry, computeMonth: computeMonth, carryForward: carryForward, interestEstimate: interestEstimate };
})();
