"use strict";
(function () {
  var KEY = "f4703967ed5958d394b67ef5fc5752b2",
    SRC = "https://bauval.org/22/" + KEY,
    W = 300,
    H = 250,
    RETRY = 45000; /* espera antes de tentar de novo se falhou */

  /* Anúncios fixos no fim das telas: [seletor do container, id do slot].
     Na tela de Consoles o anúncio é um card do carrossel (criado pelo app.js).
     Regra: no máximo 1 anúncio por tela e nenhum durante o jogo, configurações ou Termos. */
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
    return s;
  }

  /* Método 1: script direto no espaço do anúncio (o Adsterra lê o atOptions global) */
  function viaScript(box, st, show) {
    window.atOptions = { key: KEY, format: "iframe", height: H, width: W, params: {} };
    var sc = document.createElement("script");
    sc.async = true;
    sc.src = SRC;
    sc.onerror = function () {
      console.warn("[ads] script bloqueado ou indisponível:", SRC);
      box.textContent = "";
      st.n = 2; /* não adianta tentar o método 2 se a rede bloqueou */
      st.t = Date.now();
      show(false);
    };
    box.appendChild(sc);
  }

  /* Método 2: iframe novo e limpo (cada anúncio com seu próprio atOptions, sem estado antigo) */
  function viaFrame(box) {
    var f = document.createElement("iframe");
    f.width = W;
    f.height = H;
    f.title = "Publicidade";
    f.setAttribute("scrolling", "no");
    f.setAttribute("frameborder", "0");
    box.appendChild(f);
    try {
      var d = f.contentWindow.document;
      d.open();
      d.write(
        '<!doctype html><html><body style="margin:0;background:transparent">' +
          "<script>atOptions={'key':'" + KEY + "','format':'iframe','height':" + H + ",'width':" + W + ",'params':{}};<\/script>" +
          '<script src="' + SRC + '"><\/script></body></html>',
      );
      d.close();
    } catch (e) {
      console.warn("[ads] iframe falhou", e);
    }
  }

  /* Garante que o espaço tenha anúncio: tenta o método 1, confere se renderizou, senão o método 2,
     e se tudo falhar tenta de novo depois (nunca desiste para sempre) */
  function ensure(box, show) {
    var st = box._st || (box._st = { n: 0, t: 0 }),
      now = Date.now();
    if (box.firstChild) {
      if (st.n === 1 && !box.querySelector("iframe") && now - st.t > 6000) {
        console.warn("[ads] método 1 não renderizou, tentando método 2");
        box.textContent = "";
        viaFrame(box);
        st.n = 2;
        st.t = now;
      }
      return;
    }
    if (st.n >= 2 && now - st.t < RETRY) return;
    if (st.n >= 2) st.n = 0;
    show(true);
    viaScript(box, st, show);
    if (st.n === 0) {
      st.n = 1;
      st.t = now;
    }
  }

  function clear(s) {
    var b = s.querySelector(".ad-box");
    b.textContent = "";
    b._st = null;
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
        if (s.parentElement && s.parentElement.closest(".view.show"))
          ensure(s.querySelector(".ad-box"), function (v) {
            s.classList.toggle("on", v);
          });
      });
      /* card do carrossel: só carrega quando ele é o card central (ativo) */
      if (document.querySelector("#view-home.show")) {
        var box = document.querySelector("#view-home .cf-card.ad-card.active .ad-box");
        box && ensure(box, function () {});
      }
    }, 1000);

    /* ao entrar num jogo, remove os anúncios (libera CPU para o emulador) */
    new MutationObserver(function () {
      if (!document.body.classList.contains("playing")) return;
      slots.forEach(clear);
      document.querySelectorAll(".ad-card .ad-box").forEach(function (b) {
        b.textContent = "";
        b._st = null;
      });
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
