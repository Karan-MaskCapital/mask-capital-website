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
        f(e.gross), f(e.loss_cf), e.legacy ? "" : f(N(e.gross) + N(e.loss_cf)), f(e.nse_net), f(e.bse_net),
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
  };
})();
