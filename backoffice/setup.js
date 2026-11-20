(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function BO() { return window.BO; }
  function esc(s) { return BO().esc(s); }
  function isAdmin() { var m = BO().me(); return m && m.role === "admin"; }
  function isNum(v) { return v !== null && v !== undefined && v !== "" && !isNaN(+v); }
  function fmt(v) { if (!isNum(v)) return "–"; var n = +v; return n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function num(s) { s = String(s == null ? "" : s).replace(/[,₹\s]/g, ""); return s === "" || isNaN(+s) ? null : +s; }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function mLabel(m) { var p = String(m).split("-"); return MONTHS[+p[1] - 1] + " " + p[0]; }
  function perDay(r) { return Math.round(((+r.fund || 0) - (+r.deposit || 0)) * (+r.interest_rate || 0) / 100 / 365); }

  var state = { tool: null, data: null, editing: null, adding: false, onNav: null };

  /* ---------------------------------------------------------------- tool definitions */
  var TOOLS = [
    { id: "days", title: "Interest days", icon: "31", key: "month", create: true, del: true,
      desc: "Interest days for each month. A new tally month picks its days from here, and the minimum interest is worked out from them.",
      cols: [
        { k: "month", label: "Month", type: "month", createOnly: true, show: function (r) { return "<strong>" + mLabel(r.month) + "</strong>"; } },
        { k: "days", label: "Interest days", type: "num", num: true },
        { k: "note", label: "Note", type: "text" },
      ] },
    { id: "traders", title: "Trader data", icon: "ID", key: "id",
      desc: "Name, the names used on GRD statements (for paste matching), trader % and salary. Changes apply to months started afterwards. To add a trader or close an account, use Traders → Add trader, or Close account on the trader’s page.",
      cols: [
        { k: "name", label: "Trader", type: "text", show: function (r) { return '<button type="button" class="tt-name" data-stmt="' + r.id + '">' + esc(r.name) + "</button>"; } },
        { k: "aliases", label: "Names on GRD statement", type: "text" },
        { k: "payout_pct", label: "Trader %", type: "num", num: true, suffix: "%" },
        { k: "salary", label: "Salary", type: "num", num: true },
        { k: "linked_to", label: "Salary deducted from", type: "trader" },
        { k: "active", label: "Status", ro: true, type: "bool", yes: "Active", no: "Closed" },
        { k: "notes", label: "Notes", type: "text" },
      ] },
    { id: "contact", title: "Contact & bank", icon: "@", key: "id",
      desc: "Joining month, contact details, PAN and the bank account payouts go to.",
      cols: [
        { k: "name", label: "Trader", ro: true },
        { k: "joined_month", label: "Joined", type: "month", show: function (r) { return r.joined_month ? esc(mLabel(r.joined_month)) : '<span class="tt-dim">–</span>'; } },
        { k: "phone", label: "Phone", type: "text" },
        { k: "email", label: "Email", type: "text" },
        { k: "pan", label: "PAN", type: "text" },
        { k: "bank_name", label: "Bank", type: "text" },
        { k: "bank_account", label: "Account no.", type: "text" },
        { k: "bank_ifsc", label: "IFSC", type: "text" },
      ] },
    { id: "interest", title: "Interest & deposits", icon: "％", key: "id",
      desc: "Fund, deposit and rate per trader. Minimum interest = (fund − deposit) × rate ÷ 365, rounded, × interest days. Each month the trader is charged the higher of GRD's interest and this minimum.",
      cols: [
        { k: "name", label: "Trader", ro: true },
        { k: "fund", label: "Fund", type: "num", num: true },
        { k: "deposit", label: "Deposit", type: "num", num: true },
        { k: "interest_rate", label: "Rate % / year", type: "num", num: true },
        { k: "min_interest", label: "Minimum interest", type: "bool", yes: "Applies", no: "Off" },
        { k: "_perday", label: "Minimum per day", calc: function (r) { return fmt(perDay(r)); }, num: true },
      ] },
    { id: "greek", title: "Greek costs", icon: "Δ", key: "id",
      desc: "Greek cost charged to each trader, compared with the cost of the algo licences they hold and with GRD's latest greek charge. Facility and technical costs are here too.",
      cols: [
        { k: "name", label: "Trader", ro: true },
        { k: "_lic", label: "Licences", type: "licences" },
        { k: "_actual", label: "Licence cost", num: true, calc: function (r) { return fmt(licCost(r.id)); } },
        { k: "greek_cost", label: "Charged to trader", type: "num", num: true },
        { k: "_diff", label: "Difference", num: true, calc: function (r) { var d = (+r.greek_cost || 0) - licCost(r.id); return '<span class="' + (d < 0 ? "tt-neg" : "") + '">' + fmt(d) + "</span>"; } },
        { k: "_grd", label: "GRD greek (latest)", num: true, calc: function (r) { var g = grdGreek(r.id); return g ? fmt(g.grd_greek) + ' <small class="tt-dim">' + esc(g.month) + "</small>" : "–"; } },
        { k: "facility_cost", label: "Facility + GST", type: "num", num: true },
        { k: "technical_cost", label: "Technical", type: "num", num: true },
      ] },
    { id: "licences", title: "Algo licences", icon: "⚙", key: "id", create: true,
      desc: "Licence types and their monthly price. Tick which trader holds which under Greek costs.",
      cols: [
        { k: "name", label: "Licence", type: "text" },
        { k: "exchange", label: "Exchange", type: "select", options: ["", "NSE", "BSE"] },
        { k: "price", label: "Price / month", type: "num", num: true },
        { k: "active", label: "Status", type: "bool", yes: "Active", no: "Inactive" },
        { k: "note", label: "Note", type: "text" },
      ] },
    { id: "accounts", title: "GCOM / GK accounts", icon: "#", key: "id", create: true, del: true,
      desc: "GRD account codes, which trader trades them and whose name the account is in.",
      cols: [
        { k: "code", label: "Account", type: "text", show: function (r) { return "<strong>" + esc(r.code) + "</strong>"; } },
        { k: "trader_id", label: "Trader", type: "trader" },
        { k: "holder", label: "Account holder", type: "text" },
        { k: "exchange", label: "Exchange", type: "select", options: ["NSE", "BSE"] },
        { k: "market", label: "Market", type: "text" },
        { k: "active", label: "Status", type: "bool", yes: "Active", no: "Closed" },
        { k: "note", label: "Note", type: "text" },
      ] },
    { id: "shares", title: "Partner shares", icon: "⅔", key: "id",
      desc: "Jayesh Mehta receives this % of NET from GRD, pays the trader their %, and pays MG this %. The rest is what Jayesh Mehta keeps.",
      cols: [
        { k: "name", label: "Trader", ro: true },
        { k: "_tp", label: "Trader %", num: true, calc: function (r) { return fmt(r.payout_pct) + "%"; } },
        { k: "jm_pct", label: "Jayesh Mehta % from GRD", type: "num", num: true, suffix: "%" },
        { k: "mg_pct", label: "MG %", type: "num", num: true, suffix: "%" },
        { k: "_keeps", label: "Jayesh Mehta keeps", num: true, calc: function (r) { return fmt((+r.jm_pct || 0) - (+r.payout_pct || 0) - (+r.mg_pct || 0)) + "%"; } },
      ] },
    { id: "running", title: "Running totals", icon: "Σ", key: "party",
      desc: "Jayesh Mehta and MG running totals on the GRD Tally reports = opening figure + every month's share. Change the opening only to correct or reset a running total.",
      cols: [
        { k: "label", label: "Partner", ro: true, show: function (r) { return "<strong>" + esc(r.label) + "</strong>"; } },
        { k: "opening", label: "Opening figure", type: "num", num: true },
        { k: "_shares", label: "All months' shares", num: true, calc: function (r) { return fmt(r.shares); } },
        { k: "_total", label: "Running total now", num: true, calc: function (r) { return "<strong>" + fmt(Math.round(((+r.opening || 0) + (+r.shares || 0)) * 100) / 100) + "</strong>"; } },
        { k: "note", label: "Note", type: "text" },
      ] },
  ];
  function tool(id) { return TOOLS.filter(function (t) { return t.id === id; })[0]; }

  function licCost(traderId) {
    var d = state.data, sum = 0;
    if (!d || !d.licences) return 0;
    d.assigned.forEach(function (a) { if (a.trader_id === traderId) { var l = d.licences.filter(function (x) { return x.id === a.licence_id; })[0]; if (l) sum += +l.price || 0; } });
    return sum;
  }
  function licIds(traderId) { return state.data.assigned.filter(function (a) { return a.trader_id === traderId; }).map(function (a) { return a.licence_id; }); }
  function grdGreek(traderId) { return (state.data.grd_greek || []).filter(function (g) { return g.trader_id === traderId; })[0]; }
  function traderName(id) { var t = (state.data.traders || []).filter(function (x) { return x.id === id; })[0]; return t ? t.name : ""; }

  /* ---------------------------------------------------------------- menu */
  function renderMenu() {
    $("stMenu").innerHTML = TOOLS.map(function (t) {
      return '<button type="button" data-tool="' + t.id + '" class="' + (state.tool === t.id ? "is-active" : "") + '"><span class="st-ic">' + t.icon + "</span>" + esc(t.title) + "</button>";
    }).join("");
  }
  $("stMenu").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tool]"); if (b) open(b.getAttribute("data-tool"));
  });

  function open(id, onNav) {
    if (onNav) state.onNav = onNav;
    id = tool(id) ? id : "days";
    state.tool = id; state.editing = null; state.adding = false; state.data = null;
    if (state.onNav) state.onNav(id);
    renderMenu();
    $("stBody").innerHTML = '<p class="tt-dim">Loading…</p>';
    load();
  }
  function load() {
    var id = state.tool;
    return BO().api("GET", "/api/setup/" + id).then(function (j) {
      if (state.tool !== id) return;
      state.data = j; render();
    }).catch(function (err) { $("stBody").innerHTML = '<p class="form__status err">' + esc(err.message) + "</p>"; });
  }

  /* ---------------------------------------------------------------- render one tool */
  function render(statusMsg, kind) {
    var t = tool(state.tool), d = state.data, admin = isAdmin();
    var head = '<div class="bo-head st-head"><div><h2 class="bo-h2">' + esc(t.title) + '</h2><p class="bo-hint st-desc">' + esc(t.desc) + "</p></div>" +
      (admin && t.create && !state.adding ? '<button type="button" class="btn btn--gold btn--sm" data-st="add">Add</button>' : "") + "</div>";
    var th = t.cols.map(function (c) { return '<th class="' + (c.num ? "num" : "") + '">' + esc(c.label) + "</th>"; }).join("") + "<th><span class=\"sr-only\">Actions</span></th>";
    var rows = "";
    if (state.adding) rows += editRow(t, {}, true);
    d.rows.forEach(function (r) {
      var k = r[t.key];
      if (state.editing !== null && String(state.editing) === String(k)) { rows += editRow(t, r, false); return; }
      rows += '<tr class="' + (r.active === 0 ? "is-off" : "") + '">' + t.cols.map(function (c) { return '<td class="' + (c.num ? "num" : "") + '">' + view(c, r) + "</td>"; }).join("") +
        '<td class="bo-row-actions">' + (admin ? '<button type="button" class="bo-link" data-st="edit" data-key="' + esc(k) + '">Edit</button>' : "") +
        (admin && t.del ? '<button type="button" class="bo-link" data-st="del" data-key="' + esc(k) + '">Delete</button>' : "") +
        (t.id === "traders" ? '<button type="button" class="bo-link" data-stmt="' + r.id + '">Ledger</button>' : "") + "</td></tr>";
    });
    if (!rows) rows = '<tr><td colspan="' + (t.cols.length + 1) + '">Nothing here yet.</td></tr>';

    var log = (d.log || []).map(function (l) {
      return '<li><div class="st-log__top"><strong>' + esc(l.record || "–") + '</strong><span class="tt-dim">' + esc(l.ts) + " UTC · " + esc(l.actor) + '</span></div><div class="st-log__chg">' + esc(l.changes) + '</div><div class="st-log__c">“' + esc(l.comment) + "”</div></li>";
    }).join("") || '<li class="tt-dim">No changes recorded yet.</li>';

    $("stBody").innerHTML = head +
      '<p class="form__status ' + (kind || "") + '" id="stStatus" role="status" aria-live="polite">' + esc(statusMsg || "") + "</p>" +
      '<div class="bo-table-wrap"><table class="bo-table tt-table st-table"><thead><tr>' + th + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<h3 class="st-h3">Change history</h3><ul class="st-log">' + log + "</ul>";
    var first = $("stBody").querySelector(".st-edit input:not([type=checkbox]), .st-edit select");
    if (first && (state.adding || state.editing !== null)) first.focus();
  }

  function view(c, r) {
    if (c.calc) return c.calc(r);
    if (c.show) return c.show(r);
    var v = r[c.k];
    if (c.type === "bool") return v ? '<span class="bo-pill">' + esc(c.yes) + "</span>" : '<span class="bo-pill bo-pill--off">' + esc(c.no) + "</span>";
    if (c.type === "trader") return v ? esc(traderName(v)) : '<span class="tt-dim">–</span>';
    if (c.type === "licences") {
      var ids = licIds(r.id);
      return ids.length ? state.data.licences.filter(function (l) { return ids.indexOf(l.id) >= 0; }).map(function (l) { return '<span class="st-chip">' + esc(l.name) + "</span>"; }).join(" ") : '<span class="tt-dim">none</span>';
    }
    if (c.num) return isNum(v) ? fmt(v) + (c.suffix || "") : "–";
    return v ? esc(v) : '<span class="tt-dim">–</span>';
  }

  function input(c, r, isNew) {
    var v = r[c.k], name = ' data-f="' + c.k + '"';
    if (c.calc || c.ro || (c.createOnly && !isNew)) return view(c, r);
    if (c.type === "month") return '<input type="month"' + name + ' value="' + esc(v || "") + '">';
    if (c.type === "num") return '<input class="tt-num" inputmode="decimal"' + name + ' value="' + (isNum(v) ? esc(v) : "") + '">';
    if (c.type === "bool") return '<select' + name + '><option value="1"' + (v !== 0 ? " selected" : "") + ">" + esc(c.yes) + '</option><option value="0"' + (v === 0 ? " selected" : "") + ">" + esc(c.no) + "</option></select>";
    if (c.type === "select") return "<select" + name + ">" + c.options.map(function (o) { return "<option" + (o === (v || "") ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
    if (c.type === "trader") {
      var own = state.tool === "traders" ? r.id : null;
      return "<select" + name + '><option value="">' + (state.tool === "traders" ? "— none (own salary) —" : "— none —") + "</option>" +
        (state.data.traders || []).filter(function (t) { return t.id !== own; }).map(function (t) { return '<option value="' + t.id + '"' + (t.id === v ? " selected" : "") + ">" + esc(t.name) + (t.active ? "" : " (inactive)") + "</option>"; }).join("") + "</select>";
    }
    if (c.type === "licences") {
      var ids = licIds(r.id);
      return '<div class="st-checks">' + state.data.licences.map(function (l) {
        return '<label><input type="checkbox" data-lic="' + l.id + '"' + (ids.indexOf(l.id) >= 0 ? " checked" : "") + "> " + esc(l.name) + ' <small class="tt-dim">' + fmt(l.price) + "</small></label>";
      }).join("") + "</div>";
    }
    return '<input' + name + ' value="' + esc(v || "") + '">';
  }

  function editRow(t, r, isNew) {
    return '<tr class="st-edit">' + t.cols.map(function (c) { return '<td class="' + (c.num ? "num" : "") + '">' + input(c, r, isNew) + "</td>"; }).join("") + "<td></td></tr>" +
      '<tr class="st-edit st-edit--foot"><td colspan="' + (t.cols.length + 1) + '"><div class="st-commit">' +
      '<label class="tt-f st-comment"><span>Comment (required): why is this ' + (isNew ? "being added" : "changing") + '?</span><input data-comment maxlength="500" placeholder="e.g. New deposit received on 12 Nov"></label>' +
      '<button type="button" class="btn btn--gold btn--sm" data-st="save" data-key="' + esc(isNew ? "" : r[t.key]) + '">' + (isNew ? "Add" : "Save") + "</button>" +
      '<button type="button" class="btn btn--line btn--sm" data-st="cancel">Cancel</button></div></td></tr>';
  }

  /* ---------------------------------------------------------------- actions */
  $("stBody").addEventListener("click", function (e) {
    var s = e.target.closest("[data-stmt]");
    if (s) { if (window.BOTally) window.BOTally.statement(+s.getAttribute("data-stmt")); return; }
    var b = e.target.closest("[data-st]"); if (!b) return;
    var act = b.getAttribute("data-st"), key = b.getAttribute("data-key");
    if (act === "add") { state.adding = true; state.editing = null; render(); }
    if (act === "edit") { state.editing = key; state.adding = false; render(); }
    if (act === "cancel") { state.editing = null; state.adding = false; render(); }
    if (act === "save") save(key);
    if (act === "del") {
      var c = prompt("Delete this entry? Type a short reason (it is kept in the history):");
      if (c === null) return;
      BO().api("POST", "/api/setup/" + state.tool + "/" + encodeURIComponent(key) + "/delete", { comment: c })
        .then(function () { return load(); }).then(function () { render("Deleted.", "ok"); })
        .catch(function (err) { render(err.message, "err"); });
    }
  });
  $("stBody").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.closest(".st-edit") && e.target.tagName === "INPUT") {
      e.preventDefault();
      var btn = $("stBody").querySelector('[data-st="save"]'); if (btn) btn.click();
    }
    if (e.key === "Escape" && e.target.closest(".st-edit")) { state.editing = null; state.adding = false; render(); }
  });

  function save(key) {
    var t = tool(state.tool), body = $("stBody"), st = $("stStatus");
    var comment = (body.querySelector("[data-comment]") || {}).value || "";
    if (comment.trim().length < 3) { BO().status(st, "Add a short comment explaining the change.", "err"); body.querySelector("[data-comment]").focus(); return; }
    var data = {};
    body.querySelectorAll(".st-edit [data-f]").forEach(function (el) {
      var k = el.getAttribute("data-f"), c = t.cols.filter(function (x) { return x.k === k; })[0];
      var v = el.value;
      if (c.type === "num") { var n = num(v); data[k] = n === null ? "" : n; }
      else if (c.type === "bool") data[k] = v === "1";
      else if (c.type === "trader") data[k] = v ? +v : null;
      else data[k] = v.trim();
    });
    var isNew = !key, url = "/api/setup/" + state.tool;
    var jobs = [];
    if (isNew) jobs.push(function () { return BO().api("POST", url, { row: data, comment: comment }); });
    else {
      var row = state.data.rows.filter(function (r) { return String(r[t.key]) === String(key); })[0];
      var changed = Object.keys(data).some(function (k) { return String(row[k] == null ? "" : row[k]) !== String(data[k] === true ? 1 : data[k] === false ? 0 : data[k] == null ? "" : data[k]); });
      if (changed) jobs.push(function () { return BO().api("PATCH", url + "/" + encodeURIComponent(key), { changes: data, comment: comment }); });
      if (t.id === "greek") {
        var ids = Array.prototype.map.call(body.querySelectorAll(".st-edit [data-lic]:checked"), function (x) { return +x.getAttribute("data-lic"); });
        var cur = licIds(+key);
        if (ids.length !== cur.length || ids.some(function (i) { return cur.indexOf(i) < 0; }))
          jobs.push(function () { return BO().api("PUT", url + "/" + key + "/licences", { licence_ids: ids, comment: comment }); });
      }
      if (!jobs.length) { BO().status(st, "Nothing changed.", "err"); return; }
    }
    BO().status(st, "Saving…");
    jobs.reduce(function (p, f) { return p.then(f); }, Promise.resolve())
      .then(function () { state.editing = null; state.adding = false; return load(); })
      .then(function () { render("Saved. The change and your comment are in the history below.", "ok"); })
      .catch(function (err) { BO().status($("stStatus"), err.message, "err"); });
  }

  window.BOSetup = { open: open };
})();
