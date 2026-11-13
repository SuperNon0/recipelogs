// RecipeLog — site vitrine : onglets, calcul de marge, aide, liens de la démo et du contact.
// Chargé après encre/encre.js (les deux en defer) : l'objet Encre est déjà là.
(function () {
  "use strict";

  // Animations coupées si l'utilisateur a demandé moins de mouvement : on montre l'état final.
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var hasIO = "IntersectionObserver" in window;
  var raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function (f) { return setTimeout(function () { f(Date.now()); }, 16); };
  var caf = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : clearTimeout;
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  // Nombres à la française (1 040 ; 6,01 ; -0,05) dans un texte : compteur et transition.
  var NUM = /-?\d+(?:[   ]\d{3})*(?:,\d+)?/g;
  function parseFr(s) { return parseFloat(s.replace(/[   ]/g, "").replace(",", ".")); }
  function decs(s) { var i = s.indexOf(","); return i < 0 ? 0 : s.length - i - 1; }
  function fmtFr(n, d) {
    return n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function tweenText(el, fromTxt, toTxt, dur, delay) {
    var from = fromTxt === null ? null : fromTxt.match(NUM);
    var to = toTxt.match(NUM);
    if (el._tw) caf(el._tw);
    clearTimeout(el._tt);
    el._tw = 0;
    if (reduce || !to || (fromTxt !== null && (!from || from.length !== to.length))) {
      el.textContent = toTxt;
      return;
    }
    function frame(p) {
      var k = 0;
      el.textContent = toTxt.replace(NUM, function (m) {
        var b = parseFr(m), a = from ? parseFr(from[k]) : 0;
        k++;
        return fmtFr(a + (b - a) * p, decs(m));
      });
    }
    frame(0);
    var t0 = 0;
    function step(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / dur);
      if (p < 1) { frame(ease(p)); el._tw = raf(step); }
      else { el.textContent = toTxt; el._tw = 0; }
    }
    el._tt = setTimeout(function () { el._tw = raf(step); }, delay || 0);
  }
  // Compteur depuis zéro, seulement sur un élément sans enfant (le texte d'origine revient à la fin).
  function countUp(el, dur, delay) {
    if (!el || el.children.length) return;
    tweenText(el, null, el.textContent, dur, delay);
  }

  // ── Lien de la démo (config.js écrit par l'installateur) ──
  var demoUrl = (window.VITRINE && window.VITRINE.demoUrl) || "";
  var demoLinks = Array.prototype.slice.call(document.querySelectorAll("[data-demo]"));
  document.querySelectorAll("template").forEach(function (t) {
    demoLinks = demoLinks.concat(Array.prototype.slice.call(t.content.querySelectorAll("[data-demo]")));
  });
  demoLinks.forEach(function (a) {
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
      tabs.forEach(function (b) {
        b.classList.toggle("on", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
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
    return n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) + " €";
  }
  function setOut(id, txt, cls) {
    var el = document.getElementById(id);
    var prev = el._to != null ? el._to : el.textContent;
    if (prev !== txt) {
      el._to = txt;
      tweenText(el, el.textContent, txt, 420);
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
    setOut("o-marge", eur(marge, 2) + " · " + taux + " %", marge < 0 ? "neg" : "");
    setOut("o-total", eur(marge * pieces, 2), marge < 0 ? "neg" : "");
    if (gauge) {
      var part = ht > 0 ? Math.max(0, Math.min(1, marge / ht)) : 0;
      gauge.firstChild.style.transform = "scaleX(" + part.toFixed(3) + ")";
      gauge.classList.toggle("neg", marge < 0);
    }
  }
  // Jauge décorative sous la marge : part de la marge (vert) face au coût matière (ambre) dans le prix HT.
  var gauge = null;
  var margeOut = document.getElementById("o-marge");
  if (margeOut && margeOut.parentNode) {
    gauge = document.createElement("span");
    gauge.className = "gauge";
    gauge.setAttribute("aria-hidden", "true");
    gauge.appendChild(document.createElement("i"));
    margeOut.parentNode.appendChild(gauge);
  }
  ["m-prix", "m-tva", "m-beurre", "m-pieces"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", calcMarge);
    el.addEventListener("change", calcMarge);
  });
  if (document.getElementById("m-prix")) calcMarge();

  // ── Fenêtres du design « encre » (feuille du bas sur téléphone, fenêtre au centre sur ordinateur) ──
  // Règle du site : une fenêtre ne se ferme qu'avec sa croix (ou Échap, ou le bouton retour du
  // téléphone), jamais en touchant à côté ni en la faisant glisser.
  document.addEventListener("click", function (e) {
    if (e.target.classList && e.target.classList.contains("voile")) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener("pointerdown", function (e) {
    var t = e.target.closest && e.target.closest(".feuille .grab, .feuille .feuille-t");
    if (t && !e.target.closest("button")) e.stopImmediatePropagation();
  }, true);

  function ouvrirModele(id, titre) {
    var tpl = document.getElementById(id);
    if (!tpl || !window.Encre) return null;
    var f = window.Encre.feuille({ titre: titre, html: tpl.innerHTML });
    if (window.Encre.apparence) window.Encre.apparence.marquer(f.el);
    return f;
  }
  function ouvrirApparence() {
    // Depuis la feuille « Plus » : on la referme d'abord.
    window.Encre.Couches.fermerTout().then(function () { ouvrirModele("apparence", "Apparence"); });
  }
  document.addEventListener("click", function (e) {
    var help = e.target.closest("[data-help]");
    if (help) { e.preventDefault(); ouvrirModele(help.dataset.help, "Le calcul de la marge"); return; }
    if (e.target.closest("[data-apparence]")) { e.preventDefault(); ouvrirApparence(); }
  });

  // Recherche rapide (Ctrl K, ⌘ K, « / » ou la loupe) : les sections du site.
  if (window.Encre && window.Encre.recherche) {
    window.Encre.recherche.placeholder = "Une section, une question…";
    var rac = [];
    document.querySelectorAll(".side nav .side-it").forEach(function (a) {
      rac.push({ titre: a.textContent.trim(), icone: (a.querySelector("use").getAttribute("href").split("#i-")[1] || "dot"), href: a.getAttribute("href") });
    });
    document.querySelectorAll(".faq summary").forEach(function (s) {
      rac.push({ groupe: "Questions", titre: s.textContent.trim(), icone: "help", action: function () {
        var d = s.parentNode; d.open = true;
        d.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      } });
    });
    rac.push({ titre: "Demander une démonstration", icone: "mail", mots: "contact devis prix tarif", href: "#contact" });
    rac.push({ titre: "Apparence", sous: "Couleur d'accent, thème clair ou sombre", icone: "palette", mots: "couleur theme sombre clair", action: ouvrirApparence });
    window.Encre.recherche.raccourcis = rac;
  }

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

  // ── Animations (rien n'est caché si ce script ne tourne pas, ni avec « moins de mouvement ») ──
  // Lance fn une fois quand el entre à l'écran.
  function onView(el, fn, margin) {
    if (!el) return;
    if (!hasIO) { fn(); return; }
    var o = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { o.disconnect(); fn(); }
      });
    }, { rootMargin: margin || "0px 0px -12% 0px" });
    o.observe(el);
  }

  // Apparition au défilement, les éléments frères l'un après l'autre.
  var REVEAL = ".feat, .step, .duo > *, .try-in > *, .offer-in > *, .demo-in, .contact, .stats-in > div," +
    " .checks li, .who-list li, .faq details, .section > .wrap > .eyebrow, .section > .wrap > h2, .section > .wrap > .lead";
  if (hasIO && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("seen");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(REVEAL).forEach(function (el) {
      var sibs = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.matches(REVEAL); });
      var i = Math.min(sibs.indexOf(el), 8);
      var base = el.matches(".checks li") ? 160 : 0;
      el.style.setProperty("--d", (base + i * 90) + "ms");
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  // Section visible → onglet allumé dans la barre flottante et dans le menu de gauche.
  var navSecs = Array.prototype.map.call(document.querySelectorAll(".side nav .side-it[data-page]"), function (a) {
    return document.getElementById(a.dataset.page);
  }).filter(Boolean);
  var ticking = false, courante = null;
  function onScroll() {
    ticking = false;
    var line = window.innerHeight * 0.35, cur = navSecs.length ? navSecs[0].id : null;
    navSecs.forEach(function (s) {
      if (s.getBoundingClientRect().top <= line) cur = s.id;
    });
    if (cur !== courante && window.Encre && window.Encre.nav) {
      courante = cur;
      window.Encre.nav.marquer(cur);
    }
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; raf(onScroll); }
  }, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("hashchange", function () { courante = null; setTimeout(onScroll, 0); });
  onScroll();

  // Accueil : lignes de la recette (CSS), puis coûts qui montent.
  if (!reduce) {
    document.querySelectorAll(".scr-foot b").forEach(function (b, i) { countUp(b, 1100, 1250 + i * 120); });
  }

  // Téléphone qui s'incline vers le pointeur (souris uniquement).
  var hero = document.querySelector(".hero");
  var phone = document.querySelector(".phone");
  if (hero && phone && !reduce && window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var tx = 0, ty = 0, cx = 0, cy = 0, tilting = 0;
    var tilt = function () {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      phone.style.transform = "perspective(1100px) rotateY(" + (cx * 9).toFixed(2) + "deg) rotateX(" + (-cy * 7).toFixed(2) + "deg)";
      phone.style.setProperty("--gx", (cx * 30).toFixed(1) + "%");
      phone.style.setProperty("--gy", (cy * 30).toFixed(1) + "%");
      tilting = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? raf(tilt) : 0;
    };
    var kick = function () { if (!tilting) tilting = raf(tilt); };
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      var r = phone.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 1.4)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 1.2)));
      kick();
    });
    hero.addEventListener("pointerleave", function () { tx = 0; ty = 0; kick(); });
    phone.classList.add("tilt");
  }

  // Chiffres clés : compteurs à l'arrivée.
  var stats = document.querySelector(".stats");
  if (stats && !reduce) {
    onView(stats, function () {
      stats.querySelectorAll("b").forEach(function (b, i) { countUp(b, 1300, 150 + i * 110); });
    });
  }

  // Lance une animation CSS quand le bloc arrive : classe « anim » d'abord, « play » à l'écran.
  function playOnView(el, then) {
    if (!el || reduce || !hasIO) return;
    el.classList.add("anim");
    Array.prototype.forEach.call(el.querySelectorAll(".tc-row, .lab-steps li"), function (r, i) {
      r.style.setProperty("--i", i);
    });
    onView(el, function () {
      raf(function () { el.classList.add("play"); if (then) then(); });
    }, "0px 0px -18% 0px");
  }
  playOnView(document.querySelector(".table-card"));

  // Fiche de production : barre, étapes et minuteur qui tourne quand on le voit.
  var lab = document.querySelector(".lab-card");
  var timer = lab && lab.querySelector(".timer");
  playOnView(lab);
  if (timer && !reduce && hasIO) {
    var m0 = /^(\d+):(\d{2})$/.exec(timer.textContent.trim());
    if (m0) {
      var start = parseInt(m0[1], 10) * 60 + parseInt(m0[2], 10), left = start, tick = 0;
      var show = function () {
        var mm = Math.floor(left / 60), ss = left % 60;
        timer.textContent = (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
      };
      new IntersectionObserver(function (entries) {
        var vis = entries[entries.length - 1].isIntersecting;
        if (vis && !tick) {
          tick = setInterval(function () { left = left > 0 ? left - 1 : start; show(); }, 1000);
        } else if (!vis && tick) { clearInterval(tick); tick = 0; }
      }).observe(timer);
    }
  }

  // Conversation avec l'assistant : les messages arrivent l'un après l'autre.
  var chat = document.querySelector(".chat");
  if (chat && !reduce && hasIO) {
    var msgs = Array.prototype.slice.call(chat.querySelectorAll(".msg"));
    chat.classList.add("seq");
    var typing = document.createElement("div");
    typing.className = "typing";
    typing.setAttribute("aria-hidden", "true");
    typing.innerHTML = "<i></i><i></i><i></i>";
    chat.appendChild(typing);
    onView(chat, function () {
      var k = 0;
      var next = function () {
        if (k >= msgs.length) { chat.classList.add("done"); return; }
        var m = msgs[k++];
        if (m.classList.contains("ai")) {
          typing.style.transform = "translate(" + m.offsetLeft + "px," + m.offsetTop + "px)";
          typing.classList.add("on");
          setTimeout(function () {
            typing.classList.remove("on");
            m.classList.add("shown");
            setTimeout(next, 900);
          }, 1150);
        } else {
          m.classList.add("shown");
          setTimeout(next, 650);
        }
      };
      setTimeout(next, 250);
    }, "0px 0px -25% 0px");
  }

  // Cartes des fonctions : halo qui suit la souris.
  if (!reduce && window.matchMedia && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".feat").forEach(function (f) {
      f.addEventListener("pointermove", function (e) {
        var r = f.getBoundingClientRect();
        f.style.setProperty("--mx", (e.clientX - r.left) + "px");
        f.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }
})();
