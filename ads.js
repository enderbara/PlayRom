"use strict";
(function () {
  var KEY = "f4703967ed5958d394b67ef5fc5752b2",
    SRC = "https://bauval.org/22/" + KEY,
    W = 300,
    H = 250;

  /* Um banner no fim de cada tela: [seletor do container, id do slot].
     Nunca aparece durante o jogo, configurações, Termos ou setup. */
  var PLACES = [
    ["#view-home .container", "ad-home"],
    ["#view-library .container", "ad-lib"],
    ["#view-multi .container", "ad-multi"],
  ];
  var slots = [];

  function ready() {
    var b = document.body;
    if (b.classList.contains("booting") || b.classList.contains("playing")) return false;
    try {
      return JSON.parse(localStorage.getItem("ph_tos")) >= 2; /* só depois de aceitar os Termos atuais */
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

  /* carrega o anúncio. Depois que entrou, NUNCA mexe nele (só limpa ao entrar num jogo) */
  function fill(s) {
    var box = s.querySelector(".ad-box");
    if (box.firstChild || s._wait) return;
    window.atOptions = { key: KEY, format: "iframe", height: H, width: W, params: {} };
    var sc = document.createElement("script");
    sc.async = true;
    sc.src = SRC;
    sc.onerror = function () {
      console.warn("[ads] bloqueado ou indisponível:", SRC);
      box.textContent = "";
      s.classList.remove("on");
      s._wait = true; /* tenta de novo em 20s */
      setTimeout(function () {
        s._wait = false;
        check();
      }, 20000);
    };
    box.appendChild(sc);
    s.classList.add("on");
  }

  function clear(s) {
    s.querySelector(".ad-box").textContent = "";
    s.classList.remove("on");
  }

  /* carrega na hora os banners das telas que estão abertas */
  function check() {
    if (!ready()) return;
    slots.forEach(function (s) {
      s.parentElement && s.parentElement.closest(".view.show") && fill(s);
    });
  }

  function init() {
    PLACES.forEach(function (p) {
      var c = document.querySelector(p[0]);
      if (!c || document.getElementById(p[1])) return;
      slots.push(make(c, p[1]));
    });

    /* reage na hora quando troca de tela, a splash termina ou sai do jogo */
    var mo = new MutationObserver(function () {
      if (document.body.classList.contains("playing")) slots.forEach(clear);
      else check();
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    document.querySelectorAll(".view").forEach(function (v) {
      mo.observe(v, { attributes: true, attributeFilter: ["class"] });
    });

    /* garantia: confere de novo a cada 500ms (ex.: logo depois de aceitar os Termos) */
    setInterval(check, 500);
    check();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
