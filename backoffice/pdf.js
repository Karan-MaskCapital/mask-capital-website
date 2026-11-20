/* Tally package: per-trader "GRD Trader Sheet" PDFs, named like the Google Sheet
 * ("2026-1000 - Manthan Rathod - GRD Trader Sheet.pdf"), and a ZIP of all of them. */
(function () {
  "use strict";
  var LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  ];
  var ready = null;
  function loadLibs() {
    if (ready) return ready;
    ready = LIBS.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (res, rej) {
          var s = document.createElement("script"); s.src = src; s.onload = res;
          s.onerror = function () { ready = null; rej(new Error("Could not load the PDF tools. Check your internet connection.")); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
    return ready;
  }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function N(v) { return v === null || v === undefined || v === "" || isNaN(+v) ? 0 : +v; }
  function has(v) { return v !== null && v !== undefined && v !== "" && !isNaN(+v); }
  function f(v) {
    if (!has(v)) return "";
    var n = +v, s = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return (n < 0 ? "-" : "") + s;
  }
  /* Google Sheets TEXT(date, "YYYY-MM00") -> "2026-1000" (kept exactly as the sheet names files) */
  function sheetDate(month) { return month.slice(0, 4) + "-" + month.slice(5, 7) + "00"; }
  function safe(s) { return String(s).replace(/[\\/:*?"<>|]+/g, "-").trim(); }
  function fileName(month, name) { return sheetDate(month) + " - " + safe(name) + " - GRD Trader Sheet.pdf"; }

  var NAVY = [9, 23, 37], GOLD = [197, 164, 109], INK = [29, 41, 52], GREY = [110, 122, 132];

  function traderSheet(e, monthRow) {
    var month = monthRow.month, p = month.split("-");
    var doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    var W = doc.internal.pageSize.getWidth(), M = 40;

    // header band
    doc.setFillColor.apply(doc, NAVY); doc.rect(0, 0, W, 64, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(sheetDate(month) + " - " + e.name + " - GRD Trader Sheet", M, 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor.apply(doc, GOLD);
    doc.text("MASK CAPITAL MANAGEMENT  ·  BACK OFFICE", M, 48);
    doc.text(MONTHS[+p[1] - 1].toUpperCase() + " " + p[0], W - M, 48, { align: "right" });

    // parties line, as on the sheet
    doc.setTextColor.apply(doc, INK); doc.setFontSize(10);
    doc.setFont("helvetica", "bold"); doc.text("Jayesh Mehta", M, 92);
    doc.text("GRD", W - M, 92, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setTextColor.apply(doc, GREY);
    doc.text("Trader: " + e.name + "   ·   Trader share " + f(e.trader_pct) + "%   ·   Salary " + f(e.salary), M, 108);
    if (monthRow.status !== "final") {
      doc.setTextColor(176, 0, 32); doc.setFont("helvetica", "bold");
      doc.text("DRAFT - not finalised", W - M, 108, { align: "right" });
    }

    var other = N(e.facility) + N(e.technical);
    doc.autoTable({
      startY: 122, margin: { left: M, right: M },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5, halign: "right", textColor: INK, lineColor: [200, 205, 210], lineWidth: 0.5 },
      headStyles: { fillColor: [20, 40, 58], textColor: 255, halign: "center", fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { halign: "left" } },
      head: [
        [{ content: "Month", rowSpan: 2 }, { content: "NSE", colSpan: 4 }, { content: "BSE", colSpan: 1 },
          { content: "Interest", rowSpan: 2 }, { content: "Greek Costs", rowSpan: 2 }, { content: "Other Costs", rowSpan: 2 },
          { content: "Salary Carry Forward", rowSpan: 2 }, { content: "NET Payable", colSpan: 3 }],
        ["Gross Sheet", "Loss Carry Forward", "Gross (C.F)", "NET", "Gross Sheet", "Net Payable", "Salary", "Incentive"],
      ],
      body: [[
        MONTHS[+p[1] - 1].slice(0, 3) + " " + p[0],
        f(e.gross), f(e.loss_cf), f(N(e.gross) + N(e.loss_cf)), f(e.nse_net), f(e.bse_net),
        f(e.interest), f(e.greek), other ? f(other) : "", f(e.salary_cf),
        f(e.payable), f(e.salary), e.linked_to ? "" : f(N(e.salary) > 0 ? e.incentive : e.prof_fees),
      ]],
    });

    // calculation, line by line
    var y = doc.lastAutoTable.finalY + 26;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor.apply(doc, INK);
    doc.text("How this is worked out", M, y); y += 8;
    var lines = [];
    if (e.legacy) lines.push(["NSE NET (as recorded)", e.nse_net]);
    else {
      lines.push(["NSE gross before interest", e.gross]);
      if (N(e.loss_cf)) lines.push(["+ Loss carried forward", e.loss_cf]);
      var minApplies = has(e.min_interest) && N(e.min_interest) > N(e.grd_interest);
      lines.push(["- Interest" + (has(e.min_interest) ? (minApplies ? " (minimum; GRD charged " + f(e.grd_interest || 0) + ")" : " (GRD)") : ""), e.interest]);
      lines.push(["- Greek costs", e.greek]);
      if (other) lines.push(["- Other costs (facility + technical)", other]);
    }
    if (N(e.bse_net)) lines.push(["+ BSE NET", e.bse_net]);
    lines.push(["= NET", e.net_total, true]);
    if (N(e.net_total) > 0) lines.push(["x Trader share " + f(e.trader_pct) + "%", Math.round(N(e.net_total) * N(e.trader_pct)) / 100]);
    if (N(e.salary_cf)) lines.push(["+ Salary carried forward", e.salary_cf]);
    if (N(e.adjustment)) lines.push(["+ Adjustment", e.adjustment]);
    lines.push(["= Net payable", e.payable, true]);
    if (!e.linked_to) {
      if (N(e.salary) > 0) { lines.push(["- Salary", e.salary]); lines.push(["= Incentive", e.incentive, true]); }
      else lines.push(["= Professional fees", e.prof_fees, true]);
    }
    doc.autoTable({
      startY: y, margin: { left: M }, tableWidth: 360, theme: "plain",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 3, textColor: INK },
      columnStyles: { 1: { halign: "right" } },
      body: lines.map(function (l) { return [l[0], f(l[1])]; }),
      didParseCell: function (d) { if (lines[d.row.index] && lines[d.row.index][2]) { d.cell.styles.fontStyle = "bold"; d.cell.styles.lineWidth = { top: 0.6 }; d.cell.styles.lineColor = [150, 150, 150]; } },
    });
    if (e.note) {
      var ny = doc.lastAutoTable.finalY + 14;
      doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor.apply(doc, GREY);
      doc.text("Note: " + e.note, M, ny, { maxWidth: W - 2 * M });
    }

    // footer
    var H = doc.internal.pageSize.getHeight();
    doc.setDrawColor.apply(doc, GOLD); doc.setLineWidth(0.8); doc.line(M, H - 34, W - M, H - 34);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor.apply(doc, GREY);
    doc.text("Generated " + new Date().toLocaleString("en-IN") + " from the MASK Capital back office. Amounts in INR.", M, H - 20);
    return { name: fileName(month, e.name), blob: doc.output("blob") };
  }

  /* ---------------------------------------------------------------- month reports
   * The three exports from the GRD_coordination sheet buttons, for one month:
   *   "YYYY-MM00 - GRD Tally - JM"   every column
   *   "YYYY-MM00 - GRD Tally - MG"   without trader %, prof. fees, cash and Jayesh Mehta columns
   *   "YYYY-MM00 - GRD Trader Pay"   up to Incentive, without trader %, leaving out negative incentives */
  var COLS = {
    month:   { h: "Year", w: 64, l: true },
    account: { h: "Account", w: 78, l: true },
    gross:   { h: "NSE Gross", sum: true },
    loss_cf: { h: "Loss Carry Forward", sum: true },
    gross_cf:{ h: "NSE Gross (C.F.)", sum: true },
    nse_net: { h: "NSE NET", sum: true },
    bse_net: { h: "BSE NET", sum: true },
    net:     { h: "NET Total Payable", sum: true },
    tpct:    { h: "Trader Pay (%)", pct: true },
    sal_cf:  { h: "Salary Carry Forward", sum: true },
    payable: { h: "Total Payable", sum: true },
    salary:  { h: "Salary (INR)", sum: true },
    incent:  { h: "Incentive (INR)", sum: true },
    fees:    { h: "Professional Fees (INR)", sum: true },
    cash:    { h: "Cash Received", c: true },
    jm80:    { h: "80% less payable", sum: true },
    jm:      { h: "Jayesh Mehta (INR)", sum: true },
    jmpct:   { h: "Jayesh Mehta (%)", pct: true },
    jmrun:   { h: "JM Running Total (INR)" },
    mg:      { h: "MG (INR)", sum: true },
    mgpct:   { h: "MG (%)", pct: true },
    mgrun:   { h: "MG Running Total (INR)" },
  };
  var BASE = ["month", "account", "gross", "loss_cf", "gross_cf", "nse_net", "bse_net", "net"];
  var REPORTS = {
    jm: { title: "GRD Tally - JM", cols: BASE.concat(["tpct", "sal_cf", "payable", "salary", "incent", "fees", "cash", "jm80", "jm", "jmpct", "jmrun", "mg", "mgpct", "mgrun"]) },
    mg: { title: "GRD Tally - MG", cols: BASE.concat(["sal_cf", "payable", "salary", "incent", "mg", "mgpct", "mgrun"]) },
    pay: { title: "GRD Trader Pay", cols: BASE.concat(["sal_cf", "payable", "salary", "incent"]), skipNegative: true },
  };

  /** one GRD_coordination row per entry, as the sheet shows it */
  function coordRows(entries, monthRow, running) {
    var p = monthRow.month.split("-"), label = p[0] + " - " + MONTHS[+p[1] - 1];
    var rows = entries.map(function (e) {
      var net = N(e.net_total), salary = N(e.salary), incent, fees = "";
      if (e.linked_to) incent = 0;
      else if (salary > 0) incent = e.incentive;
      else if (N(e.prof_fees) > 0) { incent = 0; fees = e.prof_fees; }
      else incent = has(e.prof_fees) ? e.prof_fees : e.payable;
      return {
        month: label, account: e.name,
        gross: e.gross, loss_cf: e.loss_cf, gross_cf: N(e.gross) + N(e.loss_cf),
        nse_net: e.nse_net, bse_net: e.bse_net, net: e.net_total, tpct: e.trader_pct,
        sal_cf: e.salary_cf, payable: e.payable, salary: e.salary, incent: incent, fees: fees,
        cash: e.cash_received ? "Yes" : "No",
        jm80: Math.round((net * N(e.jm_pct) / 100 - N(e.payable)) * 100) / 100,
        jm: net > 0 ? e.jm_share : "", jmpct: e.jm_pct, mg: net > 0 ? e.mg_share : "", mgpct: e.mg_pct,
      };
    });
    // running totals, newest at the top as on the sheet: each row = everything up to and including it
    var jm = N(running && running.jm), mg = N(running && running.mg);
    for (var i = rows.length - 1; i >= 0; i--) {
      jm += N(rows[i].jm); mg += N(rows[i].mg);
      rows[i].jmrun = Math.round(jm * 100) / 100; rows[i].mgrun = Math.round(mg * 100) / 100;
    }
    return rows;
  }

  function reportPdf(kind, entries, monthRow, running) {
    var R = REPORTS[kind], month = monthRow.month, p = month.split("-");
    var rows = coordRows(entries, monthRow, running), skipped = 0;
    if (R.skipNegative) rows = rows.filter(function (r) { var neg = has(r.incent) && +r.incent < 0; if (neg) skipped++; return !neg; });
    var title = sheetDate(month) + " - " + R.title;
    var doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 28;

    doc.setFillColor.apply(doc, NAVY); doc.rect(0, 0, W, 56, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(title, M, 27);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GOLD);
    doc.text("MASK CAPITAL MANAGEMENT  ·  BACK OFFICE  ·  GRD COORDINATION", M, 43);
    doc.text(MONTHS[+p[1] - 1].toUpperCase() + " " + p[0], W - M, 43, { align: "right" });
    if (monthRow.status !== "final") {
      doc.setTextColor(176, 0, 32); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text("DRAFT - not finalised", W - M, 72, { align: "right" });
    }

    var cols = R.cols.map(function (k) { return COLS[k]; });
    function cellText(c, v) { return c.l || c.c ? (v == null ? "" : String(v)) : c.pct ? (has(v) ? f(v) + "%" : "") : f(v); }
    var body = rows.map(function (r) { return R.cols.map(function (k) { return cellText(COLS[k], r[k]); }); });
    var foot = [R.cols.map(function (k, i) {
      if (i === 0) return "Total";
      if (!COLS[k].sum) return "";
      return f(Math.round(rows.reduce(function (a, r) { return a + N(r[k]); }, 0) * 100) / 100);
    })];
    var colStyles = {};
    cols.forEach(function (c, i) { colStyles[i] = { halign: c.l ? "left" : c.c ? "center" : "right" }; if (c.w) colStyles[i].cellWidth = c.w; });
    doc.autoTable({
      startY: 80, margin: { left: M, right: M }, theme: "grid",
      styles: { font: "helvetica", fontSize: cols.length > 16 ? 6.3 : 7.5, cellPadding: 3, textColor: INK, lineColor: [200, 205, 210], lineWidth: 0.4, overflow: "linebreak" },
      headStyles: { fillColor: [20, 40, 58], textColor: 255, halign: "center", valign: "middle", fontStyle: "bold" },
      footStyles: { fillColor: [238, 232, 220], textColor: INK, fontStyle: "bold", halign: "right" },
      columnStyles: colStyles,
      head: [cols.map(function (c) { return c.h; })], body: body, foot: foot,
      didParseCell: function (d) {
        if (d.section === "body" && typeof d.cell.raw === "string" && d.cell.raw.charAt(0) === "-" && d.cell.raw.length > 1) d.cell.styles.textColor = [176, 0, 32];
      },
    });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY);
    if (skipped) doc.text(skipped + " trader" + (skipped > 1 ? "s" : "") + " with a negative incentive not shown.", M, doc.lastAutoTable.finalY + 14);
    doc.text("Generated " + new Date().toLocaleString("en-IN") + " from the MASK Capital back office. Amounts in INR.", M, H - 16);
    return { name: title + ".pdf", blob: doc.output("blob") };
  }

  function download(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  window.BOPdf = {
    fileName: fileName,
    /** one trader's sheet */
    trader: function (entry, monthRow) {
      return loadLibs().then(function () { var r = traderSheet(entry, monthRow); download(r.blob, r.name); return r.name; });
    },
    /** every trader in the month, in one ZIP */
    month: function (entries, monthRow) {
      return loadLibs().then(function () {
        var zip = new window.JSZip();
        entries.forEach(function (e) { var r = traderSheet(e, monthRow); zip.file(r.name, r.blob); });
        return zip.generateAsync({ type: "blob" }).then(function (blob) {
          var name = sheetDate(monthRow.month) + " - GRD Trader Sheets.zip";
          download(blob, name); return { name: name, count: entries.length };
        });
      });
    },
    /** kind: "jm" | "mg" | "pay" */
    report: function (kind, entries, monthRow, running) {
      return loadLibs().then(function () { var r = reportPdf(kind, entries, monthRow, running); download(r.blob, r.name); return r.name; });
    },
    /** the whole monthly package: the 3 reports + every trader sheet */
    pack: function (entries, monthRow, running) {
      return loadLibs().then(function () {
        var zip = new window.JSZip(), n = 0;
        ["jm", "mg", "pay"].forEach(function (k) { var r = reportPdf(k, entries, monthRow, running); zip.file(r.name, r.blob); n++; });
        entries.forEach(function (e) { var r = traderSheet(e, monthRow); zip.file(r.name, r.blob); n++; });
        return zip.generateAsync({ type: "blob" }).then(function (blob) {
          var name = sheetDate(monthRow.month) + " - GRD Monthly Package.zip";
          download(blob, name); return { name: name, count: n };
        });
      });
    },
    _rows: coordRows,
  };
})();
