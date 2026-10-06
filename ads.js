"use strict";
(function () {
  var KEY = "f4703967ed5958d394b67ef5fc5752b2",
    SRC = "https://bauval.org/22/" + KEY,
    W = 300,
    H = 250;

  /* onde cada banner entra: [seletor do container, id do slot] */
  var PLACES = [
    ["#view-library .container", "ad-lib"],
    ["#view-multi .container", "ad-multi"],
  ];
  var slots = [];

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
    s._vis = false;
    return s;
  }

  function fill(s) {
    var box = s.querySelector(".ad-box");
    if (box.firstChild) return;
    var f = document.createElement("iframe");
    f.width = W;
    f.height = H;
    f.title = "Publicidade";
    f.setAttribute("scrolling", "no");
    f.setAttribute("frameborder", "0");
    f.srcdoc =
      '<!doctype html><html><body style="margin:0;background:transparent">' +
      "<script>atOptions={'key':'" + KEY + "','format':'iframe','height':" + H + ",'width':" + W + ",'params':{}};<\/script>" +
      '<script src="' + SRC + '"><\/script></body></html>';
    box.appendChild(f);
    s.classList.add("on");
  }

  function clear(s) {
    s.querySelector(".ad-box").textContent = "";
    s.classList.remove("on");
  }

  function init() {
    var io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            function (es) {
              es.forEach(function (e) {
                e.target._vis = e.isIntersecting;
              });
            },
            { rootMargin: "200px" },
          )
        : null;

    PLACES.forEach(function (p) {
      var c = document.querySelector(p[0]);
      if (!c || document.getElementById(p[1])) return;
      var s = make(c, p[1]);
      slots.push(s);
      io ? io.observe(s) : (s._vis = true);
    });

    /* carrega os que estão visíveis quando tudo estiver liberado */
    setInterval(function () {
      if (!ready()) return;
      slots.forEach(function (s) {
        /* o slot está display:none até carregar, então o observer não o vê: usa o container */
        var vis = s.parentElement && s.parentElement.closest(".view.show");
        vis && fill(s);
      });
    }, 1000);

    /* ao entrar num jogo, remove os anúncios (libera CPU para o emulador) */
    new MutationObserver(function () {
      if (document.body.classList.contains("playing")) slots.forEach(clear);
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
