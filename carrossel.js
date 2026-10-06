"use strict";
/* ============================================================
   Carrossel de consoles — PlayRom.io
   Carregue DEPOIS do app.js:
     <script src="app.js"></script>
     <script src="carrossel.js"></script>
   Não precisa mexer no app.js nem no HTML (além da tag acima).
   Ele substitui renderHome() e cria sozinho o wrapper .cf,
   as setas, os pontinhos e a dica.
   ============================================================ */
(function () {
  /* cor de destaque de cada console (pode trocar à vontade) */
  const COLORS = { ps1: "#fb3333", md: "#3d8bff", atari: "#ff9d2e" };

  let idx = 0, /* card ativo */
    pos = 0, /* posição (decimal enquanto arrasta) */
    keys = [],
    bound = false,
    moved = false;

  const stage = () => document.getElementById("home-grid");
  const cardW = () => Math.min(300, window.innerWidth * 0.66);
  const step = () => Math.max(120, cardW() * 0.8);

  /* cria wrapper .cf + setas + pontinhos + dica (uma vez só) */
  function chrome() {
    const g = stage();
    if (!g || (g.parentNode && g.parentNode.classList.contains("cf"))) return;
    const wrap = document.createElement("div");
    wrap.className = "cf";
    wrap.id = "cf";
    g.parentNode.insertBefore(wrap, g);
    wrap.innerHTML =
      '<button class="cf-arrow cf-prev" id="cf-prev" type="button" aria-label="Console anterior"><i class="fa-solid fa-chevron-left"></i></button>';
    wrap.appendChild(g);
    wrap.insertAdjacentHTML(
      "beforeend",
      '<button class="cf-arrow cf-next" id="cf-next" type="button" aria-label="Próximo console"><i class="fa-solid fa-chevron-right"></i></button>' +
        '<div class="cf-dots" id="cf-dots"></div>' +
        '<p class="cf-hint">Arraste, use as setas ou toque no card</p>',
    );
  }

  /* posiciona cada card em 3D (efeito cover flow) */
  function layout() {
    const g = stage();
    if (!g) return;
    const s = step();
    [...g.children].forEach((el, i) => {
      const d = i - pos,
        a = Math.abs(d),
        c = Math.min(a, 2),
        x = d * s,
        z = -c * 90,
        ry = Math.max(-42, Math.min(42, -d * 30)),
        sc = 1 - c * 0.12;
      el.style.transform =
        "translate(-50%,-50%) translate3d(" + x + "px,0," + z + "px) rotateY(" + ry + "deg) scale(" + sc + ")";
      el.style.opacity = Math.max(0, 1 - a * 0.42);
      el.style.zIndex = 100 - Math.round(a * 10);
      el.style.pointerEvents = a >= 2.4 ? "none" : "auto";
    });
  }

  /* estado ativo, setas, pontinhos, acessibilidade */
  function mark() {
    const g = stage();
    if (!g) return;
    [...g.children].forEach((el, i) => {
      const on = i === idx;
      el.classList.toggle("active", on);
      el.tabIndex = on ? 0 : -1;
      el.setAttribute("aria-current", on ? "true" : "false");
    });
    document.querySelectorAll("#cf-dots .cf-dot").forEach((d, i) => d.classList.toggle("active", i === idx));
    const p = document.getElementById("cf-prev"),
      n = document.getElementById("cf-next");
    if (p) p.disabled = idx <= 0;
    if (n) n.disabled = idx >= keys.length - 1;
  }

  function go(i, instant) {
    if (!keys.length) return;
    idx = Math.max(0, Math.min(keys.length - 1, i));
    pos = idx;
    const g = stage();
    if (instant && g) g.classList.add("dragging"); /* sem transição */
    layout();
    mark();
    if (instant && g)
      requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove("dragging")));
  }

  function pick(i) {
    if (i !== idx) go(i);
    else setSys(keys[i]);
  }

  function build() {
    const g = stage();
    if (!g) return;
    chrome();
    keys = Object.keys(CONSOLES);
    g.textContent = "";
    keys.forEach((k, i) => {
      const c = CONSOLES[k],
        n = library.filter((x) => (x.sys || "ps1") === k).length,
        el = document.createElement("div");
      el.className = "cf-card";
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", c.name);
      el.dataset.k = k;
      el.style.setProperty("--ac", COLORS[k] || "#fb3333");
      el.innerHTML =
        '<div class="cf-ico"><i class="fa-solid ' + c.icon + '"></i></div><h3></h3><p></p>' +
        '<div class="on" data-on="' + k + '"><i class="fa-solid fa-circle"></i><b>0</b><span>Pessoas online</span></div>' +
        '<span class="cf-go">Entrar</span>';
      el.querySelector("h3").textContent = c.name;
      el.querySelector("p").textContent = n + " jogo(s)";
      el.addEventListener("click", () => pick(i));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick(i);
        }
      });
      g.appendChild(el);
    });

    const dots = document.getElementById("cf-dots");
    if (dots) {
      dots.textContent = "";
      keys.forEach((k, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cf-dot";
        b.setAttribute("aria-label", CONSOLES[k].name);
        b.onclick = () => go(i);
        dots.appendChild(b);
      });
    }

    if (typeof SYS === "string" && keys.includes(SYS)) idx = keys.indexOf(SYS);
    go(Math.min(idx, keys.length - 1), true);
    if (!bound) {
      bind();
      bound = true;
    }
    updateOnline();
  }

  function bind() {
    const g = stage();
    const prev = document.getElementById("cf-prev"),
      next = document.getElementById("cf-next");
    if (prev) prev.onclick = () => go(idx - 1);
    if (next) next.onclick = () => go(idx + 1);

    /* arrastar (mouse e toque) */
    let down = false, pid = null, sx = 0, sp = 0, lastX = 0, lastT = 0, vel = 0;
    g.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = true;
      moved = false;
      pid = e.pointerId;
      sx = lastX = e.clientX;
      sp = pos;
      lastT = performance.now();
      vel = 0;
    });
    g.addEventListener("pointermove", (e) => {
      if (!down || e.pointerId !== pid) return;
      const dx = e.clientX - sx;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        g.classList.add("dragging");
        try { g.setPointerCapture(pid); } catch {}
      }
      if (!moved) return;
      const now = performance.now();
      vel = (e.clientX - lastX) / Math.max(1, now - lastT);
      lastX = e.clientX;
      lastT = now;
      let p = sp - dx / step();
      const max = keys.length - 1;
      if (p < 0) p *= 0.35; /* "elástico" nas pontas */
      else if (p > max) p = max + (p - max) * 0.35;
      pos = p;
      layout();
    });
    const end = (e) => {
      if (!down || e.pointerId !== pid) return;
      down = false;
      try { g.releasePointerCapture(pid); } catch {}
      if (!moved) return;
      g.classList.remove("dragging");
      let t = Math.round(pos);
      if (Math.abs(vel) > 0.45) t = Math.round(sp) - Math.sign(vel); /* arremesso rápido */
      go(t);
      setTimeout(() => (moved = false), 0);
    };
    g.addEventListener("pointerup", end);
    g.addEventListener("pointercancel", end);
    /* depois de arrastar, não deixa o "click" abrir o console */
    g.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);

    /* rolagem horizontal do mouse/touchpad */
    let wt = 0;
    g.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 20) return;
      e.preventDefault();
      const n = performance.now();
      if (n - wt < 350) return;
      wt = n;
      go(idx + Math.sign(e.deltaX));
    }, { passive: false });

    /* teclado: ← → */
    document.addEventListener("keydown", (e) => {
      const v = document.getElementById("view-home");
      if (!v || !v.classList.contains("show") || e.defaultPrevented) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") { go(idx - 1); e.preventDefault(); }
      else if (e.key === "ArrowRight") { go(idx + 1); e.preventDefault(); }
    });

    window.addEventListener("resize", layout);
  }

  /* troca o renderHome() antigo (que criava botões .mp-opt) por este */
  window.renderHome = build;

  /* mantém o carrossel no console atual quando ele muda por outro caminho */
  const _setSys = window.setSys;
  window.setSys = function (k, quiet) {
    _setSys(k, quiet);
    const i = keys.indexOf(k);
    if (i >= 0 && i !== idx) go(i, true);
  };
})();
