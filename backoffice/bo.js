(function () {
  "use strict";
  var API = String(window.MASK_API_URL || "").replace(/\/+$/, "");
  var TOKEN_KEY = "mask_bo_token";

  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function status(el, msg, kind) { el.className = "form__status" + (kind ? " " + kind : ""); el.textContent = msg || ""; }

  function api(method, path, body) {
    if (!API) return Promise.reject(new Error("The back office is being set up. Please try again later."));
    var headers = { "Content-Type": "application/json" };
    var t = getToken(); if (t) headers.Authorization = "Bearer " + t;
    return fetch(API + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .catch(function () { throw new Error("Could not reach the server. Check your connection."); })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false, error: "Unexpected server response." }; }).then(function (j) {
          if (!r.ok || !j.ok) {
            var err = new Error(j.error || "Request failed."); err.code = j.code; err.status = r.status;
            if (r.status === 401 && path !== "/api/login") { setToken(null); location.replace("index.html?expired=1"); }
            throw err;
          }
          return j;
        });
      });
  }

  /* ================= Sign-in page ================= */
  var loginForm = $("loginForm");
  if (loginForm) {
    var ls = $("loginStatus");
    if (/expired=1/.test(location.search)) status(ls, "Your session ended. Please sign in again.");
    if (getToken()) api("GET", "/api/me").then(function () { location.replace("portal.html?r=" + Date.now()); }).catch(function () {});
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var u = $("username").value.trim(), p = $("password").value;
      if (!u || !p) { status(ls, "Enter your username and password.", "err"); return; }
      var btn = loginForm.querySelector("button"); btn.disabled = true;
      status(ls, "Signing in…");
      api("POST", "/api/login", { username: u, password: p })
        .then(function (j) { setToken(j.token); location.replace("portal.html?r=" + Date.now()); })
        .catch(function (err) { status(ls, err.message, "err"); btn.disabled = false; $("password").select(); });
    });
    return;
  }

  /* ================= Portal ================= */
  if (!document.body.classList.contains("bo-app")) return;
  if (!getToken()) { location.replace("index.html"); return; }

  var me = null;
  var views = document.querySelectorAll(".bo-view");
  var navBtns = document.querySelectorAll(".bo-nav button");

  function show(name) {
    var sub = String(name || "").split("/"); name = sub[0]; sub = sub[1] || "";
    if (!document.querySelector('.bo-view[data-view="' + name + '"]')) name = "overview";
    if (me && me.must_change) name = "account";
    if (me && me.role !== "admin" && (name === "users" || name === "audit")) name = "overview";
    views.forEach(function (v) { v.hidden = v.getAttribute("data-view") !== name; });
    navBtns.forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-view") === name); });
    if (name === "users") loadUsers();
    if (name === "audit") loadAudit();
    try { history.replaceState(null, "", "#" + name + (name === "tally" && sub ? "/" + sub : "")); } catch (e) {}
    if (name === "tally" && window.BOTally) window.BOTally.open(sub);
    if (name === "overview" && window.BOLedger && !(me && me.must_change)) window.BOLedger.home();
    $("main").focus && $("main").scrollTo && $("main").scrollTo(0, 0);
  }

  navBtns.forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-view")); }); });
  document.querySelectorAll("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-goto")); }); });
  // Overview shortcuts and dashboard tiles (data-go="months" | "ledger" | "trader:5" | "2026-11" | "" = months)
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".bo-view[data-view=overview] [data-go]"); if (!b) return;
    e.preventDefault();
    show("tally/" + (b.getAttribute("data-go") || "months"));
  });

  $("logoutBtn").addEventListener("click", function () {
    api("POST", "/api/logout").catch(function () {}).then(function () { setToken(null); location.replace("index.html"); });
  });

  function applyMe(u) {
    me = u;
    $("whoName").textContent = u.name || u.username;
    $("whoRole").textContent = u.role;
    $("welcomeName").textContent = u.name || u.username;
    document.querySelectorAll("[data-admin]").forEach(function (el) { el.hidden = u.role !== "admin"; });
    $("mustChange").hidden = !u.must_change;
    document.querySelector(".bo-nav").classList.toggle("is-locked", !!u.must_change);
  }

  api("GET", "/api/me").then(function (j) {
    applyMe(j.user);
    document.body.hidden = false;
    show((location.hash || "#overview").slice(1));
  }).catch(function () {});

  window.BO = { api: api, esc: esc, status: status, me: function () { return me; }, show: show };

  /* ----- phones: label every cell with its column heading so tables can show as cards ----- */
  function labelTables() {
    document.querySelectorAll("table.tt-table").forEach(function (tbl) {
      if (!tbl.tHead || !tbl.tHead.rows[0]) return;
      var heads = [];
      Array.prototype.forEach.call(tbl.tHead.rows[0].cells, function (th) {
        var tmp = document.createElement("div");
        tmp.innerHTML = th.innerHTML.replace(/<br\s*\/?>/gi, " ");
        var t = tmp.textContent.replace(/\s+/g, " ").trim();
        for (var i = 0; i < (th.colSpan || 1); i++) heads.push(t);
      });
      var sections = Array.prototype.slice.call(tbl.tBodies);
      if (tbl.tFoot) sections.push(tbl.tFoot);
      sections.forEach(function (sec) {
        Array.prototype.forEach.call(sec.rows, function (tr) {
          var idx = 0;
          Array.prototype.forEach.call(tr.cells, function (td) {
            var span = td.colSpan || 1;
            if (span === 1 && heads[idx]) td.setAttribute("data-label", heads[idx]); else td.removeAttribute("data-label");
            idx += span;
          });
        });
      });
    });
  }
  var labelQueued = false;
  new MutationObserver(function () {
    if (labelQueued) return;
    labelQueued = true;
    requestAnimationFrame(function () { labelQueued = false; labelTables(); });
  }).observe(document.body, { childList: true, subtree: true });

  /* ----- change password ----- */
  $("pwForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("pwStatus"), cur = $("pw-current").value, nw = $("pw-new").value, cf = $("pw-confirm").value;
    if (!cur || !nw) return status(st, "Fill in all fields.", "err");
    if (nw.length < 8) return status(st, "New password must be at least 8 characters.", "err");
    if (nw !== cf) return status(st, "New passwords do not match.", "err");
    status(st, "Saving…");
    api("POST", "/api/password", { current: cur, next: nw }).then(function () {
      e.target.reset();
      status(st, "Password updated.", "ok");
      if (me.must_change) { me.must_change = false; applyMe(me); setTimeout(function () { show("overview"); }, 900); }
    }).catch(function (err) { status(st, err.message, "err"); });
  });

  /* ----- users ----- */
  var usersCache = [];
  function loadUsers() {
    var body = $("usersBody");
    api("GET", "/api/users").then(function (j) {
      usersCache = j.users;
      body.innerHTML = j.users.map(function (u) {
        var self = u.username === me.username;
        return "<tr" + (u.active ? "" : ' class="is-off"') + ">" +
          "<td>" + esc(u.name || "–") + "</td>" +
          "<td class=\"mono\">" + esc(u.username) + "</td>" +
          "<td><select data-act=\"role\" data-u=\"" + esc(u.username) + "\"" + (self ? " disabled" : "") + ">" +
            ["staff", "admin"].map(function (r) { return "<option" + (r === u.role ? " selected" : "") + ">" + r + "</option>"; }).join("") +
          "</select></td>" +
          "<td>" + (u.active ? (u.must_change ? '<span class="bo-pill bo-pill--warn">Temp password</span>' : '<span class="bo-pill">Active</span>') : '<span class="bo-pill bo-pill--off">Disabled</span>') + "</td>" +
          "<td>" + esc(u.last_login || "Never") + "</td>" +
          "<td class=\"bo-row-actions\">" +
            '<button type="button" class="bo-link" data-act="reset" data-u="' + esc(u.username) + '">Reset password</button>' +
            (self ? "" : '<button type="button" class="bo-link" data-act="toggle" data-u="' + esc(u.username) + '">' + (u.active ? "Disable" : "Enable") + "</button>") +
          "</td></tr>";
      }).join("") || '<tr><td colspan="6">No users.</td></tr>';
    }).catch(function (err) { body.innerHTML = '<tr><td colspan="6">' + esc(err.message) + "</td></tr>"; });
  }

  $("usersBody").addEventListener("change", function (e) {
    var el = e.target; if (el.getAttribute("data-act") !== "role") return;
    var u = el.getAttribute("data-u");
    api("PATCH", "/api/users/" + encodeURIComponent(u), { role: el.value })
      .then(function () { status($("usersStatus"), "Role updated for " + u + ".", "ok"); loadUsers(); })
      .catch(function (err) { status($("usersStatus"), err.message, "err"); loadUsers(); });
  });

  $("usersBody").addEventListener("click", function (e) {
    var el = e.target.closest("button[data-act]"); if (!el) return;
    var u = el.getAttribute("data-u"), act = el.getAttribute("data-act"), st = $("usersStatus");
    if (act === "toggle") {
      var user = usersCache.filter(function (x) { return x.username === u; })[0];
      if (!confirm((user.active ? "Disable " : "Enable ") + u + "?")) return;
      api("PATCH", "/api/users/" + encodeURIComponent(u), { active: !user.active })
        .then(function () { status(st, (user.active ? "Disabled " : "Enabled ") + u + ".", "ok"); loadUsers(); })
        .catch(function (err) { status(st, err.message, "err"); });
    }
    if (act === "reset") {
      var pw = prompt("New temporary password for " + u + " (at least 8 characters). They must change it at next sign-in.");
      if (pw === null) return;
      api("POST", "/api/users/" + encodeURIComponent(u) + "/reset-password", { password: pw })
        .then(function () { status(st, "Temporary password set for " + u + ". Share it with them securely.", "ok"); loadUsers(); })
        .catch(function (err) { status(st, err.message, "err"); });
    }
  });

  var nuForm = $("newUserForm");
  $("newUserBtn").addEventListener("click", function () { nuForm.hidden = false; $("nu-name").focus(); });
  $("cancelNewUser").addEventListener("click", function () { nuForm.reset(); nuForm.hidden = true; status($("newUserStatus"), ""); });
  nuForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("newUserStatus");
    var data = { name: $("nu-name").value.trim(), username: $("nu-username").value.trim(), role: $("nu-role").value, password: $("nu-password").value };
    if (!data.name || !data.username || !data.password) return status(st, "Fill in all fields.", "err");
    status(st, "Creating…");
    api("POST", "/api/users", data).then(function () {
      nuForm.reset(); nuForm.hidden = true;
      status($("usersStatus"), "Created " + data.username + ". Share the temporary password with them securely.", "ok");
      status(st, "");
      loadUsers();
    }).catch(function (err) { status(st, err.message, "err"); });
  });

  /* ----- audit ----- */
  function loadAudit() {
    var body = $("auditBody");
    api("GET", "/api/audit").then(function (j) {
      body.innerHTML = j.entries.map(function (a) {
        return "<tr><td class=\"mono\">" + esc(a.ts) + " UTC</td><td>" + esc(a.actor) + "</td><td>" + esc(a.action.replace(/_/g, " ")) + "</td><td>" + esc(a.target) + "</td><td>" + esc(a.details) + "</td></tr>";
      }).join("") || '<tr><td colspan="5">No activity yet.</td></tr>';
    }).catch(function (err) { body.innerHTML = '<tr><td colspan="5">' + esc(err.message) + "</td></tr>"; });
  }
})();
