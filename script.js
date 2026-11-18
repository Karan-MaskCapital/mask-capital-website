(function () {
  "use strict";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Nav ---------- */
  var nav = document.getElementById("nav");
  function onScroll() { nav.classList.toggle("is-scrolled", window.scrollY > 16); }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  function setMenu(open) {
    links.classList.toggle("is-open", open);
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.style.overflow = open ? "hidden" : "";
  }
  toggle.addEventListener("click", function () { setMenu(!links.classList.contains("is-open")); });
  links.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && links.classList.contains("is-open")) { setMenu(false); toggle.focus(); }
  });

  /* ---------- Reveal on scroll ---------- */
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
    items.forEach(function (el) {
      var sibs = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.classList.contains("reveal"); });
      el.style.transitionDelay = Math.min(sibs.indexOf(el), 5) * 70 + "ms";
      io.observe(el);
    });
  } else {
    items.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- Year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Hero line field (abstract, illustrative only) ---------- */
  var canvas = document.getElementById("field");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var w = 0, h = 0, dpr = 1, t = Math.random() * 100, running = true, raf = 0;
    var LINES = 26;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      var step = Math.max(6, w / 120);
      for (var i = 0; i < LINES; i++) {
        var p = i / (LINES - 1);
        var base = h * (0.12 + p * 0.8);
        var amp = h * (0.035 + 0.05 * Math.sin(p * Math.PI));
        var a = 0.1 + 0.42 * Math.pow(Math.sin(p * Math.PI), 2);
        ctx.beginPath();
        for (var x = 0; x <= w + step; x += step) {
          var u = x / w;
          var y = base
            + Math.sin(u * 3.1 + t * 0.35 + p * 2.2) * amp
            + Math.sin(u * 7.3 - t * 0.22 + p * 5.1) * amp * 0.35
            + Math.cos(u * 1.7 + t * 0.15 + p * 9.0) * amp * 0.6;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(197,164,109," + a.toFixed(3) + ")";
        ctx.lineWidth = i % 5 === 0 ? 1.3 : 0.8;
        ctx.stroke();
      }
    }
    function loop() {
      if (!running) return;
      t += 0.006;
      draw();
      raf = requestAnimationFrame(loop);
    }
    resize(); draw();
    window.addEventListener("resize", function () { resize(); draw(); });
    if (!reduceMotion) {
      raf = requestAnimationFrame(loop);
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (e) {
          var vis = e[0].isIntersecting;
          if (vis && !running) { running = true; raf = requestAnimationFrame(loop); }
          if (!vis) { running = false; cancelAnimationFrame(raf); }
        }).observe(canvas);
      }
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) { running = false; cancelAnimationFrame(raf); }
        else if (!running) { running = true; raf = requestAnimationFrame(loop); }
      });
    }
  }

  /* ---------- Contact form ---------- */
  var form = document.getElementById("contactForm");
  if (form) {
    var status = document.getElementById("formStatus");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.className = "form__status"; status.textContent = "";
      var invalid = [];
      form.querySelectorAll("[required]").forEach(function (f) {
        var bad = f.type === "checkbox" ? !f.checked : !f.value.trim() || (f.type === "email" && !/^\S+@\S+\.\S+$/.test(f.value));
        f.classList.toggle("is-invalid", bad);
        if (bad) invalid.push(f);
      });
      if (invalid.length) {
        status.classList.add("err");
        status.textContent = "Please complete the required fields.";
        invalid[0].focus();
        return;
      }
      if (form._honey && form._honey.value) return; // bot

      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      status.textContent = "Sending…";
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });

      fetch(form.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || String(j.success) !== "true") throw new Error(j.message || "Failed"); }); })
        .then(function () {
          form.reset();
          status.className = "form__status ok";
          status.textContent = "Thank you. Your message has been sent.";
        })
        .catch(function () {
          status.className = "form__status err";
          status.innerHTML = 'Sorry, something went wrong. Please email <a href="mailto:contact@mask-capital.com">contact@mask-capital.com</a>.';
        })
        .then(function () { btn.disabled = false; });
    });
  }
})();
