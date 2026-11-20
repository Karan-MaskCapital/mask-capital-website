/* Trade Tally: Traders (cards), Trader ledger (one trader, every month), Ledger (everyone, every month)
 * and the Overview dashboard. Data comes from GET /api/tally/ledger. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function BO() { return window.BO; }
  function esc(s) { return BO().esc(s); }
  function isAdmin() { var m = BO().me(); return m && m.role === "admin"; }
  function N(v) { return v === null || v === undefined || v === "" || isNaN(+v) ? 0 : +v; }
  function has(v) { return v !== null && v !== undefined && v !== "" && !isNaN(+v); }
  function r2(x) { return Math.round(x * 100) / 100; }

  var MS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var ML = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function mLabel(m, long) { var p = String(m).split("-"); return (long ? ML : MS)[+p[1] - 1] + " " + p[0]; }
  function nextMonth(m) { var p = m.split("-").map(Number); p[1]++; if (p[1] > 12) { p[1] = 1; p[0]++; } return p[0] + "-" + String(p[1]).padStart(2, "0"); }
  function fmt(v) {
    if (!has(v)) return "–";
    var n = +v;
    return n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function money(v) { return has(v) ? '<span class="' + (+v < 0 ? "tt-neg" : "") + '">' + fmt(v) + "</span>" : '<span class="tt-dim">–</span>'; }
  /** short Indian format for cards: 1.24 Cr, 4.5 L */
  function short(v) {
    if (!has(v)) return "–";
    var n = +v, a = Math.abs(n), s = n < 0 ? "−" : "";
    if (a >= 1e7) return s + (a / 1e7).toFixed(2).replace(/\.?0+$/, "") + " Cr";
    if (a >= 1e5) return s + (a / 1e5).toFixed(2).replace(/\.?0+$/, "") + " L";
    return s + Math.round(a).toLocaleString("en-IN");
  }
  function incentive(e) { return e.linked_to ? null : N(e.salary) > 0 ? e.incentive : has(e.prof_fees) ? e.prof_fees : e.payable; }
  /** cash still to tick: final months done in the back office (imported sheet history is not tracked) */
  function pendingCash(e) { return e.status === "final" && !e.cash_received && !e.legacy && N(e.payable) !== 0; }
  function costs(e) { return N(e.greek) + N(e.facility) + N(e.technical); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("mask_bo_" + k) || "null"); localStorage.setItem("mask_bo_" + k, JSON.stringify(v)); } catch (e) { return null; } }

  /* ---------------------------------------------------------------- data */
  var D = null;
  function load(force) {
    if (D && !force) return Promise.resolve(D);
    return BO().api("GET", "/api/tally/ledger").then(function (j) {
      j.byTrader = {};
      j.traders.forEach(function (t) { j.byTrader[t.id] = t; t.entries = []; t.licenceList = []; t.accountList = []; });
      j.entries.forEach(function (e) { var t = j.byTrader[e.trader_id]; if (t) t.entries.push(e); });
      j.licences.forEach(function (l) { var t = j.byTrader[l.trader_id]; if (t) t.licenceList.push(l); });
      j.accounts.forEach(function (a) { var t = j.byTrader[a.trader_id]; if (t) t.accountList.push(a); });
      (j.exits || []).forEach(function (x) { var t = j.byTrader[x.trader_id]; if (t && !t.exit && !x.reopened_at) t.exit = x; });
      j.months = []; var seen = {};
      j.entries.forEach(function (e) { if (!seen[e.month]) { seen[e.month] = 1; j.months.push(e.month); } });
      D = j; return j;
    });
  }

  /** the latest month with real figures: final, or a draft where the gross has been entered */
  function latestOf(t) { return t.entries.filter(function (e) { return e.status === "final" || has(e.gross); })[0] || null; }
  function settled(t) { var l = latestOf(t); return l ? t.entries.slice(t.entries.indexOf(l)) : []; }
  function carry(t) {
    var e = latestOf(t);
    if (!e) return null;
    var net = N(e.net_total);
    if (net > 0) return { month: e.month, loss: 0, salary: 0 };
    return { month: e.month, loss: net < 0 ? net : 0, salary: r2(N(e.salary_cf) - (t.linked_to ? 0 : N(e.salary))) };
  }

  /** inline bar chart of monthly NET (oldest → newest) */
  function bars(entries, w, h, opts) {
    opts = opts || {};
    var list = entries.slice(0, opts.max || 12).reverse();
    if (!list.length) return "";
    var vals = list.map(function (e) { return N(e.net_total); });
    var max = Math.max.apply(null, vals.map(Math.abs).concat([1]));
    var hasNeg = vals.some(function (v) { return v < 0; }), hasPos = vals.some(function (v) { return v > 0; });
    var zero = hasNeg && hasPos ? h / 2 : hasNeg ? 2 : h - 2;
    var scale = (hasNeg && hasPos ? h / 2 - 2 : h - 4) / max;
    var slots = Math.max(list.length, opts.max || 12), off = slots - list.length;
    var bw = w / slots, gap = Math.max(1, bw * 0.22);
    var out = '<svg class="ld-bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" aria-label="Monthly NET, last ' + list.length + ' months">';
    out += '<line x1="0" x2="' + w + '" y1="' + zero + '" y2="' + zero + '" class="ld-bars__zero"/>';
    list.forEach(function (e, i) {
      var v = vals[i], bh = Math.max(Math.abs(v) * scale, v ? 1.5 : 0);
      var y = v >= 0 ? zero - bh : zero;
      out += '<rect x="' + ((i + off) * bw + gap / 2).toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + (bw - gap).toFixed(2) + '" height="' + bh.toFixed(2) + '" class="' + (v < 0 ? "is-neg" : "is-pos") + '"' +
        (opts.click ? ' data-month="' + e.month + '"' : "") + "><title>" + mLabel(e.month) + ": NET " + fmt(v) + "</title></rect>";
    });
    return out + "</svg>";
  }

  /* ---------------------------------------------------------------- Traders (cards) */
  var tf = { q: "", inactive: false };
  function openTraders(force) {
    var box = $("ldCards");
    if (!D) box.innerHTML = '<p class="tt-dim">Loading…</p>';
    load(force).then(renderTraders).catch(function (err) { box.innerHTML = '<p class="tt-neg">' + esc(err.message) + "</p>"; });
  }
  function renderTraders() {
    var list = D.traders.filter(function (t) {
      if (!tf.inactive && !t.active) return false;
      if (tf.q && (t.name + " " + (t.aliases || "")).toLowerCase().indexOf(tf.q.toLowerCase()) < 0) return false;
      return true;
    });
    var off = D.traders.filter(function (t) { return !t.active; }).length;
    $("ldInactive").textContent = tf.inactive ? "Hide former traders" : "Show former traders (" + off + ")";
    $("ldAdd").hidden = !isAdmin();
    $("ldCards").innerHTML = list.map(card).join("") || '<div class="bo-empty">No traders match.</div>';
  }
  function card(t) {
    var e = latestOf(t), cf = carry(t);
    var life = t.entries.reduce(function (a, x) { a.net += N(x.net_total); a.pay += N(x.payable); return a; }, { net: 0, pay: 0 });
    var linked = t.linked_to && D.byTrader[t.linked_to];
    var cfTxt = !cf ? "No months yet"
      : (cf.loss || cf.salary) ? [cf.loss ? "loss " + fmt(cf.loss) : "", cf.salary ? "salary " + fmt(cf.salary) : ""].filter(Boolean).join(" · ")
      : "Nothing";
    return '<article class="ld-card' + (t.active ? "" : " is-off") + '" data-trader="' + t.id + '" tabindex="0" role="button" aria-label="Open ' + esc(t.name) + ' ledger">' +
      '<header class="ld-card__head"><div><h3 class="ld-card__name">' + esc(t.name) + "</h3>" +
        '<p class="ld-card__sub">' + (t.accountList.length ? t.accountList.map(function (a) { return esc(a.code); }).join(" · ") : esc(t.aliases || "")) + "</p></div>" +
        (t.active ? "" : '<span class="bo-pill bo-pill--off">Former</span>') + "</header>" +
      '<dl class="ld-kv">' +
        kv("Share", fmt(t.payout_pct) + "%") +
        kv("Salary", linked ? '<span title="Deducted from ' + esc(linked.name) + '">' + fmt(t.salary) + " ↗</span>" : N(t.salary) ? fmt(t.salary) : "Fees") +
        kv("Fund", short(t.fund)) +
        kv("Deposit", short(t.deposit)) +
      "</dl>" +
      (e ? '<div class="ld-card__latest"><span class="ld-card__lbl">' + mLabel(e.month) + (e.status === "draft" ? " · draft" : "") + "</span>" +
        '<div class="ld-card__nums"><span>NET <strong>' + money(e.net_total) + '</strong></span><span>Payable <strong>' + money(e.payable) + "</strong></span></div></div>" : "") +
      '<div class="ld-card__chart">' + bars(settled(t), 240, 46) + "</div>" +
      (!t.active && t.exit ? '<footer class="ld-card__foot"><span><span class="ld-card__lbl">Closed</span> ' + (t.exit.left_month ? esc(mLabel(t.exit.left_month)) : "") + "</span>" +
        (t.exit.settled ? '<span class="bo-pill">Settled</span>' : '<span class="bo-pill bo-pill--warn">Settlement open</span>') + "</footer>" : "") +
      '<footer class="ld-card__foot"><span><span class="ld-card__lbl">' + (t.active ? "Carries forward" : "Left with") + "</span> " + (cfTxt === "Nothing" ? '<span class="tt-dim">nothing</span>' : '<span class="tt-neg">' + esc(cfTxt) + "</span>") + "</span>" +
        '<span><span class="ld-card__lbl">' + t.entries.length + " months</span> NET " + esc(short(life.net)) + "</span></footer>" +
      "</article>";
  }
  function kv(k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + v + "</dd></div>"; }

  $("ldCards").addEventListener("click", function (e) { var c = e.target.closest("[data-trader]"); if (c) go("trader:" + c.getAttribute("data-trader")); });
  $("ldCards").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-trader]")) { e.preventDefault(); go("trader:" + e.target.getAttribute("data-trader")); } });
  $("ldSearch").addEventListener("input", function () { tf.q = this.value.trim(); renderTraders(); });
  $("ldInactive").addEventListener("click", function () { tf.inactive = !tf.inactive; renderTraders(); });

  /* ---------------------------------------------------------------- one trader */
  var cur = { id: null, year: "all" };
  function openTrader(id) {
    cur.id = +id; cur.year = "all";
    $("ldtBody").innerHTML = '<tr><td colspan="15">Loading…</td></tr>';
    $("ldtName").textContent = ""; $("ldtStats").innerHTML = ""; $("ldtChart").innerHTML = "";
    load().then(renderTrader).catch(function (err) { $("ldtBody").innerHTML = '<tr><td colspan="15">' + esc(err.message) + "</td></tr>"; });
  }
  function renderTrader() {
    var t = D.byTrader[cur.id];
    if (!t) { $("ldtBody").innerHTML = '<tr><td colspan="15">Trader not found.</td></tr>'; return; }
    var linked = t.linked_to && D.byTrader[t.linked_to];
    var perDay = Math.round((N(t.fund) - N(t.deposit)) * N(t.interest_rate) / 100 / 365);
    $("ldtName").textContent = t.name;
    $("ldtMeta").innerHTML = (t.active ? '<span class="bo-pill">Active</span>' : '<span class="bo-pill bo-pill--off">Former trader</span>') +
      "<span>Trader " + fmt(t.payout_pct) + "%</span>" +
      "<span>" + (N(t.salary) ? "Salary " + fmt(t.salary) : "Professional fees, no salary") + (linked ? " · deducted from " + esc(linked.name) : "") + "</span>" +
      (N(t.fund) ? "<span>Fund " + fmt(t.fund) + " · Deposit " + fmt(t.deposit) + " · " + fmt(t.interest_rate) + "% · min. " + fmt(perDay) + "/day" + (t.min_interest ? "" : " (off)") + "</span>" : "");
    $("ldtChips").innerHTML =
      t.accountList.map(function (a) { return '<span class="st-chip" title="' + esc((a.holder ? "Held by " + a.holder + " · " : "") + (a.exchange || "")) + '">' + esc(a.code) + "</span>"; }).join("") +
      t.licenceList.map(function (l) { return '<span class="st-chip ld-chip--lic">' + esc(l.name) + "</span>"; }).join("");
    $("ldtEdit").hidden = !isAdmin();
    $("ldtClose").hidden = !isAdmin() || !t.active;
    $("ldtContact").innerHTML = contactHtml(t);
    $("ldtExit").innerHTML = window.BOPeople ? window.BOPeople.exitPanel(t) : "";

    var years = []; t.entries.forEach(function (e) { var y = e.month.slice(0, 4); if (years.indexOf(y) < 0) years.push(y); });
    $("ldtYears").innerHTML = ["all"].concat(years).map(function (y) {
      return '<button type="button" data-year="' + y + '" class="' + (cur.year === y ? "is-active" : "") + '">' + (y === "all" ? "All years" : y) + "</button>";
    }).join("");
    renderTraderRows();
  }
  function traderRows() {
    var t = D.byTrader[cur.id];
    return t.entries.filter(function (e) { return cur.year === "all" || e.month.slice(0, 4) === cur.year; });
  }
  function renderTraderRows() {
    var t = D.byTrader[cur.id], rows = traderRows();
    var s = sum(rows);
    var latest = rows[0];
    $("ldtStats").innerHTML =
      stat("Months", String(rows.length), rows.length ? mLabel(rows[rows.length - 1].month) + " – " + mLabel(rows[0].month) : "") +
      stat("NET", short(s.net), "after interest and costs", s.net < 0) +
      stat("Paid to trader", short(s.payable), "total payable") +
      stat(N(t.salary) || s.salary ? "Salary · incentive" : "Professional fees", N(t.salary) || s.salary ? short(s.salary) + " · " + short(s.inc) : short(s.inc), "") +
      stat("Jayesh Mehta", short(s.jm), "MG " + short(s.mg)) +
      (latest ? stat(t.active ? "Carries forward" : "Left with", (function () { var c = carry(t); return c && (c.loss || c.salary) ? short(c.loss + c.salary) : "Nothing"; })(), t.active ? "into the next month" : "loss + unrecovered salary") : "");
    $("ldtChart").innerHTML = rows.length > 1 ? '<div class="ld-chart__h"><span>Monthly NET</span><span class="tt-dim">' + (rows.length > 36 ? "last 36 months · " : "") + "hover a bar for the figure, click to open the month</span></div>" + bars(rows, 900, 120, { max: 36, click: true }) : "";
    $("ldtBody").innerHTML = rows.map(function (e) {
      return '<tr class="tt-click" data-month="' + e.month + '">' +
        "<td><strong>" + mLabel(e.month) + "</strong>" + (e.status === "draft" ? ' <span class="bo-pill bo-pill--warn">Draft</span>' : "") + (e.note ? ' <span class="tt-note" title="' + esc(e.note) + '">✎</span>' : "") + "</td>" +
        num(e.gross) + num(e.loss_cf) + num(e.interest) + num(costs(e) || null) + num(e.bse_net) +
        '<td class="num"><strong>' + money(e.net_total) + "</strong></td>" +
        '<td class="num">' + (has(e.trader_pct) ? fmt(e.trader_pct) + "%" : "–") + "</td>" +
        num(e.salary_cf) + '<td class="num"><strong>' + money(e.payable) + "</strong></td>" + num(e.salary) + num(incentive(e)) + num(e.jm_share) +
        '<td class="ld-c">' + cashBox(e) + "</td>" +
        '<td class="tt-noprint"><button type="button" class="ld-ic" data-pdf="' + e.month + '" title="Download ' + esc(mLabel(e.month)) + ' trader sheet (PDF)" aria-label="Download trader sheet">PDF</button></td></tr>';
    }).join("") || '<tr><td colspan="15">No months yet.</td></tr>';
    $("ldtFoot").innerHTML = rows.length ? "<tr><td>Total</td>" + num(s.gross) + num(s.loss) + num(s.interest) + num(s.costs) + num(s.bse) + num(s.net) + "<td></td>" + "<td></td>" + num(s.payable) + num(s.salary) + num(s.inc) + num(s.jm) + "<td></td><td></td></tr>" : "";
  }
  function contactHtml(t) {
    var bits = [];
    if (t.joined_month) bits.push("Joined " + esc(mLabel(t.joined_month)));
    if (t.phone) bits.push('<a href="tel:' + esc(t.phone) + '">' + esc(t.phone) + "</a>");
    if (t.email) bits.push('<a href="mailto:' + esc(t.email) + '">' + esc(t.email) + "</a>");
    if (t.pan) bits.push("PAN " + esc(t.pan));
    if (t.bank_account) bits.push(esc((t.bank_name ? t.bank_name + " " : "") + "a/c " + t.bank_account + (t.bank_ifsc ? " · " + t.bank_ifsc : "")));
    return bits.length ? bits.map(function (b) { return "<span>" + b + "</span>"; }).join("") : (isAdmin() ? '<span class="tt-dim">No contact or bank details yet. </span><button type="button" class="bo-link" data-go-setup="contact">Add them</button>' : "");
  }
  function num(v) { return '<td class="num">' + money(v) + "</td>"; }
  function stat(k, v, sub, neg) { return '<div class="tt-stat"><span class="tt-stat__k">' + esc(k) + '</span><span class="tt-stat__v' + (neg ? " tt-neg" : "") + '">' + esc(v) + '</span><span class="tt-stat__s">' + esc(sub || "") + "</span></div>"; }
  function sum(rows) {
    return rows.reduce(function (a, e) {
      a.gross += N(e.gross); a.loss += N(e.loss_cf); a.interest += N(e.interest); a.costs += costs(e); a.bse += N(e.bse_net);
      a.net += N(e.net_total); a.payable += N(e.payable); a.salary += N(e.salary); a.inc += N(incentive(e)); a.jm += N(e.jm_share); a.mg += N(e.mg_share);
      if (pendingCash(e)) a.pending++;
      return a;
    }, { gross: 0, loss: 0, interest: 0, costs: 0, bse: 0, net: 0, payable: 0, salary: 0, inc: 0, jm: 0, mg: 0, pending: 0 });
  }
  function cashBox(e) {
    var dis = e.status !== "final";
    return '<label class="tt-cash"><input type="checkbox" data-cash="' + e.month + ":" + e.trader_id + '"' + (e.cash_received ? " checked" : "") + (dis ? ' disabled title="Finalise the month first"' : "") +
      '><span class="sr-only">Cash received</span></label>';
  }

  $("ldtYears").addEventListener("click", function (e) { var b = e.target.closest("[data-year]"); if (!b) return; cur.year = b.getAttribute("data-year"); renderTrader(); });
  $("ldtBody").addEventListener("click", function (e) {
    if (e.target.closest("label, input")) return;
    var p = e.target.closest("[data-pdf]");
    if (p) { traderPdf(cur.id, p.getAttribute("data-pdf")); return; }
    var tr = e.target.closest("tr[data-month]"); if (tr) go(tr.getAttribute("data-month"));
  });
  $("ldtChart").addEventListener("click", function (e) { var r = e.target.closest("[data-month]"); if (r) go(r.getAttribute("data-month")); });
  $("ldtBody").addEventListener("change", onCash);
  $("ldtEdit").addEventListener("click", function () { go("setup:traders"); });
  $("ldtClose").addEventListener("click", function () { go("close:" + cur.id); });
  $("ldtContact").addEventListener("click", function (e) { if (e.target.closest("[data-go-setup]")) go("setup:contact"); });
  $("ldAdd").addEventListener("click", function () { go("new-trader"); });
  $("ldtCsv").addEventListener("click", function () { var t = D.byTrader[cur.id]; csv(traderRows(), t.name + (cur.year === "all" ? "" : " " + cur.year), true); });
  $("ldtPdf").addEventListener("click", function () { var t = D.byTrader[cur.id]; ledgerPdf(traderRows(), t.name + " - Ledger" + (cur.year === "all" ? "" : " " + cur.year), true, $("ldtStatus")); });

  function traderPdf(id, month) {
    var e = D.byTrader[id].entries.filter(function (x) { return x.month === month; })[0];
    BO().status($("ldtStatus"), "Preparing PDF…");
    window.BOPdf.trader(e, { month: month, status: e.status })
      .then(function (n) { BO().status($("ldtStatus"), "Downloaded " + n + ".", "ok"); })
      .catch(function (err) { BO().status($("ldtStatus"), err.message, "err"); });
  }

  function onCash(e) {
    var el = e.target; if (!el.hasAttribute("data-cash")) return;
    var p = el.getAttribute("data-cash").split(":"), month = p[0], id = +p[1], val = el.checked;
    var st = el.closest("#ldtBody") ? $("ldtStatus") : $("ldStatus");
    BO().api("POST", "/api/tally/months/" + month + "/cash", { trader_id: id, cash_received: val })
      .then(function () {
        D.entries.forEach(function (x) { if (x.month === month && x.trader_id === id) x.cash_received = val ? 1 : 0; });
        BO().status(st, "Cash " + (val ? "marked received" : "unmarked") + " for " + D.byTrader[id].name + ", " + mLabel(month) + ".", "ok");
        if (st === $("ldStatus")) renderLedger();
      })
      .catch(function (err) { el.checked = !val; BO().status(st, err.message, "err"); });
  }

  /* ---------------------------------------------------------------- full ledger */
  var lf = store("ledger") || { trader: "", from: "", to: "", cash: "", status: "", group: "month" };
  function openLedger(force) {
    $("ldBody").innerHTML = '<tr><td colspan="13">Loading…</td></tr>';
    load(force).then(function () {
      var sel = $("lfTrader");
      sel.innerHTML = '<option value="">All traders</option>' + D.traders.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + (t.active ? "" : " (former)") + "</option>"; }).join("");
      ["trader", "from", "to", "cash", "status", "group"].forEach(function (k) { $("lf" + k[0].toUpperCase() + k.slice(1)).value = lf[k] || ""; });
      if (!lf.group) $("lfGroup").value = "month";
      renderLedger();
    }).catch(function (err) { $("ldBody").innerHTML = '<tr><td colspan="13">' + esc(err.message) + "</td></tr>"; });
  }
  function ledgerRows() {
    return D.entries.filter(function (e) {
      if (lf.trader && String(e.trader_id) !== String(lf.trader)) return false;
      if (lf.from && e.month < lf.from) return false;
      if (lf.to && e.month > lf.to) return false;
      if (lf.cash === "pending" && !pendingCash(e)) return false;
      if (lf.cash === "received" && !e.cash_received) return false;
      if (lf.status && e.status !== lf.status) return false;
      return true;
    });
  }
  function renderLedger() {
    var rows = ledgerRows(), s = sum(rows), group = lf.group || "month";
    var parts = [];
    parts.push(rows.length + " row" + (rows.length === 1 ? "" : "s"));
    $("ldSummary").innerHTML =
      chip("Rows", String(rows.length)) + chip("NET", money(r2(s.net))) + chip("Payable to traders", money(r2(s.payable))) +
      chip("Jayesh Mehta", money(r2(s.jm))) + chip("MG", money(r2(s.mg))) + chip("Cash still to tick", String(s.pending));
    var sorted = rows.slice();
    if (group === "trader") sorted.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : a.month < b.month ? 1 : -1; });
    var html = "", key = null, bucket = [];
    function flush() {
      if (!bucket.length || group === "none") return;
      var t = sum(bucket);
      html += '<tr class="ld-sub"><td colspan="2">' + esc(group === "month" ? mLabel(key, true) + " total" : D.byTrader[bucket[0].trader_id].name + " total") + "</td>" +
        num(r2(t.gross)) + num(r2(t.interest)) + num(r2(t.costs)) + num(r2(t.net)) + num(r2(t.payable)) + num(r2(t.salary)) + num(r2(t.inc)) + num(r2(t.jm)) + num(r2(t.mg)) + "<td></td></tr>";
    }
    sorted.forEach(function (e) {
      var k = group === "month" ? e.month : group === "trader" ? e.trader_id : null;
      if (group !== "none" && k !== key) { flush(); key = k; bucket = []; html += '<tr class="ld-group"><td colspan="13">' + (group === "month" ? '<button type="button" class="bo-link" data-open="' + e.month + '">' + mLabel(e.month, true) + "</button>" + (e.status === "draft" ? ' <span class="bo-pill bo-pill--warn">Draft</span>' : "") : '<button type="button" class="bo-link" data-open="trader:' + e.trader_id + '">' + esc(e.name) + "</button>") + "</td></tr>"; }
      bucket.push(e);
      html += "<tr>" +
        '<td><button type="button" class="ld-a" data-open="' + e.month + '">' + mLabel(e.month) + "</button></td>" +
        '<td><button type="button" class="ld-a" data-open="trader:' + e.trader_id + '">' + esc(e.name) + "</button>" + (e.note ? ' <span class="tt-note" title="' + esc(e.note) + '">✎</span>' : "") + "</td>" +
        num(e.gross) + num(e.interest) + num(costs(e) || null) +
        '<td class="num"><strong>' + money(e.net_total) + "</strong></td>" +
        '<td class="num"><strong>' + money(e.payable) + "</strong></td>" +
        num(e.salary) + num(incentive(e)) + num(e.jm_share) + num(e.mg_share) +
        '<td class="ld-c">' + cashBox(e) + "</td></tr>";
    });
    flush();
    $("ldBody").innerHTML = html || '<tr><td colspan="13"><div class="bo-empty">Nothing matches these filters.</div></td></tr>';
    $("ldFoot").innerHTML = rows.length ? '<tr><td colspan="2">Total</td>' + num(r2(s.gross)) + num(r2(s.interest)) + num(r2(s.costs)) + num(r2(s.net)) + num(r2(s.payable)) + num(r2(s.salary)) + num(r2(s.inc)) + num(r2(s.jm)) + num(r2(s.mg)) + "<td></td></tr>" : "";
  }
  function chip(k, v) { return '<div class="ld-sum"><span>' + esc(k) + "</span><strong>" + v + "</strong></div>"; }

  ["Trader", "From", "To", "Cash", "Status", "Group"].forEach(function (k) {
    $("lf" + k).addEventListener("change", function () { lf[k.toLowerCase()] = this.value; store("ledger", lf); renderLedger(); });
  });
  $("lfReset").addEventListener("click", function () {
    lf = { trader: "", from: "", to: "", cash: "", status: "", group: "month" }; store("ledger", lf);
    ["Trader", "From", "To", "Cash", "Status"].forEach(function (k) { $("lf" + k).value = ""; }); $("lfGroup").value = "month";
    renderLedger();
  });
  $("lfQuick").addEventListener("click", function (e) {
    var b = e.target.closest("[data-q]"); if (!b) return;
    var q = b.getAttribute("data-q"), latest = D.months[0] || "";
    lf.from = lf.to = ""; lf.cash = "";
    if (q === "latest") lf.from = lf.to = latest;
    if (q === "fy") { var y = +latest.slice(0, 4), m = +latest.slice(5, 7); var fy = m >= 4 ? y : y - 1; lf.from = fy + "-04"; lf.to = (fy + 1) + "-03"; }
    if (q === "12") { var p = latest.split("-").map(Number); p[1] -= 11; while (p[1] < 1) { p[1] += 12; p[0]--; } lf.from = p[0] + "-" + String(p[1]).padStart(2, "0"); lf.to = latest; }
    if (q === "pending") lf.cash = "pending";
    store("ledger", lf);
    ["From", "To", "Cash"].forEach(function (k) { $("lf" + k).value = lf[k.toLowerCase()] || ""; });
    renderLedger();
  });
  $("ldBody").addEventListener("click", function (e) { var b = e.target.closest("[data-open]"); if (b) go(b.getAttribute("data-open")); });
  $("ldBody").addEventListener("change", onCash);
  $("ldCsv").addEventListener("click", function () { csv(ledgerRows(), ledgerTitle(), false); });
  $("ldPdf").addEventListener("click", function () { ledgerPdf(ledgerRows(), "Ledger - " + ledgerTitle(), false, $("ldStatus")); });
  function ledgerTitle() {
    var t = lf.trader && D.byTrader[lf.trader] ? D.byTrader[lf.trader].name : "All traders";
    var range = lf.from || lf.to ? (lf.from ? mLabel(lf.from) : "start") + " to " + (lf.to ? mLabel(lf.to) : "now") : "all months";
    return t + " - " + range + (lf.cash === "pending" ? " - cash pending" : "");
  }

  /* ---------------------------------------------------------------- downloads */
  var CSV_COLS = [
    ["Month", function (e) { return e.month; }], ["Trader", function (e) { return e.name; }], ["Status", function (e) { return e.status; }],
    ["NSE Gross", "gross"], ["Loss Carry Forward", "loss_cf"], ["Interest", "interest"], ["GRD Interest", "grd_interest"], ["Minimum Interest", "min_interest"],
    ["Greek", "greek"], ["Facility", "facility"], ["Technical", "technical"], ["BSE NET", "bse_net"], ["NSE NET", "nse_net"], ["NET", "net_total"],
    ["Trader %", "trader_pct"], ["Salary Carry Forward", "salary_cf"], ["Adjustment", "adjustment"], ["Payable", "payable"], ["Salary", "salary"],
    ["Incentive / Fees", incentive], ["Jayesh Mehta %", "jm_pct"], ["Jayesh Mehta", "jm_share"], ["MG %", "mg_pct"], ["MG", "mg_share"],
    ["Cash Received", function (e) { return e.cash_received ? "Yes" : "No"; }], ["Note", function (e) { return e.note || ""; }],
  ];
  function csv(rows, title, oneTrader) {
    var cols = oneTrader ? CSV_COLS.filter(function (c) { return c[0] !== "Trader"; }) : CSV_COLS;
    var q = function (v) { v = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.map(function (c) { return q(c[0]); }).join(",")];
    rows.forEach(function (e) { lines.push(cols.map(function (c) { return q(typeof c[1] === "function" ? c[1](e) : e[c[1]]); }).join(",")); });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "MASK " + safe(title) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function safe(s) { return String(s).replace(/[\\/:*?"<>|]+/g, "-"); }
  function ledgerPdf(rows, title, oneTrader, st) {
    var head = (oneTrader ? ["Month"] : ["Month", "Trader"]).concat(["Gross", "Loss C/F", "Interest", "Costs", "NET", "Trader %", "Salary C/F", "Payable", "Salary", "Incentive / fees", "Jayesh Mehta", "MG", "Cash"]);
    var body = rows.map(function (e) {
      return (oneTrader ? [mLabel(e.month)] : [mLabel(e.month), e.name]).concat([e.gross, e.loss_cf, e.interest, costs(e) || null, e.net_total, has(e.trader_pct) ? fmt(e.trader_pct) + "%" : "", e.salary_cf, e.payable, e.salary, incentive(e), e.jm_share, e.mg_share, e.cash_received ? "Yes" : ""]);
    });
    var s = sum(rows);
    var foot = (oneTrader ? ["Total"] : ["Total", ""]).concat([s.gross, s.loss, s.interest, s.costs, s.net, "", "", s.payable, s.salary, s.inc, s.jm, s.mg, ""].map(function (v) { return typeof v === "number" ? r2(v) : v; }));
    BO().status(st, "Preparing PDF…");
    window.BOPdf.table({ title: title, head: head, body: body, foot: foot, textCols: oneTrader ? 1 : 2 })
      .then(function (n) { BO().status(st, "Downloaded " + n + ".", "ok"); })
      .catch(function (err) { BO().status(st, err.message, "err"); });
  }

  /* ---------------------------------------------------------------- Overview dashboard */
  function home() {
    var box = $("homeTally"); if (!box) return;
    Promise.all([BO().api("GET", "/api/tally"), load(true)]).then(function (r) {
      var ms = r[0].months, latest = ms[0], fin = ms.filter(function (m) { return m.status === "final"; })[0];
      var next = !latest ? null : latest.status === "draft"
        ? { t: mLabel(latest.month, true) + " is in draft", s: "Enter the GRD figures, check, save and finalise.", b: "Continue " + mLabel(latest.month), go: latest.month }
        : { t: "Next: start " + mLabel(nextMonth(latest.month), true), s: mLabel(latest.month, true) + " is final" + (latest.cash_done < latest.traders ? " · cash ticked for " + latest.cash_done + " of " + latest.traders : " · all cash received") + ".", b: "Start " + mLabel(nextMonth(latest.month)), go: "" };
      var active = D.traders.filter(function (t) { return t.active; });
      box.innerHTML =
        (next ? '<div class="hm-next"><div><span class="hm-next__k">Trade Tally</span><h2 class="hm-next__t">' + esc(next.t) + '</h2><p class="hm-next__s">' + esc(next.s) + '</p></div><button type="button" class="btn btn--gold btn--sm" data-go="' + next.go + '">' + esc(next.b) + " →</button></div>" : "") +
        (fin ? '<div class="tt-stats">' +
          stat("Last final month", mLabel(fin.month, true), "cash ticked " + fin.cash_done + " of " + fin.traders) +
          stat("NET", short(fin.net_total), mLabel(fin.month), +fin.net_total < 0) +
          stat("Payable to traders", short(fin.payable), mLabel(fin.month)) +
          stat("Jayesh Mehta", short(fin.jm_share), "MG " + short(fin.mg_share) + " · " + mLabel(fin.month)) +
          stat("Active traders", String(active.length), D.traders.length - active.length + " former") + "</div>" : "") +
        '<div class="hm-traders">' + active.map(function (t) {
          var e = latestOf(t);
          return '<button type="button" class="hm-tr" data-go="trader:' + t.id + '"><span class="hm-tr__n">' + esc(t.name) + '</span>' +
            '<span class="hm-tr__v" title="' + (e ? "NET " + mLabel(e.month) : "") + '">' + (e ? money(e.net_total) : "–") + '</span>' + bars(settled(t), 120, 26, { max: 12 }) + "</button>";
        }).join("") + "</div>";
    }).catch(function (err) { box.innerHTML = '<p class="tt-neg">' + esc(err.message) + "</p>"; });
  }
  // Overview tile clicks are handled in bo.js

  /* ---------------------------------------------------------------- routing helper */
  function go(sub) { if (window.BOTally) window.BOTally.go(sub); }

  window.BOLedger = {
    traders: openTraders, trader: openTrader, ledger: openLedger, home: home,
    invalidate: function () { D = null; },
    load: load, carry: function (t) { return carry(t); }, latestOf: function (t) { return latestOf(t); },
    refreshTrader: function () { if (cur.id) renderTrader(); },
  };
})();
