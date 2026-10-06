"use strict";
(function () {
  var KEY = "f4703967ed5958d394b67ef5fc5752b2",
    SRC = "https://bauval.org/22/" + KEY,
    W = 300,
    H = 250,
    WAIT = 8000, /* tempo para o anúncio aparecer antes de considerar falha */
    RETRY = 30000, /* espera antes de tentar de novo */
    MAXTRY = 5;

  /* Um banner no fim de cada tela. Nunca durante o jogo, configurações, Termos ou setup. */
  var PLACES = [
    ["#view-home .container", "ad-home"],
    ["#view-library .container", "ad-lib"],
    ["#view-multi .container", "ad-multi"],
  ];
  var slots = [],
    pl = null,
    lad = null; /* anúncio da tela de carregamento do jogo */

  function tosOk() {
    try {
      return JSON.parse(localStorage.getItem("ph_tos")) >= 2; /* só depois de aceitar os Termos atuais */
    } catch (e) {
      return false;
    }
  }
  var booting = function () {
    return document.body.classList.contains("booting");
  };
  var playing = function () {
    return document.body.classList.contains("playing");
  };

  /* o anúncio só conta como "carregado" quando o Adsterra colocou algo dentro da caixa */
  function rendered(box) {
    return [].some.call(box.children, function (c) {
      return c.tagName !== "SCRIPT";
    });
  }
  var boxOf = function (s) {
    return s.querySelector(".ad-box");
  };

  function make(parent, cls, id) {
    var s = document.createElement("div");
    s.className = cls;
    if (id) s.id = id;
    s.innerHTML = '<span class="ad-label">Publicidade</span><div class="ad-box"></div>';
    parent.appendChild(s);
    /* quando o anúncio aparece, mostra o espaço (nunca mostra quadrado vazio) */
    new MutationObserver(function () {
      if (!rendered(boxOf(s))) return;
      clearTimeout(s._t);
      s._busy = false;
      s === lad ? checkLoad() : s.classList.add("on");
    }).observe(boxOf(s), { childList: true });
    return s;
  }

  function reset(s) {
    clearTimeout(s._t);
    boxOf(s).textContent = "";
    s.classList.remove("on");
    s._busy = false;
  }

  function fail(s, why) {
    console.warn("[ads] " + why);
    reset(s);
    s._next = Date.now() + RETRY;
  }

  /* carrega o anúncio (o Adsterra lê o atOptions global quando o script executa) */
  function load(s) {
    var box = boxOf(s);
    if (s._busy || box.firstChild) return;
    if ((s._tries || 0) >= MAXTRY || Date.now() < (s._next || 0)) return;
    s._tries = (s._tries || 0) + 1;
    s._busy = true;
    window.atOptions = { key: KEY, format: "iframe", height: H, width: W, params: {} };
    var sc = document.createElement("script");
    sc.async = true;
    sc.src = SRC;
    sc.onerror = function () {
      fail(s, "script bloqueado ou indisponível: " + SRC);
    };
    box.appendChild(sc);
    s._t = setTimeout(function () {
      rendered(box) || fail(s, "o anúncio não apareceu em " + WAIT / 1000 + "s");
    }, WAIT);
  }

  /* Tela de carregamento: só mostra se couber sem tapar o indicador de progresso.
     "b" = embaixo (tela alta, ex.: celular em pé) · "s" = do lado direito (tela larga, ex.: celular deitado) */
  function loadMode() {
    var w = pl.clientWidth,
      h = pl.clientHeight;
    if (w >= 320 && h >= 740) return "b";
    if (w > h && w >= 660 && h >= 280) return "s";
    return "";
  }

  function checkLoad() {
    if (!lad) return;
    var p = document.getElementById("player"),
      on =
        tosOk() &&
        !booting() &&
        p &&
        p.classList.contains("show") &&
        !pl.classList.contains("hidden") &&
        !pl.classList.contains("go"),
      m = on ? loadMode() : "";
    pl.classList.toggle("adon", m === "b" && rendered(boxOf(lad)));
    pl.classList.toggle("adside", m === "s" && rendered(boxOf(lad)));
    if (!on) {
      lad._tries = 0; /* terminou de carregar (ou saiu): remove o anúncio */
      reset(lad);
    } else if (m) {
      load(lad);
      lad.classList.toggle("on", rendered(boxOf(lad)));
    } else lad.classList.remove("on");
  }

  /* banners do fim das telas: carrega o da tela que está aberta */
  function check() {
    checkLoad();
    if (booting() || playing() || !tosOk()) return;
    slots.forEach(function (s) {
      s.parentElement && s.parentElement.closest(".view.show") && load(s);
    });
  }

  function init() {
    PLACES.forEach(function (p) {
      var c = document.querySelector(p[0]);
      if (c && !document.getElementById(p[1])) slots.push(make(c, "ad-slot", p[1]));
    });
    pl = document.getElementById("p-loading");
    if (pl) lad = make(pl, "ad-load");

    var was = false,
      mo = new MutationObserver(function () {
        var pn = playing();
        if (pn) {
          /* entrou no jogo: remove os anúncios (libera CPU para o emulador) */
          slots.forEach(function (s) {
            s._tries = 0;
            reset(s);
          });
        }
        was = pn;
        check();
      });
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    document.querySelectorAll(".view").forEach(function (v) {
      mo.observe(v, { attributes: true, attributeFilter: ["class"] });
    });
    pl && mo.observe(pl, { attributes: true, attributeFilter: ["class"] });
    var pe = document.getElementById("player");
    pe && mo.observe(pe, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", checkLoad);

    /* garantia: confere de novo a cada 500ms (ex.: logo depois de aceitar os Termos) */
    setInterval(check, 500);
    check();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
