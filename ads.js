"use strict";
(function () {
  var KEY = "f4703967ed5958d394b67ef5fc5752b2",
    SRC = "https://bauval.org/22/" + KEY,
    W = 300,
    H = 250,
    WAIT = 10000, /* tempo máximo para o anúncio aparecer em cada tentativa */
    RETRY = 30000, /* espera antes de uma nova rodada se as duas tentativas falharem */
    ROUNDS = 4;

  /* Só 2 lugares: fim da lista de jogos (dentro de um console) e fim das Configurações.
     Nunca no jogo, na tela de carregamento, nos Termos, no setup, nos Consoles nem no Multiplayer. */
  var PLACES = [
    ["#view-library .container", "ad-lib"],
    ["#view-settings .container", "ad-set"],
  ];
  var slots = [];

  function tosOk() {
    try {
      return JSON.parse(localStorage.getItem("ph_tos")) >= 2; /* só depois de aceitar os Termos atuais */
    } catch (e) {
      return false;
    }
  }
  var cls = function (c) {
    return document.body.classList.contains(c);
  };
  var boxOf = function (s) {
    return s.querySelector(".ad-box");
  };

  function make(parent, id) {
    var s = document.createElement("div");
    s.className = "ad-slot";
    s.id = id;
    s.innerHTML = '<span class="ad-label">Publicidade</span><div class="ad-box"></div>';
    parent.appendChild(s);
    return s;
  }

  /* espera até o teste ficar verdadeiro (ou acabar o tempo) */
  function until(test, done) {
    var t0 = Date.now(),
      iv = setInterval(function () {
        var ok = false;
        try {
          ok = test();
        } catch (e) {}
        if (ok || Date.now() - t0 > WAIT) {
          clearInterval(iv);
          done(ok);
        }
      }, 250);
  }

  /* Tentativa 1: o código do Adsterra dentro de um iframe próprio (o jeito que ele espera: document.write funciona e
     cada anúncio tem seu próprio atOptions). Como o iframe é do mesmo site, dá para conferir se o anúncio chegou. */
  function viaFrame(s, done) {
    var box = boxOf(s),
      f = document.createElement("iframe");
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
    until(
      function () {
        return !!f.contentDocument.querySelector("iframe,ins,img,a");
      },
      function (ok) {
        if (!ok) f.remove();
        done(ok);
      },
    );
  }

  /* Tentativa 2: script direto na caixa (o Adsterra lê o atOptions global) */
  function viaScript(s, done) {
    var box = boxOf(s),
      sc = document.createElement("script");
    window.atOptions = { key: KEY, format: "iframe", height: H, width: W, params: {} };
    sc.async = true;
    sc.src = SRC;
    box.appendChild(sc);
    until(
      function () {
        return [].some.call(box.children, function (c) {
          return c.tagName !== "SCRIPT";
        });
      },
      function (ok) {
        if (!ok) box.textContent = "";
        done(ok);
      },
    );
  }

  /* Depois que o anúncio aparece, ele NUNCA mais é removido nem recarregado. */
  function load(s) {
    if (s._shown || s._busy || (s._rounds || 0) >= ROUNDS || Date.now() < (s._next || 0)) return;
    s._busy = true;
    s._rounds = (s._rounds || 0) + 1;
    var end = function (ok) {
      s._busy = false;
      if (ok) {
        s._shown = true;
        s.classList.add("on");
      } else {
        console.warn("[ads] não apareceu (rodada " + s._rounds + "). Bloqueador de anúncios ou rede?");
        s._next = Date.now() + RETRY;
      }
    };
    viaFrame(s, function (ok) {
      ok ? end(true) : viaScript(s, end);
    });
  }

  function check() {
    if (cls("booting") || cls("playing") || !tosOk()) return;
    slots.forEach(function (s) {
      s.parentElement && s.parentElement.closest(".view.show") && load(s);
    });
  }

  function init() {
    PLACES.forEach(function (p) {
      var c = document.querySelector(p[0]);
      if (c && !document.getElementById(p[1])) slots.push(make(c, p[1]));
    });
    var mo = new MutationObserver(check);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    document.querySelectorAll(".view").forEach(function (v) {
      mo.observe(v, { attributes: true, attributeFilter: ["class"] });
    });
    setInterval(check, 500); /* garantia (ex.: logo depois de aceitar os Termos) */
    check();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
