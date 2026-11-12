// RecipeLog — site vitrine : onglets, calcul de marge, aide, liens de la démo et du contact.
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

  // ── Contact (adresse e-mail réglée sur le serveur) ──
  var mail = (window.VITRINE && window.VITRINE.contactEmail) || "";
  if (mail) {
    var subject = encodeURIComponent("Démonstration RecipeLog");
    document.querySelectorAll("[data-contact]").forEach(function (a) {
      if (a.id === "contact-btn") a.href = "mailto:" + mail + "?subject=" + subject;
    });
    var shown = document.getElementById("contact-mail");
    if (shown) shown.textContent = mail;
  }
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

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

  // ── Calcul de la marge (financiers, 40 pièces) ──
  var RECETTE = [
    { g: 250, kg: null }, // beurre : prix réglable
    { g: 300, kg: 1.6 },  // sucre glace
    { g: 120, kg: 14.5 }, // poudre d'amande
    { g: 100, kg: 0.95 }, // farine
    { g: 240, kg: 4.2 },  // blancs
    { g: 30, kg: 8 },     // miel
  ];
  var RENDEMENT = 40;
  function num(id) {
    var v = parseFloat(String(document.getElementById(id).value).replace(",", "."));
    return isFinite(v) ? v : 0;
  }
  function eur(n, d) {
    return n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) + " €";
  }
  function setOut(id, txt, cls) {
    var el = document.getElementById(id);
    if (el.textContent !== txt) {
      el.textContent = txt;
      el.classList.add("flash");
      setTimeout(function () { el.classList.remove("flash"); }, 350);
    }
    el.classList.toggle("neg", cls === "neg");
  }
  function calcMarge() {
    var beurre = num("m-beurre");
    var pieces = Math.max(1, Math.round(num("m-pieces")));
    var prix = num("m-prix");
    var tva = parseFloat(document.getElementById("m-tva").value) / 100;
    var cout40 = RECETTE.reduce(function (s, i) { return s + (i.g / 1000) * (i.kg === null ? beurre : i.kg); }, 0);
    var parPiece = cout40 / RENDEMENT;
    var ht = prix / (1 + tva);
    var marge = ht - parPiece;
    var taux = ht > 0 ? Math.round((marge / ht) * 100) : 0;
    setOut("o-cout", eur(parPiece * pieces, 2));
    setOut("o-piece", eur(parPiece, 3));
    setOut("o-ht", eur(ht, 2));
    setOut("o-coef", parPiece > 0 ? "× " + (prix / parPiece).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "–");
    setOut("o-marge", eur(marge, 2) + " · " + taux + " %", marge < 0 ? "neg" : "");
    setOut("o-total", eur(marge * pieces, 2), marge < 0 ? "neg" : "");
  }
  ["m-prix", "m-tva", "m-beurre", "m-pieces"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", calcMarge);
    el.addEventListener("change", calcMarge);
  });
  if (document.getElementById("m-prix")) calcMarge();

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
  var els = document.querySelectorAll(".feat, .step, .split > *, .try-in > *, .offer-in > *, .demo-in, .contact, .stats-in > div");
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
