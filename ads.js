"use strict";
(function () {
  var KEY = "f4703967ed5958d394b67ef5fc5752b2",
    SRC = "https://bauval.org/22/" + KEY,
    W = 300,
    H = 250;

  /* Anúncios fixos no fim das telas: [seletor do container, id do slot].
     Na tela de Consoles o anúncio é um card do carrossel (criado pelo app.js).
     Regra: no máximo 1 anúncio por tela e nenhum durante o jogo, configurações ou Termos. */
  var PLACES = [
    ["#view-library .container", "ad-lib"],
    ["#view-multi .container", "ad-multi"],
  ];
  var slots = [],
    cardDead = false;

  function ready() {
    var b = document.body;
    if (b.classList.contains("booting") || b.classList.contains("playing")) return false;
    try {
      return JSON.parse(localStorage.getItem("ph_tos")) >= 2; /* só depois de aceitar os Termos atuais (TOS_V = 2) */
    } catch (e) {
      return false;
    }
  }

  function make(parent, id) {
    var s = document.createElement("div");
    s.className = "ad-slot";
    s.id = id;
    s.innerHTML = '<span class="ad-label">Publicidade</span><div class="ad-box"></div>';
    parent.appendChild(s);
    return s;
  }

  /* o Adsterra lê o atOptions global quando o script executa */
  function load(box, onFail) {
    if (box.firstChild) return;
    window.atOptions = { key: KEY, format: "iframe", height: H, width: W, params: {} };
    var sc = document.createElement("script");
    sc.async = true;
    sc.src = SRC;
    sc.onerror = function () {
      console.warn("[ads] bloqueado ou indisponível:", SRC);
      box.textContent = "";
      onFail();
    };
    box.appendChild(sc);
  }

  function fill(s) {
    load(s.querySelector(".ad-box"), function () {
      s.classList.remove("on");
      s._dead = true; /* não tenta de novo nesta sessão */
    });
    s.classList.add("on");
  }

  function clear(s) {
    s.querySelector(".ad-box").textContent = "";
    s.classList.remove("on");
  }

  function init() {
    PLACES.forEach(function (p) {
      var c = document.querySelector(p[0]);
      if (!c || document.getElementById(p[1])) return;
      slots.push(make(c, p[1]));
    });

    setInterval(function () {
      if (!ready()) return;
      /* banners do fim das telas: carrega quando a tela está aberta */
      slots.forEach(function (s) {
        var vis = s.parentElement && s.parentElement.closest(".view.show");
        vis && !s._dead && fill(s);
      });
      /* card do carrossel: só carrega quando ele é o card central (ativo) */
      if (!cardDead && document.querySelector("#view-home.show")) {
        var box = document.querySelector("#view-home .cf-card.ad-card.active .ad-box");
        box &&
          load(box, function () {
            cardDead = true;
          });
      }
    }, 1000);

    /* ao entrar num jogo, remove os anúncios (libera CPU para o emulador) */
    new MutationObserver(function () {
      if (!document.body.classList.contains("playing")) return;
      slots.forEach(clear);
      document.querySelectorAll(".ad-card .ad-box").forEach(function (b) {
        b.textContent = "";
      });
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
