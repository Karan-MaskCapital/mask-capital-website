(function () {
  "use strict";
  var C = window.TallyCalc;
  function $(id) { return document.getElementById(id); }
  function BO() { return window.BO; }
  function esc(s) { return BO().esc(s); }
  function isAdmin() { var m = BO().me(); return m && m.role === "admin"; }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function mLabel(m, long) { var p = m.split("-"); return (long ? MONTHS_LONG : MONTHS)[+p[1] - 1] + " " + p[0]; }
  function nextMonth(m) { var p = m.split("-").map(Number); p[1]++; if (p[1] > 12) { p[1] = 1; p[0]++; } return p[0] + "-" + String(p[1]).padStart(2, "0"); }
  function isNum(v) { return v !== null && v !== undefined && v !== "" && !isNaN(+v); }
  function fmt(v, dash) {
    if (!isNum(v)) return dash === false ? "" : "–";
    var n = +v;
    return n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function money(v) {
    if (!isNum(v)) return '<span class="tt-dim">–</span>';
    return '<span class="' + (+v < 0 ? "tt-neg" : "") + '">' + fmt(v) + "</span>";
  }
  function parseNum(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return null;
    var t = s.replace(/[₹\s]/g, "").replace(/^Rs\.?/i, "");
    if (!/^\(?[-−]?[\d,]*\.?\d+\)?$/.test(t)) return null;   // only real numbers, not names like "GCOM41"
    var neg = /^\(.*\)$/.test(t) || /^[-−]/.test(t);
    var n = parseFloat(t.replace(/[^0-9.]/g, ""));
    if (isNaN(n)) return null;
    return neg ? -n : n;
  }
  function msg(el, text, kind) { BO().status(el, text, kind); }

  /* ------------------------------------------------------------ tabs / panes */
  var current = { pane: "months", month: null, data: null, dirty: false, traders: [] };

  function setHash(h) { try { history.replaceState(null, "", "#tally" + (h ? "/" + h : "")); } catch (e) {} }
  function pane(name) {
    document.querySelectorAll(".tt-pane").forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== name; });
    var tab = name === "month" ? "months" : name === "statement" ? "setup" : name;
    document.querySelectorAll(".tt-tabs button").forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-tt") === tab); });
    current.pane = name;
    window.scrollTo(0, 0);
  }
  function confirmLeave() { return !current.dirty || confirm("You have unsaved changes in this month. Leave without saving?"); }

  document.querySelectorAll(".tt-tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!confirmLeave()) return;
      current.dirty = false;
      var t = b.getAttribute("data-tt");
      if (t === "months") loadMonths(); else openSetup("");
    });
  });
  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!confirmLeave()) return;
      current.dirty = false;
      b.getAttribute("data-back") === "months" ? loadMonths() : openSetup("traders");
    });
  });
  window.addEventListener("beforeunload", function (e) { if (current.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ------------------------------------------------------------ months list */
  function loadMonths() {
    pane("months"); setHash("");
    var body = $("ttMonthsBody");
    BO().api("GET", "/api/tally").then(function (j) {
      var ms = j.months;
      $("ttNewMonth").value = ms.length ? nextMonth(ms[0].month) : new Date().toISOString().slice(0, 7);
      var jm = 0, mg = 0, drafts = 0;
      ms.forEach(function (m) { jm += +m.jm_share || 0; mg += +m.mg_share || 0; if (m.status === "draft") drafts++; });
      var latest = ms[0];
      $("ttStats").innerHTML =
        stat("Latest month", latest ? mLabel(latest.month, true) : "–", latest ? "NET " + fmt(latest.net_total) : "") +
        stat("Payable to traders", latest ? fmt(latest.payable) : "–", latest ? mLabel(latest.month) : "") +
        stat("Jayesh Mehta share", fmt(jm), "all months on record") +
        stat("MG share", fmt(mg), "all months on record") +
        (drafts ? stat("Drafts open", String(drafts), "not yet finalised") : "");
      body.innerHTML = ms.map(function (m) {
        return '<tr class="tt-click" data-month="' + m.month + '">' +
          "<td><strong>" + mLabel(m.month, true) + "</strong>" + (m.source === "import" ? ' <span class="tt-dim">· from sheet</span>' : "") + "</td>" +
          "<td>" + pill(m.status) + "</td>" +
          '<td class="num">' + m.traders + "</td>" +
          '<td class="num">' + money(m.net_total) + "</td>" +
          '<td class="num">' + money(m.payable) + "</td>" +
          '<td class="num">' + money(m.jm_share) + "</td>" +
          '<td class="num">' + money(m.mg_share) + "</td>" +
          "<td>" + m.cash_done + " / " + m.traders + "</td></tr>";
      }).join("") || '<tr><td colspan="8">No months yet. Start one above.</td></tr>';
    }).catch(function (err) { body.innerHTML = '<tr><td colspan="8">' + esc(err.message) + "</td></tr>"; });
  }
  function stat(k, v, sub) { return '<div class="tt-stat"><span class="tt-stat__k">' + esc(k) + '</span><span class="tt-stat__v">' + esc(v) + '</span><span class="tt-stat__s">' + esc(sub) + "</span></div>"; }
  function pill(s) { return s === "final" ? '<span class="bo-pill">Final</span>' : '<span class="bo-pill bo-pill--warn">Draft</span>'; }

  $("ttMonthsBody").addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-month]"); if (tr) openMonth(tr.getAttribute("data-month"));
  });

  $("ttNewForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("ttNewStatus"), month = $("ttNewMonth").value;
    if (!/^\d{4}-\d{2}$/.test(month)) return msg(st, "Choose a month.", "err");
    msg(st, "Creating…");
    BO().api("POST", "/api/tally/months", { month: month, days: $("ttNewDays").value })
      .then(function () { msg(st, ""); $("ttNewDays").value = ""; openMonth(month); })
      .catch(function (err) { msg(st, err.message, "err"); });
  });

  /* ------------------------------------------------------------ one month */
  var INPUTS = ["gross", "grd_interest", "min_interest", "grd_greek", "bse_net", "greek", "facility", "technical", "loss_cf", "salary_cf", "trader_pct", "salary", "adjustment", "jm_pct", "mg_pct"];
  var LABELS = {
    gross: "Gross before interest", grd_interest: "GRD interest", min_interest: "Minimum interest", grd_greek: "GRD greek (reference)", bse_net: "BSE NET", greek: "Greek cost", facility: "Facility + GST",
    technical: "Technical cost", loss_cf: "Loss carried forward", salary_cf: "Salary carried forward", trader_pct: "Trader %",
    salary: "Salary", adjustment: "Adjustment", jm_pct: "Jayesh Mehta %", mg_pct: "MG %",
  };
  var open = {}; // expanded rows

  function openMonth(month) {
    pane("month");
    current.month = month; current.dirty = false; open = {}; setHash(month);
    msg($("ttMonthStatus"), "");
    $("ttMonthTitle").textContent = mLabel(month, true);
    $("ttGridBody").innerHTML = '<tr><td colspan="10">Loading…</td></tr>';
    $("ttGridFoot").innerHTML = "";
    BO().api("GET", "/api/tally/months/" + month).then(function (j) {
      current.data = j;
      renderMonth();
    }).catch(function (err) { $("ttGridBody").innerHTML = '<tr><td colspan="10">' + esc(err.message) + "</td></tr>"; });
  }

  function editable() { return current.data && current.data.month.status === "draft"; }

  function recompute() {
    var tmap = {};
    current.data.entries.forEach(function (e) { tmap[e.trader_id] = { linked_to: e.linked_to }; });
    var res = C.computeMonth(current.data.entries, tmap);
    res.forEach(function (r, i) {
      var e = current.data.entries[i];
      if (!e.legacy) ["nse_net", "net_total", "payable", "incentive", "prof_fees", "jm_share", "mg_share"].forEach(function (k) { e[k] = r[k]; });
    });
  }

  function renderMonth() {
    var d = current.data, m = d.month, ed = editable();
    $("ttMonthMeta").innerHTML = pill(m.status) + " " +
      (m.status === "final" && m.finalized_by ? "Finalised by " + esc(m.finalized_by) + (m.finalized_at ? " on " + esc(m.finalized_at.slice(0, 10)) : "") : "Draft. Changes are saved when you click Save.") +
      (m.source === "import" ? " · Imported from the Google Sheet" : "") +
      (d.prev ? " · Carry-forwards from " + mLabel(d.prev) : "");
    $("ttSteps").hidden = !ed;
    $("ttDaysWrap").hidden = !ed;
    $("ttDays").value = m.days == null ? "" : m.days;

    var acts = "";
    if (ed) acts += '<button type="button" class="btn btn--gold btn--sm" data-act="save">Save</button>' +
      '<button type="button" class="btn btn--line btn--sm" data-act="finalize">Finalise month</button>' +
      '<button type="button" class="bo-link" data-act="delete">Delete draft</button>';
    else if (isAdmin()) acts += '<button type="button" class="btn btn--line btn--sm" data-act="reopen">Reopen for changes</button>';
    acts += '<button type="button" class="btn btn--line btn--sm" data-act="zip" title="One PDF per trader, named like the Google Sheet">Trader sheets (ZIP)</button>' +
      '<button type="button" class="btn btn--line btn--sm" data-act="print">Print</button>';
    $("ttMonthActions").innerHTML = acts;

    if (ed) recompute();
    renderGrid();
  }

  function cell(e, k) {
    var v = e[k];
    if (!editable() || e.legacy) return money(v);
    var ph = "";
    if (k === "grd_interest" && isNum(e.min_interest)) ph = ' placeholder="min ' + fmt(e.min_interest) + '"';
    return '<input class="tt-num" data-id="' + e.trader_id + '" data-k="' + k + '" inputmode="decimal" value="' + (isNum(v) ? fmt(v) : "") + '"' + ph + ' aria-label="' + esc(LABELS[k] + " for " + e.name) + '">';
  }

  function renderGrid() {
    var d = current.data, ed = editable();
    var rows = d.entries.map(function (e) {
      var warn = ed && !e.legacy && isNum(e.gross) && !isNum(e.grd_interest) && +e.gross !== 0;
      var html = '<tr class="tt-row' + (open[e.trader_id] ? " is-open" : "") + '" data-row="' + e.trader_id + '">' +
        '<td><button type="button" class="tt-name" data-toggle="' + e.trader_id + '" aria-expanded="' + !!open[e.trader_id] + '">' +
          '<span class="tt-caret">▸</span>' + esc(e.name) + "</button>" +
          (e.note ? '<span class="tt-note" title="' + esc(e.note) + '">✎</span>' : "") +
          (warn ? '<span class="tt-warn" title="Interest missing">!</span>' : "") + "</td>" +
        '<td class="num tt-in">' + cell(e, "gross") + "</td>" +
        '<td class="num tt-in">' + cell(e, "grd_interest") + '<div class="tt-sub" data-o="' + e.trader_id + ':int">' + intNote(e) + "</div></td>" +
        '<td class="num" data-o="' + e.trader_id + ':net_total"><strong>' + money(e.net_total) + "</strong></td>" +
        '<td class="num" data-o="' + e.trader_id + ':payable"><strong>' + money(e.payable) + "</strong></td>" +
        '<td class="num" data-o="' + e.trader_id + ':salary">' + money(e.salary) + "</td>" +
        '<td class="num" data-o="' + e.trader_id + ':inc">' + incHtml(e) + "</td>" +
        '<td class="num" data-o="' + e.trader_id + ':jm_share">' + money(e.jm_share) + "</td>" +
        '<td class="num" data-o="' + e.trader_id + ':mg_share">' + money(e.mg_share) + "</td>" +
        '<td><label class="tt-cash"><input type="checkbox" data-cash="' + e.trader_id + '"' + (e.cash_received ? " checked" : "") + (ed ? " disabled title=\"Finalise the month first\"" : "") + '><span class="sr-only">Cash received from ' + esc(e.name) + "</span></label></td></tr>";
      if (open[e.trader_id]) html += '<tr class="tt-detail"><td colspan="10">' + detail(e) + "</td></tr>";
      return html;
    });
    $("ttGridBody").innerHTML = rows.join("") || '<tr><td colspan="10">No traders in this month.</td></tr>';

    renderFoot();
  }

  function intNote(e) {
    if (e.legacy || !editable()) return "";
    if (isNum(e.min_interest) && C.N(e.min_interest) > C.N(e.grd_interest)) return "charged " + fmt(e.min_interest) + " (minimum)";
    return "";
  }
  function incHtml(e) {
    if (e.linked_to) return '<span class="tt-dim">see linked</span>';
    return (+e.salary > 0 || !isNum(e.prof_fees) || +e.prof_fees === 0) ? money(e.incentive) : money(e.prof_fees) + ' <small class="tt-dim">fees</small>';
  }
  function renderFoot() {
    var t = { gross: 0, interest: 0, bse_net: 0, net_total: 0, payable: 0, salary: 0, incentive: 0, jm_share: 0, mg_share: 0 };
    current.data.entries.forEach(function (e) { for (var k in t) t[k] += C.N(e[k]) + (k === "incentive" ? C.N(e.prof_fees) : 0); });
    $("ttGridFoot").innerHTML = "<tr><td>Total</td>" + ["gross", "interest", "net_total", "payable", "salary", "incentive", "jm_share", "mg_share"].map(function (k) {
      return '<td class="num">' + money(C.r2(t[k])) + "</td>";
    }).join("") + "<td></td></tr>";
  }
  function updateOutputs() {
    current.data.entries.forEach(function (e) {
      var id = e.trader_id;
      ["net_total", "payable"].forEach(function (k) { var c = grid.querySelector('[data-o="' + id + ":" + k + '"]'); if (c) c.innerHTML = "<strong>" + money(e[k]) + "</strong>"; });
      ["salary", "jm_share", "mg_share"].forEach(function (k) { var c = grid.querySelector('[data-o="' + id + ":" + k + '"]'); if (c) c.innerHTML = money(e[k]); });
      var c = grid.querySelector('[data-o="' + id + ':inc"]'); if (c) c.innerHTML = incHtml(e);
      var ci = grid.querySelector('[data-o="' + id + ':int"]'); if (ci) ci.innerHTML = intNote(e);
      var box = grid.querySelector('[data-calc="' + id + '"]'); if (box) box.innerHTML = calcHtml(e);
    });
    renderFoot();
  }

  function line(label, v, op, strong) {
    return '<div class="tt-calc__l' + (strong ? " is-total" : "") + '"><span>' + (op ? '<i>' + op + "</i> " : "") + esc(label) + "</span><span>" + money(v) + "</span></div>";
  }

  function calcHtml(e) {
    var N = C.N, profit = N(e.net_total) > 0, calc = "";
    if (e.legacy) {
      calc += line("NSE NET (typed in the sheet)", e.nse_net) + (isNum(e.bse_net) ? line("BSE NET", e.bse_net, "+") : "");
    } else {
      calc += line("Gross before interest", e.gross);
      if (N(e.loss_cf)) calc += line("Loss carried forward", e.loss_cf, "+");
      var minApplies = isNum(e.min_interest) && N(e.min_interest) > N(e.grd_interest);
      calc += line(isNum(e.min_interest) ? (minApplies ? "Interest: minimum (GRD charged " + fmt(e.grd_interest || 0) + ")" : "Interest: GRD (minimum " + fmt(e.min_interest) + ")") : "Interest", e.interest, "−") +
        line("Greek cost", e.greek, "−") + line("Facility + GST", e.facility, "−");
      if (N(e.technical)) calc += line("Technical cost", e.technical, "−");
      if (N(e.bse_net)) calc += line("BSE NET", e.bse_net, "+");
    }
    calc += line("NET", e.net_total, "=", true);
    calc += profit ? line("Trader share at " + fmt(e.trader_pct) + "%", C.r2(N(e.net_total) * N(e.trader_pct) / 100), "×")
                   : '<div class="tt-calc__l"><span><i>·</i> Loss month: the full NET is shown as payable and carries forward</span><span></span></div>';
    if (N(e.salary_cf)) calc += line("Salary carried forward", e.salary_cf, "+");
    if (N(e.adjustment)) calc += line("Adjustment", e.adjustment, "+");
    calc += line("Payable", e.payable, "=", true);
    if (e.linked_to) calc += '<div class="tt-calc__l"><span><i>·</i> Salary of ' + fmt(e.salary) + " is deducted from the linked trader's incentive</span><span></span></div>";
    else if (N(e.salary) > 0) calc += line("Salary", e.salary, "−") + line("Incentive", e.incentive, "=", true);
    else calc += line("Professional fees", e.prof_fees, "=", true);
    if (profit) calc += '<div class="tt-calc__sub">Jayesh Mehta: NET × (' + fmt(e.jm_pct) + "% − " + fmt(e.trader_pct) + "%) = " + fmt(e.jm_share) + " · MG: NET × " + fmt(e.mg_pct) + "% = " + fmt(e.mg_share) + "</div>";
    return calc;
  }

  function detail(e) {
    var ed = editable() && !e.legacy;
    var calc = '<div class="tt-calc" data-calc="' + e.trader_id + '">' + calcHtml(e) + "</div>";
    var fields = "";
    if (ed) {
      fields = '<div class="tt-fields">' + ["min_interest", "bse_net", "greek", "grd_greek", "facility", "technical", "loss_cf", "salary_cf", "trader_pct", "salary", "adjustment", "jm_pct", "mg_pct"].map(function (k) {
        return '<label class="tt-f"><span>' + esc(LABELS[k]) + '</span><input class="tt-num" data-id="' + e.trader_id + '" data-k="' + k + '" inputmode="decimal" value="' + (isNum(e[k]) ? fmt(e[k]) : "") + '"></label>';
      }).join("") +
        '<label class="tt-f tt-f--wide"><span>Note</span><input data-id="' + e.trader_id + '" data-k="note" value="' + esc(e.note || "") + '" maxlength="300"></label>' +
        "</div>";
    } else if (e.note) {
      fields = '<p class="tt-dim">Note: ' + esc(e.note) + "</p>";
    }
    var pdf = '<button type="button" class="bo-link tt-pdf" data-pdf="' + e.trader_id + '">Download trader sheet (PDF)</button>';
    return '<div class="tt-detailbox"><div>' + calc + pdf + "</div>" + fields + "</div>";
  }

  var grid = $("ttGridBody");
  grid.addEventListener("click", function (e) {
    var t = e.target.closest("[data-toggle]");
    if (t) { var id = t.getAttribute("data-toggle"); open[id] = !open[id]; renderGrid(); return; }
    var pb = e.target.closest("[data-pdf]");
    if (pb) {
      if (current.dirty) { msg($("ttMonthStatus"), "Save your changes first, then download.", "err"); return; }
      window.BOPdf.trader(find(+pb.getAttribute("data-pdf")), current.data.month)
        .then(function (n) { msg($("ttMonthStatus"), "Downloaded " + n + ".", "ok"); })
        .catch(function (err) { msg($("ttMonthStatus"), err.message, "err"); });
    }
  });
  grid.addEventListener("change", function (e) {
    var el = e.target;
    if (el.hasAttribute("data-cash")) return setCash(+el.getAttribute("data-cash"), el.checked, el);
    if (!el.hasAttribute("data-k")) return;
    var en = find(+el.getAttribute("data-id")), k = el.getAttribute("data-k");
    if (k === "note") en.note = el.value; else en[k] = parseNum(el.value);
    changed(el);
  });
  grid.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.classList.contains("tt-num")) { e.preventDefault(); e.target.blur(); }
  });
  $("ttDays").addEventListener("change", function () {
    // new interest days -> refresh the minimum interest of traders where it applies
    var days = parseNum($("ttDays").value);
    current.data.entries.forEach(function (e) { if (!e.legacy && e.min_on) e.min_interest = days ? C.interestEstimate(e, days) : null; });
    changed();
  });

  function find(id) { return current.data.entries.filter(function (x) { return x.trader_id === id; })[0]; }
  function changed(el) {
    current.dirty = true;
    recompute();
    if (el) {
      // keep the inputs (and the cursor) in place; refresh only calculated cells
      if (el.getAttribute("data-k") !== "note") el.value = isNum(find(+el.getAttribute("data-id"))[el.getAttribute("data-k")]) ? fmt(find(+el.getAttribute("data-id"))[el.getAttribute("data-k")]) : "";
      updateOutputs();
    } else renderGrid();
    msg($("ttMonthStatus"), "Unsaved changes. Click Save.", "");
  }

  function setCash(id, val, el) {
    BO().api("POST", "/api/tally/months/" + current.month + "/cash", { trader_id: id, cash_received: val })
      .then(function () { find(id).cash_received = val ? 1 : 0; msg($("ttMonthStatus"), "Cash " + (val ? "marked received" : "unmarked") + " for " + find(id).name + ".", "ok"); })
      .catch(function (err) { el.checked = !val; msg($("ttMonthStatus"), err.message, "err"); });
  }

  function save() {
    var st = $("ttMonthStatus");
    msg(st, "Saving…");
    var entries = current.data.entries.filter(function (e) { return !e.legacy; }).map(function (e) {
      var o = { trader_id: e.trader_id, note: e.note || "" };
      INPUTS.forEach(function (k) { o[k] = isNum(e[k]) ? +e[k] : null; });
      return o;
    });
    return BO().api("PUT", "/api/tally/months/" + current.month, { days: $("ttDays").value, entries: entries })
      .then(function () {
        current.dirty = false;
        return BO().api("GET", "/api/tally/months/" + current.month);
      })
      .then(function (j) { current.data = j; renderMonth(); msg(st, "Saved.", "ok"); })
      .catch(function (err) { msg(st, err.message, "err"); throw err; });
  }

  $("ttMonthActions").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act"), st = $("ttMonthStatus"), month = current.month;
    if (act === "save") save().catch(function () {});
    if (act === "print") window.print();
    if (act === "zip") {
      if (current.dirty) { msg(st, "Save your changes first, then download.", "err"); return; }
      msg(st, "Preparing trader sheets…");
      window.BOPdf.month(current.data.entries, current.data.month)
        .then(function (r) { msg(st, "Downloaded " + r.name + " (" + r.count + " PDFs).", "ok"); })
        .catch(function (err) { msg(st, err.message, "err"); });
    }
    if (act === "finalize") {
      var missing = current.data.entries.filter(function (x) { return !x.legacy && !isNum(x.gross) && !x.linked_to; }).map(function (x) { return x.name; });
      var q = "Finalise " + mLabel(month, true) + "? The month will be locked." + (missing.length ? "\n\nNo gross entered for: " + missing.join(", ") : "");
      if (!confirm(q)) return;
      (current.dirty ? save() : Promise.resolve()).then(function () {
        return BO().api("POST", "/api/tally/months/" + month + "/finalize");
      }).then(function () { openMonth(month); msg(st, "Month finalised.", "ok"); }).catch(function (err) { msg(st, err.message, "err"); });
    }
    if (act === "reopen") {
      if (!confirm("Reopen " + mLabel(month, true) + " for changes?")) return;
      BO().api("POST", "/api/tally/months/" + month + "/reopen").then(function () { openMonth(month); }).catch(function (err) { msg(st, err.message, "err"); });
    }
    if (act === "delete") {
      if (!confirm("Delete the draft for " + mLabel(month, true) + "? This cannot be undone.")) return;
      BO().api("POST", "/api/tally/months/" + month + "/delete").then(function () { current.dirty = false; loadMonths(); }).catch(function (err) { msg(st, err.message, "err"); });
    }
  });

  /* ------------------------------------------------------------ paste from GRD */
  function key(s) { return String(s || "").toUpperCase().replace(/^JS\s*-\s*/, "").replace(/[^A-Z0-9]/g, ""); }
  function gcom(s) { var m = String(s || "").toUpperCase().match(/GCOM\s*-?\s*(\d+)/); return m ? m[1] : null; }

  function matchTrader(name) {
    var g = gcom(name), k = key(name), best = null;
    current.data.entries.forEach(function (e) {
      var aliases = String(e.aliases || "").split(",").map(function (a) { return a.trim(); }).filter(Boolean);
      if (g && aliases.some(function (a) { return gcom(a) === g; })) { best = best || e; return; }
      var keys = [e.name].concat(aliases).map(key).filter(function (x) { return x.length >= 4; });
      if (keys.some(function (x) { return k === x || k.indexOf(x) >= 0 || x.indexOf(k) >= 0; })) best = best || e;
    });
    return best;
  }

  $("ttPasteBtn").addEventListener("click", function () {
    var st = $("ttPasteStatus"), filled = [], missed = [];
    $("ttPaste").value.split(/\r?\n/).forEach(function (ln) {
      if (!ln.trim()) return;
      var parts = ln.split(/\t|\s{2,}|\s*\|\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (parts.length < 2) parts = ln.trim().split(/\s+/);
      var nameParts = [], nums = [];
      parts.forEach(function (p) { if (nums.length === 0 && parseNum(p) === null) nameParts.push(p); else if (parseNum(p) !== null) nums.push(parseNum(p)); });
      var name = nameParts.join(" ");
      if (!name || /^TOTAL$/i.test(name.trim()) || /^NAME$/i.test(name.trim()) || nums.length < 2) return;
      var e = matchTrader(name);
      if (!e || e.legacy) { missed.push(name); return; }
      e.gross = nums[0];
      e.grd_interest = Math.abs(nums[1]);                 // interest is always a charge to the trader
      if (nums.length > 2) e.grd_greek = Math.abs(nums[2]);
      filled.push(e.name);
    });
    if (filled.length) changed();
    msg(st, (filled.length ? "Filled " + filled.length + ": " + filled.join(", ") + "." : "Nothing matched.") +
      (missed.length ? " Not matched: " + missed.join(", ") + ". Add these names under Traders → GRD names." : ""), missed.length ? "err" : "ok");
  });

  /* ------------------------------------------------------------ statement */
  function openSetup(tool) {
    pane("setup"); setHash("setup" + (tool ? ":" + tool : ""));
    if (window.BOSetup) window.BOSetup.open(tool, function (t) { setHash("setup" + (t ? ":" + t : "")); });
  }

  function openStatement(id) {
    pane("statement");
    var body = $("ttStmtBody");
    body.innerHTML = '<tr><td colspan="9">Loading…</td></tr>';
    BO().api("GET", "/api/tally/traders/" + id + "/history").then(function (j) {
      var t = j.trader;
      $("ttStmtTitle").textContent = t.name;
      $("ttStmtMeta").textContent = "Trader " + fmt(t.payout_pct) + "% · Salary " + fmt(t.salary) + (t.aliases ? " · GRD: " + t.aliases : "");
      var tot = { payable: 0, salary: 0, inc: 0 };
      body.innerHTML = j.entries.map(function (e) {
        var inc = C.N(e.incentive) + C.N(e.prof_fees);
        tot.payable += C.N(e.payable); tot.salary += C.N(e.salary); tot.inc += inc;
        return "<tr><td>" + mLabel(e.month) + (e.status === "draft" ? ' <span class="bo-pill bo-pill--warn">Draft</span>' : "") + "</td>" +
          '<td class="num">' + money(e.gross) + '</td><td class="num">' + money(e.loss_cf) + '</td><td class="num">' + money(e.net_total) + "</td>" +
          '<td class="num">' + fmt(e.trader_pct) + '</td><td class="num">' + money(e.payable) + '</td><td class="num">' + money(e.salary) + "</td>" +
          '<td class="num">' + money(inc) + "</td><td>" + (e.cash_received ? "✓" : "") + "</td></tr>";
      }).join("") + '<tr class="tt-totrow"><td>Total</td><td></td><td></td><td></td><td></td><td class="num">' + money(C.r2(tot.payable)) +
        '</td><td class="num">' + money(C.r2(tot.salary)) + '</td><td class="num">' + money(C.r2(tot.inc)) + "</td><td></td></tr>";
    }).catch(function (err) { body.innerHTML = '<tr><td colspan="9">' + esc(err.message) + "</td></tr>"; });
  }

  /* ------------------------------------------------------------ entry */
  var loaded = false;
  window.BOTally = {
    statement: function (id) { openStatement(id); },
    open: function (sub) {
      if (/^\d{4}-\d{2}$/.test(sub || "")) { loaded = true; openMonth(sub); return; }
      if (/^setup/.test(sub || "")) { loaded = true; openSetup(sub.split(":")[1] || ""); return; }
      if (!loaded) { loaded = true; loadMonths(); }
    },
  };
})();
