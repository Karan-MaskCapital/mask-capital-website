(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  var fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  var fmt4 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4, minimumFractionDigits: 4 });
  var fmt0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  function put(outId, k, text) { var el = $(outId).querySelector('[data-k="' + k + '"]'); if (el) el.textContent = text; }

  /* ---------- Black–Scholes ---------- */
  function normPdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
  function normCdf(x) { // Abramowitz–Stegun 7.1.26 via erf
    var s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return 0.5 * (1 + s * y);
  }
  function greeks() {
    var type = $("g-type").value, S = num("g-spot"), K = num("g-strike"), days = num("g-days");
    var vol = num("g-iv") / 100, r = num("g-rate") / 100;
    var keys = ["price", "delta", "gamma", "theta", "vega", "rho"];
    if (!(S > 0 && K > 0 && days >= 0 && vol > 0 && isFinite(r))) { keys.forEach(function (k) { put("greeksOut", k, "–"); }); return; }
    var T = Math.max(days, 1e-6) / 365, sq = Math.sqrt(T);
    var d1 = (Math.log(S / K) + (r + vol * vol / 2) * T) / (vol * sq), d2 = d1 - vol * sq;
    var disc = Math.exp(-r * T), call = type === "call";
    var price = call ? S * normCdf(d1) - K * disc * normCdf(d2) : K * disc * normCdf(-d2) - S * normCdf(-d1);
    var delta = call ? normCdf(d1) : normCdf(d1) - 1;
    var gamma = normPdf(d1) / (S * vol * sq);
    var thetaYr = -(S * normPdf(d1) * vol) / (2 * sq) + (call ? -r * K * disc * normCdf(d2) : r * K * disc * normCdf(-d2));
    var vega = S * normPdf(d1) * sq / 100;
    var rho = (call ? K * T * disc * normCdf(d2) : -K * T * disc * normCdf(-d2)) / 100;
    put("greeksOut", "price", fmt.format(price));
    put("greeksOut", "delta", fmt4.format(delta));
    put("greeksOut", "gamma", fmt4.format(gamma));
    put("greeksOut", "theta", fmt.format(thetaYr / 365));
    put("greeksOut", "vega", fmt.format(vega));
    put("greeksOut", "rho", fmt.format(rho));
  }

  /* ---------- Position sizing ---------- */
  function sizing() {
    var cap = num("s-capital"), risk = num("s-risk") / 100, entry = num("s-entry"), stop = num("s-stop"), lot = Math.max(1, Math.floor(num("s-lot") || 1));
    var keys = ["maxLoss", "perUnit", "qty", "lots", "deployed", "actualLoss"];
    var perUnit = Math.abs(entry - stop);
    if (!(cap > 0 && risk > 0 && entry > 0 && stop >= 0 && perUnit > 0)) { keys.forEach(function (k) { put("sizeOut", k, "–"); }); return; }
    var maxLoss = cap * risk;
    var lots = Math.floor(maxLoss / (perUnit * lot));
    var qty = lots * lot;
    put("sizeOut", "maxLoss", fmt.format(maxLoss));
    put("sizeOut", "perUnit", fmt.format(perUnit));
    put("sizeOut", "qty", fmt0.format(qty));
    put("sizeOut", "lots", fmt0.format(lots) + (lots === 0 ? " (stop too wide)" : ""));
    put("sizeOut", "deployed", fmt.format(qty * entry));
    put("sizeOut", "actualLoss", fmt.format(qty * perUnit));
  }

  ["greeksForm", "sizeForm"].forEach(function (id) {
    var f = $(id); if (!f) return;
    f.addEventListener("input", id === "greeksForm" ? greeks : sizing);
    f.addEventListener("submit", function (e) { e.preventDefault(); });
  });
  if ($("greeksForm")) greeks();
  if ($("sizeForm")) sizing();
})();
