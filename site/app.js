// RecipeLog — site vitrine : onglets, multiplicateur à essayer, aide, lien de la démo.
(function () {
  "use strict";

  // ── Lien de la démo (config.js écrit par l'installateur) ──
  var demoUrl = (window.VITRINE && window.VITRINE.demoUrl) || "";
  document.querySelectorAll("[data-demo]").forEach(function (a) {
    if (demoUrl) {
      a.href = demoUrl;
      a.target = "_blank";
      a.rel = "noopener";
    }
  });
  var missing = document.getElementById("demo-missing");
  if (missing && !demoUrl) missing.hidden = false;

  // ── Commande d'installation ──
  var cmdUrl = window.VITRINE && window.VITRINE.installCmd;
  if (cmdUrl) document.getElementById("install-cmd").textContent = cmdUrl;

  // ── Onglets des fonctions ──
  var tabs = document.querySelectorAll("[data-tab]");
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabs.forEach(function (b) { b.classList.toggle("on", b === btn); });
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.toggle("on", p.id === btn.dataset.tab);
      });
    });
  });

  // ── Multiplicateur à essayer ──
  var BASE = [
    { name: "Lait entier", g: 250 },
    { name: "Eau", g: 250 },
    { name: "Beurre", g: 225 },
    { name: "Sel", g: 5 },
    { name: "Sucre semoule", g: 10 },
    { name: "Farine T55", g: 275 },
    { name: "Œufs entiers", g: 450, piece: 50 },
  ];
  var BASE_MASS = BASE.reduce(function (s, i) { return s + i.g; }, 0);
  var BASE_YIELD = 60; // choux
  var mode = "coef";
  var input = document.getElementById("calc-input");
  var label = document.getElementById("calc-label");
  var unit = document.getElementById("calc-unit");
  var list = document.getElementById("calc-list");
  var MODES = {
    coef: { label: "Coefficient", unit: "×", value: 1, step: 0.1 },
    masse: { label: "Masse voulue", unit: "g", value: 1000, step: 50 },
    pieces: { label: "Nombre de choux", unit: "pc", value: 100, step: 10 },
  };

  function fmt(n, d) {
    return n.toLocaleString("fr-FR", { maximumFractionDigits: d || 0, minimumFractionDigits: 0 });
  }

  function coef() {
    var v = parseFloat(String(input.value).replace(",", "."));
    if (!(v > 0)) return 0;
    if (mode === "masse") return v / BASE_MASS;
    if (mode === "pieces") return v / BASE_YIELD;
    return v;
  }

  var prev = {};
  function render() {
    var k = coef();
    list.innerHTML = "";
    var total = 0;
    BASE.forEach(function (i) {
      var g = i.g * k;
      total += g;
      var txt = i.piece ? fmt(Math.max(Math.round(g / i.piece), k > 0 ? 1 : 0)) + " pc · " + fmt(g) + " g" : fmt(g, g < 10 ? 1 : 0) + " g";
      var li = document.createElement("li");
      var s = document.createElement("span");
      s.textContent = i.name;
      var b = document.createElement("b");
      b.textContent = k > 0 ? txt : "–";
      if (prev[i.name] !== undefined && prev[i.name] !== b.textContent) {
        b.classList.add("flash");
        setTimeout(function () { b.classList.remove("flash"); }, 350);
      }
      prev[i.name] = b.textContent;
      li.appendChild(s);
      li.appendChild(b);
      list.appendChild(li);
    });
    document.getElementById("calc-total").textContent = k > 0 ? fmt(total) + " g (×" + fmt(k, 2) + ")" : "–";
    document.getElementById("calc-yield").textContent = k > 0 ? fmt(BASE_YIELD * k) + " choux" : "–";
  }

  document.querySelectorAll("[data-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      mode = btn.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach(function (b) { b.classList.toggle("on", b === btn); });
      var m = MODES[mode];
      label.textContent = m.label;
      unit.textContent = m.unit;
      input.step = m.step;
      input.value = m.value;
      render();
    });
  });
  input.addEventListener("input", render);
  render();

  // ── Aide « ? » : ne se ferme qu'avec la croix (ou Échap) ──
  var openPop = null;
  document.querySelectorAll("[data-help]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pop = document.getElementById(btn.dataset.help);
      if (!pop) return;
      pop.hidden = false;
      openPop = pop;
      var x = pop.querySelector("[data-close]");
      if (x) x.focus();
    });
  });
  document.querySelectorAll("[data-close]").forEach(function (x) {
    x.addEventListener("click", function () {
      var pop = x.closest(".pop");
      if (pop) pop.hidden = true;
      openPop = null;
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openPop) {
      openPop.hidden = true;
      openPop = null;
    }
  });

  // ── Copier la commande ──
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = document.getElementById(btn.dataset.copy).textContent;
      var done = function () {
        btn.textContent = "Copié";
        setTimeout(function () { btn.textContent = "Copier"; }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });

  // ── Apparition au défilement ──
  var els = document.querySelectorAll(".feat, .step, .split > *, .try-in > *, .demo-in, .stats-in > div");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("seen");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { el.classList.add("reveal"); io.observe(el); });
  }
})();
