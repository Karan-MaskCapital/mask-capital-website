/* Trade Tally: add a new trader (every detail in one form) and close out a trader who is leaving. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function BO() { return window.BO; }
  function esc(s) { return BO().esc(s); }
  function isAdmin() { var m = BO().me(); return m && m.role === "admin"; }
  function N(v) { return v === null || v === undefined || v === "" || isNaN(+v) ? 0 : +v; }
  function has(v) { return v !== null && v !== undefined && v !== "" && !isNaN(+v); }
  function num(s) { s = String(s == null ? "" : s).replace(/[,₹\s]/g, ""); return s === "" || isNaN(+s) ? null : +s; }
  function fmt(v) { if (!has(v)) return "–"; var n = +v; return n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function money(v) { return has(v) ? '<span class="' + (+v < 0 ? "tt-neg" : "") + '">' + fmt(v) + "</span>" : '<span class="tt-dim">–</span>'; }
  var ML = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function mLabel(m) { var p = String(m).split("-"); return ML[+p[1] - 1] + " " + p[0]; }
  function nextMonth(m) { var p = m.split("-").map(Number); p[1]++; if (p[1] > 12) { p[1] = 1; p[0]++; } return p[0] + "-" + String(p[1]).padStart(2, "0"); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function go(sub) { window.BOTally.go(sub); }
  function L() { return window.BOLedger; }
  function field(id, label, input, hint, wide) {
    return '<label class="pf' + (wide ? " pf--wide" : "") + '" for="' + id + '"><span class="pf__l">' + label + "</span>" + input + (hint ? '<span class="pf__h">' + hint + "</span>" : "") + "</label>";
  }
  function inp(id, attrs) { return '<input id="' + id + '" class="ld-input" ' + (attrs || "") + ">"; }
  function sec(n, title, desc, body) {
    return '<section class="pf-sec"><header class="pf-sec__h"><span class="pf-sec__n">' + n + '</span><div><h3>' + esc(title) + "</h3>" + (desc ? "<p>" + desc + "</p>" : "") + '</div></header><div class="pf-grid">' + body + "</div></section>";
  }

  /* ================================================================ add a trader */
  var lic = [];
  var greekTouched = false;
  function openNew() {
    var box = $("pfNew");
    if (!isAdmin()) { box.innerHTML = '<div class="bo-empty">Only an admin can add traders.</div>'; return; }
    box.innerHTML = '<p class="tt-dim">Loading…</p>';
    Promise.all([L().load(true), BO().api("GET", "/api/setup/licences")]).then(function (r) {
      var D = r[0]; lic = r[1].rows.filter(function (l) { return l.active; });
      greekTouched = false;
      var draft = (D.drafts || [])[0] || null;
      var start = draft || (D.months && D.months[0] ? nextMonth(D.months[0]) : today().slice(0, 7));
      var traderOpts = '<option value="">— own salary —</option>' + D.traders.filter(function (t) { return t.active; }).map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + "</option>"; }).join("");
      box.innerHTML =
        '<div class="pf-layout"><form id="pfForm" class="pf-form" novalidate>' +
        sec(1, "Who", "The name shown everywhere, and how the trader appears on GRD statements so pasted figures match.",
          field("nName", "Full name *", inp("nName", 'required maxlength="200" autocomplete="off"')) +
          field("nAliases", "Names on GRD statement", inp("nAliases", 'placeholder="e.g. JS-RAHUL SHAH GCOM50, JS-GCOM 50"'), "Separate with commas. Include the GCOM number if GRD shows one.") +
          field("nJoined", "Joined", inp("nJoined", 'type="month" value="' + start + '"')) +
          field("nNotes", "Notes", inp("nNotes", 'maxlength="500"'), "", true)) +
        sec(2, "Contact & bank", "Where payouts go. Kept private to the back office.",
          field("nPhone", "Phone", inp("nPhone", 'type="tel" autocomplete="off"')) +
          field("nEmail", "Email", inp("nEmail", 'type="email" autocomplete="off"')) +
          field("nPan", "PAN", inp("nPan", 'maxlength="10" placeholder="ABCDE1234F" style="text-transform:uppercase"')) +
          field("nBank", "Bank", inp("nBank", 'placeholder="e.g. HDFC Bank"')) +
          field("nAcct", "Account number", inp("nAcct", 'inputmode="numeric" autocomplete="off"')) +
          field("nIfsc", "IFSC", inp("nIfsc", 'maxlength="11" placeholder="HDFC0001234" style="text-transform:uppercase"'))) +
        sec(3, "Pay terms", "The trader&rsquo;s share of a profitable month&rsquo;s NET, and their monthly salary. With no salary, the payout is professional fees.",
          field("nPct", "Trader share %", inp("nPct", 'inputmode="decimal" value="70"')) +
          field("nSalary", "Salary per month", inp("nSalary", 'inputmode="decimal" value="0"'), "0 = professional fees, no salary") +
          field("nLinked", "Salary deducted from", '<select id="nLinked" class="ld-input">' + traderOpts + "</select>", "Only when another trader pays this salary (like Bhavesh → Nandkishor).")) +
        sec(4, "Fund & interest", "The corpus allotted and the deposit placed. Minimum interest = (fund − deposit) × rate ÷ 365 × interest days.",
          field("nFund", "Fund allotted", inp("nFund", 'inputmode="decimal" value="0"')) +
          field("nDeposit", "Deposit", inp("nDeposit", 'inputmode="decimal" value="0"')) +
          field("nRate", "Interest rate % a year", inp("nRate", 'inputmode="decimal" value="6.5"')) +
          '<label class="pf pf--check"><input type="checkbox" id="nMin" checked> <span>Charge minimum interest when GRD&rsquo;s interest is lower</span></label>') +
        sec(5, "Costs", "Tick the algo licences the trader uses. The greek cost charged each month starts as their total; change it if you charge differently.",
          '<div class="pf-lic pf--wide">' + (lic.length ? lic.map(function (l) {
            return '<label class="pf-licbox"><input type="checkbox" data-lic="' + l.id + '" data-price="' + N(l.price) + '"><span>' + esc(l.name) + '</span><small>' + fmt(l.price) + "</small></label>";
          }).join("") : '<span class="tt-dim">No licences set up yet (Setup → Algo licences).</span>') + "</div>" +
          field("nGreek", "Greek cost charged / month", inp("nGreek", 'inputmode="decimal" value="0"')) +
          field("nFacility", "Facility + GST / month", inp("nFacility", 'inputmode="decimal" value="0"')) +
          field("nTechnical", "Technical / month", inp("nTechnical", 'inputmode="decimal" value="0"'))) +
        sec(6, "GRD accounts", "The GCOM / GK codes this trader trades, and whose name each account is in.",
          '<div class="pf-accts pf--wide" id="nAccts"></div><button type="button" class="bo-link pf--wide pf-add" id="nAddAcct">+ Add an account</button>') +
        sec(7, "Partner shares", "Jayesh Mehta receives this % of NET from GRD, pays the trader their share and MG their %.",
          field("nJm", "Jayesh Mehta % from GRD", inp("nJm", 'inputmode="decimal" value="80"')) +
          field("nMg", "MG %", inp("nMg", 'inputmode="decimal" value="2"'))) +
        sec(8, "Save", "",
          (draft ? '<label class="pf pf--check pf--wide"><input type="checkbox" id="nDraft" value="' + draft + '" checked> <span>Also add to the <strong>' + esc(mLabel(draft)) + "</strong> draft, which is open now</span></label>" : "") +
          field("nComment", "Comment (required)", inp("nComment", 'maxlength="500" placeholder="e.g. Joined from 1 December, agreed 70% and 40,000 salary"'), "", true) +
          '<div class="pf-actions pf--wide"><button type="submit" class="btn btn--gold btn--sm">Add trader</button><button type="button" class="bo-link" data-back="traders">Cancel</button><span class="form__status" id="nStatus" role="status" aria-live="polite"></span></div>') +
        '</form><aside class="pf-preview" id="nPreview" aria-live="polite"></aside></div>';
      addAcct(); preview();
    }).catch(function (err) { box.innerHTML = '<p class="tt-neg">' + esc(err.message) + "</p>"; });
  }

  function addAcct(a) {
    a = a || {};
    var row = document.createElement("div");
    row.className = "pf-acct";
    row.innerHTML = '<input class="ld-input" data-a="code" placeholder="Code, e.g. GCOM - 50" value="' + esc(a.code || "") + '">' +
      '<select class="ld-input" data-a="exchange"><option>NSE</option><option>BSE</option></select>' +
      '<input class="ld-input" data-a="market" placeholder="Market, e.g. F&amp;O" value="' + esc(a.market || "") + '">' +
      '<input class="ld-input" data-a="holder" placeholder="Account holder (if not the trader)" value="' + esc(a.holder || "") + '">' +
      '<button type="button" class="ld-ic" data-rm-acct title="Remove" aria-label="Remove account">✕</button>';
    $("nAccts").appendChild(row);
  }

  function licTotal() {
    var s = 0; document.querySelectorAll("#pfNew [data-lic]:checked").forEach(function (c) { s += +c.getAttribute("data-price"); }); return s;
  }
  function preview() {
    var p = $("nPreview"); if (!p) return;
    var name = $("nName").value.trim() || "New trader";
    var pct = N(num($("nPct").value)), jm = N(num($("nJm").value)), mg = N(num($("nMg").value)), sal = N(num($("nSalary").value));
    var fund = N(num($("nFund").value)), dep = N(num($("nDeposit").value)), rate = N(num($("nRate").value));
    var perDay = Math.round((fund - dep) * rate / 100 / 365);
    var costs = N(num($("nGreek").value)) + N(num($("nFacility").value)) + N(num($("nTechnical").value));
    var ex = 100000, tr = ex * pct / 100, jmk = ex * (jm - pct - mg) / 100;
    var warn = [];
    if (pct + mg > jm) warn.push("Trader % + MG % is more than Jayesh Mehta&rsquo;s %. Jayesh Mehta would lose money on every profitable month.");
    if (fund && dep > fund) warn.push("Deposit is larger than the fund.");
    if ($("nMin").checked && !fund) warn.push("Minimum interest is on but the fund is 0, so it will not apply.");
    p.innerHTML = '<span class="hm-next__k">Preview</span><h3 class="pf-pv__name">' + esc(name) + "</h3>" +
      '<div class="pf-pv__block"><span class="pf-pv__k">If a month&rsquo;s NET is 1,00,000</span>' +
        row("Trader gets", tr) + row("MG gets", ex * mg / 100) + row("Jayesh Mehta keeps", jmk, true) +
        (sal ? '<p class="pf-pv__s">Salary ' + fmt(sal) + " is paid from the trader&rsquo;s share; the rest is incentive.</p>" : '<p class="pf-pv__s">No salary: the full share is professional fees.</p>') + "</div>" +
      '<div class="pf-pv__block"><span class="pf-pv__k">Every month</span>' +
        row("Minimum interest / day", perDay) + row("≈ for 30 days", perDay * 30) + row("Fixed costs", costs) + "</div>" +
      '<div class="pf-pv__block"><span class="pf-pv__k">Starts</span><p class="pf-pv__s">' + ($("nJoined").value ? esc(mLabel($("nJoined").value)) : "–") +
        ($("nDraft") && $("nDraft").checked ? " · added to the " + esc(mLabel($("nDraft").value)) + " draft" : " · included from the next month started") + "</p></div>" +
      (warn.length ? '<div class="pf-pv__warn">' + warn.map(function (w) { return "<p>" + w + "</p>"; }).join("") + "</div>" : "");
    function row(k, v, strong) { return '<div class="pf-pv__r' + (strong ? " is-strong" : "") + '"><span>' + k + "</span><span>" + money(Math.round(v * 100) / 100) + "</span></div>"; }
  }

  $("pfNew").addEventListener("input", function (e) {
    if (e.target.id === "nGreek") greekTouched = true;
    preview();
  });
  $("pfNew").addEventListener("change", function (e) {
    if (e.target.hasAttribute("data-lic") && !greekTouched) $("nGreek").value = licTotal();
    preview();
  });
  $("pfNew").addEventListener("click", function (e) {
    if (e.target.id === "nAddAcct") addAcct();
    var rm = e.target.closest("[data-rm-acct]"); if (rm) rm.closest(".pf-acct").remove();
    var back = e.target.closest("[data-back]"); if (back) go(back.getAttribute("data-back"));
  });
  $("pfNew").addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("nStatus");
    var name = $("nName").value.trim();
    if (!name) { BO().status(st, "Enter the trader's name.", "err"); $("nName").focus(); return; }
    var nums = { payout_pct: "nPct", salary: "nSalary", fund: "nFund", deposit: "nDeposit", interest_rate: "nRate", greek_cost: "nGreek", facility_cost: "nFacility", technical_cost: "nTechnical", jm_pct: "nJm", mg_pct: "nMg" };
    var t = { name: name, aliases: $("nAliases").value.trim(), notes: $("nNotes").value.trim(), joined_month: $("nJoined").value || null,
      phone: $("nPhone").value.trim(), email: $("nEmail").value.trim(), pan: $("nPan").value.trim(), bank_name: $("nBank").value.trim(),
      bank_account: $("nAcct").value.trim(), bank_ifsc: $("nIfsc").value.trim(), min_interest: $("nMin").checked, linked_to: $("nLinked").value || null };
    for (var k in nums) {
      var raw = $(nums[k]).value, v = num(raw);
      if (raw.trim() !== "" && v === null) { BO().status(st, "Check the number in “" + document.querySelector('label[for="' + nums[k] + '"] .pf__l').textContent + "”.", "err"); $(nums[k]).focus(); return; }
      t[k] = v === null ? 0 : v;
    }
    var comment = $("nComment").value.trim();
    if (comment.length < 3) { BO().status(st, "Add a short comment, e.g. when they joined and the agreed terms.", "err"); $("nComment").focus(); return; }
    var accounts = [];
    document.querySelectorAll("#nAccts .pf-acct").forEach(function (r) {
      var a = {}; r.querySelectorAll("[data-a]").forEach(function (i) { a[i.getAttribute("data-a")] = i.value.trim(); }); if (a.code) accounts.push(a);
    });
    var licIds = []; document.querySelectorAll("#pfNew [data-lic]:checked").forEach(function (c) { licIds.push(+c.getAttribute("data-lic")); });
    BO().status(st, "Adding…");
    BO().api("POST", "/api/tally/traders/new", { trader: t, licence_ids: licIds, accounts: accounts, add_to_draft: $("nDraft") && $("nDraft").checked ? $("nDraft").value : null, comment: comment })
      .then(function (j) { L().invalidate(); go("trader:" + j.id); })
      .catch(function (err) { BO().status(st, err.message, "err"); });
  });

  /* ================================================================ close out / edit close-out */
  var closing = null;
  function openClose(id) {
    var box = $("pfClose");
    if (!isAdmin()) { box.innerHTML = '<div class="bo-empty">Only an admin can close an account.</div>'; return; }
    box.innerHTML = '<p class="tt-dim">Loading…</p>';
    L().load(true).then(function (D) {
      var t = D.byTrader[id];
      if (!t) { box.innerHTML = '<div class="bo-empty">Trader not found.</div>'; return; }
      closing = t;
      var edit = !t.active, x = t.exit || {};
      var last = L().latestOf(t), cf = L().carry(t) || { loss: 0, salary: 0 };
      var inDraft = (D.drafts || []).filter(function (m) { return t.entries.some(function (e) { return e.month === m; }); })[0];
      var draftEntry = inDraft && t.entries.filter(function (e) { return e.month === inDraft; })[0];
      var openCash = t.entries.filter(function (e) { return e.status === "final" && !e.cash_received && !e.legacy && N(e.payable) !== 0; });
      var v = function (k, d) { return edit ? (x[k] == null ? "" : x[k]) : d; };

      var checks = [];
      if (!edit) {
        checks.push(item(true, "History is kept", "Every month stays in the ledger and in the reports. Nothing is deleted."));
        checks.push(item(true, "Left out of new months", "From now on, new months will not include " + esc(t.name) + "."));
        if (inDraft) checks.push(item(false, "In the " + esc(mLabel(inDraft)) + " draft", (draftEntry && has(draftEntry.gross) ? "Figures are entered for this month. Keep it if this was their last month." : "No figures entered yet. Tick below to remove them from that draft.")));
        if (openCash.length) checks.push(item(false, "Cash not ticked for " + openCash.length + " month" + (openCash.length > 1 ? "s" : ""), openCash.map(function (e) { return esc(mLabel(e.month)) + " (" + fmt(e.payable) + ")"; }).join(", ")));
        if (cf.loss || cf.salary) checks.push(item(false, "Residuals still open", "Loss " + fmt(cf.loss) + " and unrecovered salary " + fmt(cf.salary) + " carry into nothing once the account closes. Record how they are settled."));
      }

      box.innerHTML =
        '<div class="pf-layout"><form id="cForm" class="pf-form" novalidate>' +
        '<div class="pf-intro"><h2 class="bo-h1">' + (edit ? "Close-out record" : "Close account") + ' <span class="tt-h1sub">' + esc(t.name) + "</span></h2>" +
          '<p class="bo-sub">' + (edit ? "Update the settlement as it progresses. Every change needs a comment and is kept in Setup → Trader data history."
            : "Records what the trader leaves with: losses still carried forward, salary not yet recovered, deposit, and the final settlement.") + "</p></div>" +
        sec(1, "Last month", "",
          field("cLeft", "Last month traded *", inp("cLeft", 'type="month" value="' + esc(v("left_month", last ? last.month : "")) + '"')) +
          field("cReason", "Reason", '<select id="cReason" class="ld-input">' + ["", "Resigned", "Asked to leave", "Moved to another desk", "Contract ended", "Left before the back office", "Other"].map(function (r) {
            return "<option" + (String(v("reason", "")) === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select>")) +
        sec(2, "Residuals", "Worked out from the last month. Change them if anything was agreed differently.",
          field("cLoss", "Loss still carried forward", inp("cLoss", 'inputmode="decimal" value="' + esc(v("loss_cf", cf.loss || 0)) + '"'), "Negative = loss the trader has not yet earned back.") +
          field("cSal", "Salary not yet recovered", inp("cSal", 'inputmode="decimal" value="' + esc(v("salary_cf", cf.salary || 0)) + '"'), "Salary paid in loss months.") +
          field("cDep", "Deposit held", inp("cDep", 'inputmode="decimal" value="' + esc(v("deposit", N(t.deposit))) + '"')) +
          field("cDepRet", "Deposit returned", inp("cDepRet", 'inputmode="decimal" value="' + esc(v("deposit_returned", "")) + '"'), "Leave blank until it is returned.")) +
        sec(3, "Settlement", "",
          field("cSettle", "Final settlement", inp("cSettle", 'inputmode="decimal" value="' + esc(v("settlement", "")) + '"'), "+ paid to the trader, − received from the trader.") +
          '<label class="pf pf--check"><input type="checkbox" id="cSettled"' + (edit && x.settled ? " checked" : "") + '> <span>Fully settled</span></label>' +
          field("cSettledOn", "Settled on", inp("cSettledOn", 'type="date" value="' + esc(v("settled_on", "")) + '"')) +
          field("cNote", "Note", inp("cNote", 'maxlength="500" value="' + esc(v("note", "")) + '"'), "", true)) +
        sec(4, "Finish", "",
          (edit ? "" :
            '<label class="pf pf--check pf--wide"><input type="checkbox" id="cAccts" checked> <span>Mark their GRD accounts as closed (' + (t.accountList.filter(function (a) { return a.active; }).map(function (a) { return esc(a.code); }).join(", ") || "none") + ")</span></label>" +
            '<label class="pf pf--check pf--wide"><input type="checkbox" id="cLic" checked> <span>Release their algo licences (' + (t.licenceList.map(function (l) { return esc(l.name); }).join(", ") || "none") + ")</span></label>" +
            (inDraft ? '<label class="pf pf--check pf--wide"><input type="checkbox" id="cDraft" value="' + inDraft + '"' + (draftEntry && has(draftEntry.gross) ? "" : " checked") + "> <span>Remove them from the " + esc(mLabel(inDraft)) + " draft</span></label>" : "")) +
          field("cComment", "Comment (required)", inp("cComment", 'maxlength="500" placeholder="' + (edit ? "e.g. Deposit returned by NEFT on 5 Dec" : "e.g. Resigned, last trading day 28 Nov") + '"'), "", true) +
          '<div class="pf-actions pf--wide"><button type="submit" class="btn btn--gold btn--sm">' + (edit ? "Save close-out" : "Close account") + '</button>' +
          '<button type="button" class="bo-link" data-back="trader:' + t.id + '">Cancel</button><span class="form__status" id="cStatus" role="status" aria-live="polite"></span></div>') +
        "</form>" +
        '<aside class="pf-preview">' +
          '<span class="hm-next__k">' + (edit ? "Account closed" : "Before you close") + "</span><h3 class=\"pf-pv__name\">" + esc(t.name) + "</h3>" +
          '<div class="pf-pv__block"><span class="pf-pv__k">Last month on record</span>' + (last ? '<div class="pf-pv__r"><span>' + esc(mLabel(last.month)) + '</span><span>NET ' + money(last.net_total) + "</span></div>" : '<p class="pf-pv__s">No months yet.</p>') + "</div>" +
          '<div class="pf-pv__block"><span class="pf-pv__k">Carried forward after it</span>' +
            '<div class="pf-pv__r"><span>Loss</span><span>' + money(cf.loss) + '</span></div><div class="pf-pv__r"><span>Salary</span><span>' + money(cf.salary) + "</span></div></div>" +
          (checks.length ? '<ul class="pf-checks">' + checks.join("") + "</ul>" : "") +
        "</aside></div>";
    }).catch(function (err) { box.innerHTML = '<p class="tt-neg">' + esc(err.message) + "</p>"; });
  }
  function item(ok, title, text) { return '<li class="' + (ok ? "is-ok" : "is-warn") + '"><strong>' + title + "</strong><span>" + text + "</span></li>"; }

  $("pfClose").addEventListener("click", function (e) { var back = e.target.closest("[data-back]"); if (back) go(back.getAttribute("data-back")); });
  $("pfClose").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = closing, edit = !t.active, st = $("cStatus");
    var x = { left_month: $("cLeft").value, reason: $("cReason").value, note: $("cNote").value.trim(), settled: $("cSettled").checked, settled_on: $("cSettledOn").value || null };
    var nums = { loss_cf: "cLoss", salary_cf: "cSal", deposit: "cDep", deposit_returned: "cDepRet", settlement: "cSettle" };
    for (var k in nums) {
      var raw = $(nums[k]).value, v = num(raw);
      if (raw.trim() !== "" && v === null) { BO().status(st, "Check the number you typed.", "err"); $(nums[k]).focus(); return; }
      x[k] = v;
    }
    if (!x.left_month) { BO().status(st, "Choose the last month they traded.", "err"); return; }
    if (x.settled && !x.settled_on) x.settled_on = today();
    var comment = $("cComment").value.trim();
    if (comment.length < 3) { BO().status(st, "Add a short comment explaining this.", "err"); $("cComment").focus(); return; }
    if (!edit && !confirm("Close " + t.name + "’s account? They will not be included in new months. Their history stays.")) return;
    BO().status(st, "Saving…");
    var req = edit
      ? BO().api("PATCH", "/api/tally/traders/" + t.id + "/exit", { exit: x, comment: comment })
      : BO().api("POST", "/api/tally/traders/" + t.id + "/close", { exit: x, comment: comment, close_accounts: $("cAccts").checked, clear_licences: $("cLic").checked, remove_from_draft: $("cDraft") && $("cDraft").checked ? $("cDraft").value : null });
    req.then(function () { L().invalidate(); go("trader:" + t.id); }).catch(function (err) { BO().status(st, err.message, "err"); });
  });

  /* ================================================================ panel on a former trader's page */
  function exitPanel(t) {
    if (t.active) return "";
    var x = t.exit;
    var admin = isAdmin();
    if (!x) return '<div class="pf-exit"><div class="pf-exit__h"><div><span class="hm-next__k">Account closed</span><h3>No close-out record</h3></div>' +
      (admin ? '<div class="bo-actions"><button type="button" class="btn btn--line btn--sm" data-exit="rejoin">Rejoin</button></div>' : "") + "</div></div>";
    var depOpen = has(x.deposit) && N(x.deposit) > 0 && !has(x.deposit_returned);
    return '<div class="pf-exit' + (x.settled ? "" : " is-open") + '">' +
      '<div class="pf-exit__h"><div><span class="hm-next__k">Account closed' + (x.closed_at && x.closed_by !== "import" ? " · " + esc(String(x.closed_at).slice(0, 10)) + (x.closed_by ? " by " + esc(x.closed_by) : "") : "") + "</span>" +
        "<h3>Last traded " + (x.left_month ? esc(mLabel(x.left_month)) : "–") + (x.reason ? ' <span class="tt-dim">· ' + esc(x.reason) + "</span>" : "") + "</h3></div>" +
        (x.settled ? '<span class="bo-pill">Settled' + (x.settled_on ? " " + esc(x.settled_on) : "") + "</span>" : '<span class="bo-pill bo-pill--warn">Settlement open</span>') + "</div>" +
      '<dl class="pf-exit__grid">' +
        kv("Loss carried forward", money(x.loss_cf)) + kv("Salary not recovered", money(x.salary_cf)) +
        kv("Deposit held", money(x.deposit)) + kv("Deposit returned", has(x.deposit_returned) ? money(x.deposit_returned) : (depOpen ? '<span class="tt-neg">not yet</span>' : "–")) +
        kv("Final settlement", has(x.settlement) ? money(x.settlement) + ' <small class="tt-dim">' + (+x.settlement >= 0 ? "paid to trader" : "from trader") + "</small>" : "–") + "</dl>" +
      (x.note ? '<p class="pf-exit__note">' + esc(x.note) + "</p>" : "") +
      (admin ? '<div class="bo-actions">' + (x.settled ? "" : '<button type="button" class="btn btn--gold btn--sm" data-exit="settle">Mark settled</button>') +
        '<button type="button" class="btn btn--line btn--sm" data-exit="edit">Edit close-out</button><button type="button" class="bo-link" data-exit="rejoin">Rejoin as active</button></div>' : "") +
      "</div>";
    function kv(k, v) { return "<div><dt>" + k + "</dt><dd>" + v + "</dd></div>"; }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("#ldtExit [data-exit]"); if (!b) return;
    var act = b.getAttribute("data-exit"), id = location.hash.match(/trader:(\d+)/), st = $("ldtStatus");
    id = id ? +id[1] : null; if (!id) return;
    if (act === "edit") return go("close:" + id);
    var c = prompt(act === "settle" ? "Mark the settlement as complete. Add a short comment (e.g. how and when it was paid):" : "Reopen this trader as active? They will be included in new months again. Add a short comment:");
    if (c === null) return;
    if (c.trim().length < 3) { BO().status(st, "A short comment is needed.", "err"); return; }
    var req = act === "settle"
      ? BO().api("PATCH", "/api/tally/traders/" + id + "/exit", { exit: { settled: true, settled_on: today() }, comment: c })
      : BO().api("POST", "/api/tally/traders/" + id + "/rejoin", { comment: c });
    req.then(function () { L().invalidate(); go("trader:" + id); BO().status(st, act === "settle" ? "Marked settled." : "Rejoined. They will be in the next month started.", "ok"); })
      .catch(function (err) { BO().status(st, err.message, "err"); });
  });

  window.BOPeople = { openNew: openNew, openClose: openClose, exitPanel: exitPanel };
})();
