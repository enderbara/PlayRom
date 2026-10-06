"use strict";
const $ = (e, t = document) => t.querySelector(e),
  $$ = (e) => [...document.querySelectorAll(e)],
  sleep = (e) => new Promise((t) => setTimeout(t, e)),
  DB = "PlayRomDB",
  STORE = "roms";
let library = [],
  filter = "all",
  query = "",
  current = null,
  paused = !1,
  muted = !1,
  autoPaused = !1,
  leavingPlayer = !1;
const cfg = {
    get(e, t) {
      try {
        const a = localStorage.getItem("ph_" + e);
        return a === null ? t : JSON.parse(a);
      } catch {
        return t;
      }
    },
    set(e, t) {
      try {
        localStorage.setItem("ph_" + e, JSON.stringify(t));
      } catch {}
    },
  },
  DEFAULTS = {
    keymap: {
      UP: "ArrowUp",
      DOWN: "ArrowDown",
      LEFT: "ArrowLeft",
      RIGHT: "ArrowRight",
      A: "KeyX",
      B: "KeyZ",
      X: "KeyS",
      Y: "KeyA",
      L: "KeyQ",
      R: "KeyW",
      L2: "KeyD",
      R2: "KeyF",
      START: "Enter",
      SELECT: "ShiftRight",
    },
    keymap2: {
      UP: "KeyI",
      DOWN: "KeyK",
      LEFT: "KeyJ",
      RIGHT: "KeyL",
      A: "KeyP",
      B: "KeyO",
      X: "KeyU",
      Y: "KeyY",
      L: "KeyT",
      R: "KeyR",
      L2: "KeyV",
      R2: "KeyM",
      START: "KeyN",
      SELECT: "KeyB",
    },
    pad: "auto",
    opacity: 85,
    scale: 100,
    vib: !0,
    gpOn: !0,
    gpDead: 25,
    gpSwap: !1,
    filter: "smooth",
    aspect: "43",
    fps: 60,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    showFps: !1,
    reduceAnim: !1,
    sharp: 0,
    scan: 0,
    vig: 0,
    perf: !1,
    color: "normal",
    zoom: 100,
    rot: 0,
    intScale: !1,
    autoPause: !0,
    autoOpt: !0,
    resetMode: "save",
    padType: "dpad",
    padLay: { p: {}, l: {} },
    volume: 100,
    hideRsTip: !1,
    hideSvTip: !1,
    notify: !0,
  },
  GROUPS = {
    kb: ["keymap", "keymap2"],
    touch: ["pad", "opacity", "scale", "vib", "padType", "padLay"],
    usb: ["gpOn", "gpDead", "gpSwap"],
    rst: ["resetMode"],
    video: [
      "filter",
      "aspect",
      "fps",
      "brightness",
      "contrast",
      "saturation",
      "showFps",
      "sharp",
      "scan",
      "vig",
      "perf",
      "color",
      "zoom",
      "rot",
      "intScale",
      "autoPause",
      "autoOpt",
    ],
  },
  PRESETS = {
    low: {
      filter: "pixel",
      sharp: 0,
      scan: 0,
      vig: 0,
      perf: !0,
      color: "normal",
      brightness: 100,
      contrast: 100,
      saturation: 100,
      intScale: !1,
    },
    mid: {
      filter: "smooth",
      sharp: 0,
      scan: 0,
      vig: 0,
      perf: !1,
      color: "normal",
      brightness: 100,
      contrast: 100,
      saturation: 100,
      intScale: !1,
    },
    high: {
      filter: "smooth",
      sharp: 35,
      scan: 0,
      vig: 0,
      perf: !1,
      color: "normal",
      brightness: 100,
      contrast: 105,
      saturation: 110,
      intScale: !1,
    },
    crt: {
      filter: "pixel",
      sharp: 0,
      scan: 40,
      vig: 45,
      perf: !1,
      color: "normal",
      brightness: 105,
      contrast: 108,
      saturation: 115,
      intScale: !1,
    },
  },
  clone = (e) => JSON.parse(JSON.stringify(e));
let S = Object.assign(clone(DEFAULTS), cfg.get("S", {}));
((S.keymap = Object.assign({}, DEFAULTS.keymap, S.keymap || {})),
  (S.keymap2 = Object.assign({}, DEFAULTS.keymap2, S.keymap2 || {})),
  S.resetMode !== "full" && (S.resetMode = "save"),
  S.filter === "crt" && ((S.filter = "pixel"), (S.scan = S.scan || 35), (S.vig = S.vig || 40)));
const persist = () => cfg.set("S", S);
let favs = new Set(cfg.get("favs", []));
const saveFavs = () => cfg.set("favs", [...favs]),
  reduceMotion = () => !!S.reduceAnim;
function openDB() {
  return new Promise((e, t) => {
    const a = indexedDB.open(DB, 2);
    ((a.onupgradeneeded = (s) => {
      const n = s.target.result;
      (n.objectStoreNames.contains(STORE) || n.createObjectStore(STORE, { keyPath: "name" }),
        n.objectStoreNames.contains("meta") || n.createObjectStore("meta"),
        n.objectStoreNames.contains("states") || n.createObjectStore("states", { keyPath: "id" }));
    }),
      (a.onsuccess = () => e(a.result)),
      (a.onerror = () => t(a.error)));
  });
}
async function dbSave(e) {
  const t = await openDB();
  return new Promise((a, s) => {
    const n = t.transaction(STORE, "readwrite"),
      o = n.objectStore(STORE);
    (o.clear(),
      e.forEach((i) => i.handle && o.put(slim(i))),
      (n.oncomplete = () => a()),
      (n.onerror = () => s(n.error)));
  });
}
async function dbLoad() {
  const e = await openDB();
  return new Promise((t, a) => {
    const s = e.transaction(STORE).objectStore(STORE).getAll();
    ((s.onsuccess = () => t(s.result)), (s.onerror = () => a(s.error)));
  });
}
async function idbOp(e, t, a) {
  const s = await openDB();
  return new Promise((n, o) => {
    const i = s.transaction(e, t),
      r = a(i.objectStore(e));
    ((i.oncomplete = () => n(r && r.result)),
      (i.onerror = () => o(i.error)),
      (i.onabort = () => o(i.error)));
  });
}
async function dbClear() {
  const e = await openDB();
  return new Promise((t, a) => {
    const s = e.transaction(STORE, "readwrite");
    (s.objectStore(STORE).clear(), (s.oncomplete = () => t()), (s.onerror = () => a(s.error)));
  });
}
/* ===== Consoles ===== */
const CONSOLES = {
  ps1: {
    name: "PS1", short: "PS1", core: "psx", icon: "fa-compact-disc", lvl: 3,
    folders: ["ps1", "psx", "playstation", "playstation1", "play1", "psone"],
    exts: /\.(chd|pbp|iso|bin|img)$/i, extTxt: ".chd .pbp .iso .bin .img",
    btns: ["UP", "DOWN", "LEFT", "RIGHT", "A", "B", "X", "Y", "L", "R", "L2", "R2", "START", "SELECT"],
    lbl: { A: "Botão ○ (A)", B: "Botão ✕ (B)", X: "Botão △ (X)", Y: "Botão □ (Y)", L: "Botão L1", R: "Botão R1", L2: "Botão L2", R2: "Botão R2", START: "Start", SELECT: "Select" },
  },
  md: {
    name: "Mega Drive", short: "MD", core: "segaMD", icon: "fa-gamepad", lvl: 2,
    folders: ["megadrive", "megadriver", "genesis", "segagenesis", "segamegadrive", "md"],
    exts: /\.(md|gen|smd|bin|zip|7z)$/i, extTxt: ".md .gen .smd .bin .zip",
    btns: ["UP", "DOWN", "LEFT", "RIGHT", "Y", "B", "A", "L", "X", "R", "START", "SELECT"],
    lbl: { Y: "Botão A", B: "Botão B", A: "Botão C", L: "Botão X", X: "Botão Y", R: "Botão Z", START: "Start", SELECT: "Mode" },
  },
  atari: {
    name: "Atari 2600", short: "Atari", core: "atari2600", icon: "fa-gamepad", lvl: 1,
    folders: ["atari", "atari2600", "2600"],
    exts: /\.(a26|bin|zip|7z)$/i, extTxt: ".a26 .bin .zip",
    btns: ["UP", "DOWN", "LEFT", "RIGHT", "B", "SELECT", "START"],
    lbl: { B: "Botão de tiro", SELECT: "Select", START: "Reset" },
  },
};

/* grupos da tela de consoles (vazio: PS1, Mega Drive e Atari ficam direto no carrossel) */
const HOME_GROUPS = {};
let homeSub = null; /* null = carrossel principal · "play" = dentro do grupo Play */
const groupOf = (k) => Object.keys(HOME_GROUPS).find((g) => HOME_GROUPS[g].kids.includes(k)) || null,
  kidsOf = (k) => (HOME_GROUPS[k] ? HOME_GROUPS[k].kids : [k]);

let SYS = null, /* console escolhido agora (null = tela de escolha) */
  ctx = "home"; /* "home" = página Consoles (sistema) · "console" = dentro de um console (jogos) */
const con = () => CONSOLES[SYS] || CONSOLES.ps1,
  coreOf = () => con().core,
  KLBL = () => Object.assign({ UP: "Cima", DOWN: "Baixo", LEFT: "Esquerda", RIGHT: "Direita" }, con().lbl),
  libSys = () => library.filter((x) => (x.sys || "ps1") === SYS),
  normFolder = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""),
  isIgn = (n) => ["psp", "playstationportable", "sonypsp"].includes(normFolder(n)),
  sysOfFolder = (n) => {
    const m = normFolder(n);
    return Object.keys(CONSOLES).find((k) => CONSOLES[k].folders.includes(m)) || null;
  },
  /* configurações que só aparecem de certo "nível" em diante (Atari 1, Mega Drive 2, PS1/PSP 3) */
  KEYLVL = { color: 2, saturation: 2, scan: 2, intScale: 2, gpSwap: 2, padType: 2, resetMode: 2, sharp: 3, vig: 3, rot: 3, perf: 3, autoOpt: 3 },
  ATARI_KEYS = new Set(["reduceAnim", "pad", "opacity", "scale", "vib", "gpOn", "filter", "aspect", "showFps", "autoPause", "notify"]),
  PADLBL = {
    md: { Y: "A", B: "B", A: "C", L: "X", X: "Y", R: "Z", START: "START", SELECT: "MODE" },
    atari: { B: "FIRE", SELECT: "SELECT", START: "RESET" },
  };

/* ===== Carrossel de consoles ===== */
const CF_COLORS = { play: "#fb3333", ps1: "#fb3333", psp: "#a855f7", md: "#3b82f6", atari: "#f59e0b" };
let cfIdx = 0,
  cfGo = null,
  cfDrag = null,
  cfMoved = false;

/* soltar o mouse/dedo: decide se foi arrasto (troca de card) ou clique */
window.addEventListener("pointerup", (e) => {
  if (!cfDrag) return;
  const dx = e.clientX - cfDrag.x,
    g = cfDrag.g;
  cfDrag = null;
  g.classList.remove("dragging");
  if (Math.abs(dx) > 8) {
    cfMoved = true;
    setTimeout(() => (cfMoved = false), 80);
    if (Math.abs(dx) > 40 && cfGo) cfGo(cfIdx + (dx < 0 ? 1 : -1));
  }
});
/* setas do teclado na tela de consoles */
window.addEventListener("keydown", (e) => {
  if (!cfGo || document.body.classList.contains("playing")) return;
  const v = $("#view-home");
  if (!v || !v.classList.contains("show")) return;
  if (e.code === "ArrowRight") cfGo(cfIdx + 1);
  else if (e.code === "ArrowLeft") cfGo(cfIdx - 1);
});

function renderHome(startIdx) {
  const g = $("#home-grid");
  if (!g) return;
  g.textContent = "";

  /* wrapper .cf (as setas e os pontinhos ficam dentro dele) */
  let cf = g.parentElement;
  if (!cf.classList.contains("cf")) {
    cf = document.createElement("div");
    cf.className = "cf";
    g.before(cf);
    cf.appendChild(g);
  }
  cf.querySelectorAll(".cf-arrow,.cf-dots,.cf-hint").forEach((x) => x.remove());
  const box = cf.parentElement;
  box.querySelectorAll(".cf-back").forEach((x) => x.remove());

  const ROOT = ["ps1", "md", "atari"],
    keys = homeSub ? HOME_GROUPS[homeSub].kids : ROOT;

  /* título e subtítulo mudam dentro do grupo */
  const ttl = $("#view-home .title"),
    sub = $("#view-home .subtitle");
  if (homeSub) {
    ttl.innerHTML = 'Escolha o <span class="red">' + HOME_GROUPS[homeSub].name + "</span>";
    sub.textContent = "Escolha entre " + keys.map((k) => CONSOLES[k].name).join(" e ") + ".";
  } else {
    ttl.innerHTML = 'Escolha o <span class="red">Console</span>';
    sub.textContent = "Cada console tem seus próprios jogos, controles, configurações e salas.";
  }

  /* botão Voltar (só dentro do grupo) */
  if (homeSub) {
    const bk = document.createElement("button");
    bk.type = "button";
    bk.className = "btn small ghost cf-back";
    bk.innerHTML = '<i class="fa-solid fa-arrow-left"></i><span>Voltar</span>';
    bk.onclick = () => {
      const was = homeSub;
      homeSub = null;
      renderHome(ROOT.indexOf(was));
    };
    cf.before(bk);
  }

  const cards = keys.map((k) => {
    const grp = HOME_GROUPS[k],
      c = grp || CONSOLES[k],
      n = kidsOf(k).reduce((s, x) => s + library.filter((l) => (l.sys || "ps1") === x).length, 0),
      b = document.createElement("button");
    b.type = "button";
    b.className = "cf-card";
    b.style.setProperty("--ac", CF_COLORS[k] || "#fb3333");
    b.innerHTML =
      '<div class="cf-ico"><i class="fa-solid ' + c.icon + '"></i></div><h3></h3><p></p>' +
      '<div class="on" data-on="' + k + '"><i class="fa-solid fa-circle"></i><b>0</b><span>Pessoas online</span></div>' +
      '<span class="cf-go">' + (grp ? "Abrir" : "Jogar") + "</span>";
    b.querySelector("h3").textContent = c.name;
    b.querySelector("p").textContent = n + " jogo(s)";
    g.appendChild(b);
    return b;
  });

  const mk = (cls, icon) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cf-arrow " + cls;
    b.setAttribute("aria-label", cls === "cf-prev" ? "Anterior" : "Próximo");
    b.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
    cf.appendChild(b);
    return b;
  };
  const prev = mk("cf-prev", "fa-chevron-left"),
    next = mk("cf-next", "fa-chevron-right");

  const dotsEl = document.createElement("div");
  dotsEl.className = "cf-dots";
  cf.appendChild(dotsEl);
  const dots = keys.map((k, i) => {
    const d = document.createElement("button");
    d.type = "button";
    d.className = "cf-dot";
    d.setAttribute("aria-label", (HOME_GROUPS[k] || CONSOLES[k]).name);
    d.onclick = () => go(i);
    dotsEl.appendChild(d);
    return d;
  });

  const hint = document.createElement("div");
  hint.className = "cf-hint";
  hint.textContent = "Arraste ou use as setas para trocar de console";
  cf.appendChild(hint);

  function render() {
    cards.forEach((c, i) => {
      const d = i - cfIdx,
        a = Math.abs(d);
      c.classList.toggle("active", d === 0);
      c.style.transform =
        "translate(-50%,-50%) translateX(" + d * 62 + "%) translateZ(" + -a * 140 + "px) " +
        "rotateY(" + -d * 28 + "deg) scale(" + (d === 0 ? 1 : 0.86) + ")";
      c.style.opacity = a > 2 ? 0 : 1 - a * 0.3;
      c.style.zIndex = 10 - a;
      c.style.pointerEvents = a > 2 ? "none" : "auto";
      c.tabIndex = d === 0 ? 0 : -1;
    });
    dots.forEach((d, i) => d.classList.toggle("active", i === cfIdx));
    prev.disabled = cfIdx === 0;
    next.disabled = cfIdx === cards.length - 1;
  }
  function go(i) {
    cfIdx = Math.max(0, Math.min(cards.length - 1, i));
    render();
  }
  cfGo = go;
  prev.onclick = () => go(cfIdx - 1);
  next.onclick = () => go(cfIdx + 1);

  /* clique: card lateral só centraliza; card central abre o grupo ou o console */
  cards.forEach((c, i) => {
    c.onclick = () => {
      if (cfMoved) return;
      if (i !== cfIdx) go(i);
      else if (HOME_GROUPS[keys[i]]) {
        homeSub = keys[i];
        renderHome(0);
      } else setSys(keys[i]);
    };
  });

  g.onpointerdown = (e) => {
    cfDrag = { x: e.clientX, g };
    g.classList.add("dragging");
  };

  /* posição inicial */
  let st = startIdx;
  if (st == null) {
    const t = keys.includes(SYS) ? SYS : groupOf(SYS);
    st = t && keys.includes(t) ? keys.indexOf(t) : Math.min(cfIdx, keys.length - 1);
  }
  cfIdx = Math.max(0, Math.min(keys.length - 1, st));
  render();
  updateOnline();
}
function setSys(k, quiet) {
  if (!CONSOLES[k]) return;
  SYS = k;
  filter = "all";
  query = "";
  const s = $("#search");
  s && (s.value = "");
  document.body.dataset.sys = k;
  moveInd();
  $("#tab-con-t").textContent = CONSOLES[k].short;
  applyConsoleUI();
  renderLibrary();
  quiet || goView("library");
}
/* Configurações: na página Consoles só o "sistema"; dentro de um console só controles e vídeo */
const SYS_PANES = ["geral", "permissao", "dados", "sobre"],
  GAME_PANES = ["controles", "video"];
function applySettingsScope() {
  const ok = ctx === "home" || !SYS ? SYS_PANES : GAME_PANES,
    btns = $$("#set-nav button");
  btns.forEach((b) => b.classList.toggle("sysoff", !ok.includes(b.dataset.pane)));
  const act = btns.find((b) => b.classList.contains("active"));
  if (!act || act.classList.contains("sysoff")) {
    const f = btns.find((b) => !b.classList.contains("sysoff"));
    f && f.click();
  }
}
/* opções de controle que estavam em "Geral" vão para a aba Controles (são do jogo) */
(function () {
  const h = $$("#pane-controles .gs-h").find((x) => /toque/i.test(x.textContent));
  if (!h) return;
  let ref = h;
  ["pad", "opacity", "vib"].forEach((k) => {
    const row = $('#pane-geral [data-key="' + k + '"]');
    const r = row && row.closest(".row");
    r && (ref.insertAdjacentElement("afterend", r), (ref = r));
  });
})();
function onlineOf(k) {
  try {
    return kidsOf(k).reduce((s, x) => s + ((mp.online && mp.online[x]) || 0), 0);
  } catch {
    return 0;
  }
}
function updateOnline() {
  $$("[data-on]").forEach((el) => {
    const n = onlineOf(el.dataset.on);
    el.querySelector("b").textContent = n;
    el.querySelector("span").textContent = n === 1 ? "Pessoa online" : "Pessoas online";
  });
}
function applyConsoleUI() {
  const lv = SYS ? con().lvl : 3;
  $$("#view-settings [data-key], #gs-content [data-key]").forEach((el) => {
    const row = el.closest(".row");
    row && row.classList.toggle("sysoff", SYS === "atari" ? !ATARI_KEYS.has(el.dataset.key) : lv < (KEYLVL[el.dataset.key] || 1));
  });
  ["presets", "presets2"].forEach((id) => {
    const w = document.getElementById(id) && document.getElementById(id).closest(".gs-pre");
    if (!w) return;
    const off = lv < 2,
      h = w.previousElementSibling,
      t = w.nextElementSibling;
    w.classList.toggle("sysoff", off);
    h && h.classList.contains("gs-h") && h.classList.toggle("sysoff", off);
    t && t.classList.contains("gs-hint") && t.classList.toggle("sysoff", off);
  });
  $$("#view-settings .gs-h, #gs-content .gs-h").forEach((h) => {
    if (h.nextElementSibling && h.nextElementSibling.classList.contains("gs-pre")) return;
    const rows = [];
    let n = h.nextElementSibling;
    while (n && !n.classList.contains("gs-h")) {
      n.classList.contains("row") && rows.push(n);
      n = n.nextElementSibling;
    }
    h.classList.toggle("sysoff", rows.length > 0 && rows.every((r) => r.classList.contains("sysoff")));
  });
  applyConsolePad();
}
function applyConsolePad() {
  const c = con(),
    lb = PADLBL[SYS] || {};
  $$("#pad .pb[data-btn]").forEach((el) => {
    if (el.closest("#dpad")) return;
    const b = el.dataset.btn;
    el.dataset.o === void 0 && (el.dataset.o = el.textContent);
    el.classList.toggle("nc", !c.btns.includes(b));
    el.textContent = lb[b] || el.dataset.o;
  });
  try {
    layoutPad();
  } catch {}
}
function renderCheck(el, found, counts, extra) {
  if (!el) return;
  el.textContent = "";
  Object.entries(CONSOLES).forEach(([k, c]) => {
    const ok = !!found[k],
      d = document.createElement("div");
    d.className = "chk " + (ok ? "ok" : "bad");
    d.innerHTML = '<i class="fa-solid ' + (ok ? "fa-circle-check" : "fa-circle-xmark") + '"></i><span></span><b></b>';
    d.children[1].textContent = c.short + " · " + c.name;
    d.children[2].textContent = ok ? (counts[k] || 0) + " jogo(s)" : "pasta não encontrada";
    el.appendChild(d);
  });
  (extra || []).forEach((nm) => {
    const d = document.createElement("div");
    d.className = "chk bad";
    d.innerHTML = '<i class="fa-solid fa-folder-minus"></i><span></span><b>remova esta pasta</b>';
    d.children[1].textContent = "Pasta extra · " + nm;
    el.appendChild(d);
  });
}
function fmtName(e) {
  const t = e.replace(/\.[^/.]+$/, ""),
    a = (t.match(/[\(\[]([^)\]]+)[\)\]]/) || [])[1] || null;
  return {
    display:
      t
        .replace(/[\(\[][^)\]]+[\)\]]/g, "")
        .replace(/[._]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/^[-\s]+|[-\s]+$/g, "") ||
      a ||
      t,
    tag: a,
  };
}
function showBanner(e, t = 5e3) {
  const a = $("#banner");
  a.textContent = "";
  const s = document.createElement("i");
  s.className = "fa-solid fa-triangle-exclamation";
  const n = document.createElement("span");
  ((n.textContent = e),
    a.append(s, n),
    (a.style.display = "none"),
    a.offsetWidth,
    (a.style.display = "flex"),
    clearTimeout(showBanner.t),
    (showBanner.t = setTimeout(() => (a.style.display = "none"), t)));
}
function toast(e, ms) {
  $("#toast-text").textContent = e;
  const t = $("#toast");
  (t.classList.remove("show"),
    t.offsetWidth,
    t.classList.add("show"),
    clearTimeout(toast.t),
    (toast.t = setTimeout(() => t.classList.remove("show"), ms || 2200)));
}
const conv = (e) => (e !== "" && !isNaN(e) ? Number(e) : e);
function keyLabel(e) {
  return e
    ? {
        ArrowUp: "\u2191",
        ArrowDown: "\u2193",
        ArrowLeft: "\u2190",
        ArrowRight: "\u2192",
        Enter: "Enter",
        Space: "Espa\xE7o",
        ShiftLeft: "Shift Esq.",
        ShiftRight: "Shift Dir.",
        ControlLeft: "Ctrl Esq.",
        ControlRight: "Ctrl Dir.",
        AltLeft: "Alt Esq.",
        AltRight: "Alt Dir.",
        Backspace: "Backspace",
        Tab: "Tab",
        NumpadEnter: "Num Enter",
      }[e] ||
        e
          .replace(/^Key/, "")
          .replace(/^Digit/, "")
          .replace(/^Numpad/, "Num ")
    : "\u2014";
}
document.addEventListener("pointerdown", (e) => {
  const t = e.target.closest(
    ".btn,.chip,.tab,.ibtn,.seg button,.km-key,.set-nav button,.gs-nav button",
  );
  if (!t || reduceMotion()) return;
  const a = t.getBoundingClientRect(),
    s = Math.max(a.width, a.height) * 2,
    n = document.createElement("span");
  ((n.className = "rip"),
    (n.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - a.left - s / 2}px;top:${e.clientY - a.top - s / 2}px`),
    t.appendChild(n),
    setTimeout(() => n.remove(), 650));
});
function updateSegs(e = document) {
  e.querySelectorAll(".seg").forEach((t) => {
    const a = t.querySelector("button.active");
    if (!a) {
      t.style.setProperty("--o", 0);
      return;
    }
    t.offsetWidth &&
      (t.style.setProperty("--x", a.offsetLeft - 3 + "px"),
      t.style.setProperty("--y", a.offsetTop - 3 + "px"),
      t.style.setProperty("--w", a.offsetWidth + "px"),
      t.style.setProperty("--h", a.offsetHeight + "px"),
      t.style.setProperty("--o", 1));
  });
}
function rangeFill(e) {
  const t = +e.min || 0,
    a = +e.max || 100;
  e.style.setProperty("--p", ((e.value - t) / (a - t)) * 100 + "%");
}
function syncUI(e, t) {
  (e.querySelectorAll("[data-key]").forEach((a) => {
    const s = a.dataset.key;
    s in t &&
      (a.classList.contains("seg")
        ? a
            .querySelectorAll("button")
            .forEach((n) => n.classList.toggle("active", n.dataset.v === String(t[s])))
        : a.type === "checkbox"
          ? (a.checked = !!t[s])
          : ((a.value = t[s]), a.type === "range" && rangeFill(a)));
  }),
    e.querySelectorAll("[data-val]").forEach((a) => {
      a.textContent = t[a.dataset.val] + (a.dataset.suf || "");
    }),
    updateSegs(e));
}
function bindUI(e, t, a) {
  (e.addEventListener("input", (s) => {
    const n = s.target;
    if (!n.dataset || !n.dataset.key || n.classList.contains("seg")) return;
    const o = t(),
      i = n.dataset.key;
    ((o[i] = n.type === "checkbox" ? n.checked : n.type === "range" ? +n.value : conv(n.value)),
      syncUI(e, o),
      a(i));
  }),
    e.addEventListener("click", (s) => {
      const n = s.target.closest(".seg[data-key] button");
      if (!n) return;
      const o = t(),
        i = n.parentElement.dataset.key;
      ((o[i] = conv(n.dataset.v)), syncUI(e, o), a(i));
    }));
}
function moveInd() {
  const e = $(".tab.active"),
    t = $("#tab-ind");
  !e ||
    !e.offsetWidth ||
    ((t.style.width = e.offsetWidth + "px"), (t.style.transform = `translateX(${e.offsetLeft}px)`));
}
let vTok = 0,
  freshT = 0;
function viewIn(e) {
  if (
    (e.classList.remove("in"),
    e.offsetWidth,
    e.classList.add("in"),
    e.addEventListener("animationend", function t(a) {
      a.target === e && (e.removeEventListener("animationend", t), e.classList.remove("in"));
    }),
    e.id === "view-library")
  ) {
    const t = $("#grid");
    (t.classList.add("fresh"),
      clearTimeout(freshT),
      (freshT = setTimeout(() => t.classList.remove("fresh"), 1200)));
  }
}
function goView(e) {
  if (e === "home") {
    homeSub = groupOf(SYS);
    renderHome();
  }
  e === "home" ? (ctx = "home") : (e === "library" || e === "multi") && (ctx = "console");
  typeof mpPresence === "function" && mpPresence();
  const t = $("#view-" + e),
    a = $(".view.show"),
    s = ++vTok;
  if (
    ($$(".tab").forEach((o) => o.classList.toggle("active", o.dataset.view === e)),
    moveInd(),
    (capturing = null),
    (capObj = null),
    e === "settings" &&
      (applySettingsScope(),
      syncUI($("#view-settings"), S),
      applyConsoleUI(),
      renderKeysTable(),
      syncPreset2(),
      renderPerm(),
      biosRefresh()),
    a === t)
  ) {
    a.classList.remove("out");
    return;
  }
  const n = () => {
    s === vTok &&
      ($$(".view").forEach((o) => {
        o !== t && o.classList.remove("show", "out", "in");
      }),
      t.classList.add("show"),
      viewIn(t));
  };
  a && !reduceMotion() && !document.body.classList.contains("booting")
    ? (a.classList.add("out"), setTimeout(n, 170))
    : n();
}
($$(".tab").forEach(
  (e) =>
    (e.onclick = () => {
      const v = e.dataset.view;
      if (!SYS && (v === "library" || v === "multi")) {
        goView("home");
        toast("Escolha um console primeiro");
        return;
      }
      v === "multi" ? mpOpenTab() : goView(v);
    }),
),
  $$("#set-nav button").forEach(
    (e) =>
      (e.onclick = () => {
        ($$("#set-nav button").forEach((t) => t.classList.toggle("active", t === e)),
          $$(".pane").forEach((t) => t.classList.toggle("show", t.id === "pane-" + e.dataset.pane)),
          updateSegs($("#view-settings")));
      }),
  ));
function renderKeysTable(k) {
  const e = KLBL(),
    t = $("#keys-table");
  ((t.textContent = ""),
    con().btns.forEach((a) => {
      const s = t.insertRow(),
        n = s.insertCell(),
        o = s.insertCell(),
        i = document.createElement("button"),
        w = capturing === a && capObj && capP === kP;
      ((i.className = "km-key" + (w ? " wait" : "") + (k === a ? " set" : "")),
        (n.textContent = e[a]),
        (i.textContent = w ? "Pressione..." : keyLabel(S[KMK[kP]][a])),
        (i.onclick = () => {
          const sm = capturing === a && capObj && capP === kP;
          ((capObj = S),
            (capP = kP),
            (capturing = sm ? null : a),
            capturing || (capObj = null),
            renderKeysTable());
        }),
        o.appendChild(i));
    }));
}
function showApp() {
  ($("#setup").classList.add("hidden"),
    $("#app-header").classList.remove("hidden"),
    renderHome(),
    renderLibrary(),
    typeof mpConnect === "function" && mpConnect().then(() => mpPresence(), () => {}),
    goView(SYS ? "library" : "home"),
    cfg.set("setupDone", 1),
    window.__plPend &&
      !document.body.classList.contains("booting") &&
      setTimeout(() => window.mpLinkJoin && mpLinkJoin(), 400));
}
window.addEventListener("resize", () => {
  (moveInd(), updateSegs());
});
const steps = ["st1", "st2", "st-load", "st-err", "st3"];
let curStep = "st1";
function showStep(e, t) {
  const a = $("#" + curStep),
    s = $("#" + e),
    n = () => {
      (steps.forEach((o) => {
        o !== e && $("#" + o).classList.add("hidden");
      }),
        s.classList.remove("hidden", "leave", "enter"),
        s.offsetWidth,
        s.classList.add("enter"));
    };
  (!t && a !== s && !a.classList.contains("hidden")
    ? (a.classList.remove("enter"),
      a.classList.add("leave"),
      setTimeout(
        () => {
          (a.classList.remove("leave"), n());
        },
        reduceMotion() ? 0 : 260,
      ))
    : n(),
    (curStep = e));
}
$("#btn-mponly").onclick = () => {
  showApp();
  window.__plPend || toast("Escolha um console para ver as salas", 3500);
};
$("#btn-start").onclick = () => showStep("st2");
$("#btn-pick").onclick = () => pickFolder();
$("#btn-change").onclick = () => pickFolder();
$("#btn-retry").onclick = () => {
  $("#folder-input").value = "";
  showStep("st2");
};
$("#btn-finish").onclick = showApp;
$("#folder-input").onchange = (e) => {
  const fs = [...e.target.files],
    found = {},
    items = [],
    extra = [],
    fo = {};
  if (!fs.length) return;
  fs.forEach((f) => {
    const p = (f.webkitRelativePath || "").split("/");
    if (p.length < 3) return;
    const nm = p[1];
    if (nm.startsWith(".") || isIgn(nm)) return;
    const s = sysOfFolder(nm);
    if (s && (!fo[s] || fo[s] === nm)) {
      fo[s] = nm;
      found[s] = 1;
      items.push({ name: f.name, size: f.size, lastModified: f.lastModified, file: f, sys: s });
    } else if (!extra.includes(nm)) extra.push(nm);
  });
  importFiles(items, e.target, found, extra);
};
async function importFiles(e, t, found, extra) {
  if (!e.length && !found) return;
  e = [...e].map(toItem);
  found = found || {};
  extra = extra || [];
  const a = !$("#app-header").classList.contains("hidden"),
    n = [...new Map(e.filter((o) => ROM_OK(o.name, o.sys)).map((o) => [o.sys + "/" + o.name, o])).values()],
    miss = Object.keys(CONSOLES).filter((k) => !found[k]),
    counts = {};
  n.forEach((o) => (counts[o.sys] = (counts[o.sys] || 0) + 1));
  const parts = [];
  if (miss.length) parts.push("Faltando: " + miss.map((k) => CONSOLES[k].short).join(", ") + ".");
  if (extra.length) parts.push("Pasta(s) não permitida(s): " + extra.join(", ") + ".");
  const msg = parts.length
    ? "A pasta principal deve ter somente 3 pastas: PS1, Mega Drive e Atari. " + parts.join(" ")
    : !n.length && !window.__plPend
      ? "Nenhuma ROM compatível foi encontrada nas pastas dos consoles."
      : "";
  if (a) {
    if (msg) {
      toast(msg, 8000);
      t && (t.value = "");
      return;
    }
    try {
      (await dbSave(n), (library = n), renderHome(), renderLibrary(), SYS ? goView("library") : goView("home"), toast(n.length + " jogo(s) carregado(s)"));
    } catch {
      showBanner("Não foi possível salvar os jogos.");
    }
    t && (t.value = "");
    return;
  }
  showStep("st-load");
  $("#log").textContent = "> Lendo a pasta...";
  await sleep(600);
  $("#log").textContent = "> Conferindo a estrutura das pastas...";
  await sleep(600);
  if (msg) {
    $("#err-msg").textContent = msg;
    renderCheck($("#err-chk"), found, counts, extra);
    showStep("st-err");
    return;
  }
  try {
    await dbSave(n);
  } catch {
    $("#err-msg").textContent = "Não foi possível salvar os jogos neste navegador.";
    renderCheck($("#err-chk"), {}, {});
    showStep("st-err");
    return;
  }
  library = n;
  $("#summary").textContent = n.length ? `Pronto! ${n.length} jogo(s) encontrado(s).` : "Pasta selecionada! Entrando na sala...";
  renderCheck($("#sum-chk"), found, counts);
  showStep("st3");
  window.__plPend &&
    setTimeout(() => {
      curStep === "st3" && showApp();
    }, 1200);
}
const ROM_OK = (n, sys) => {
  const c = CONSOLES[sys];
  return !!c && c.exts.test(n) && (sys !== "ps1" || !/\(track\s*0*(?:[2-9]|[1-9]\d+)\)/i.test(n));
};
function toItem(x) {
  return x.handle || x.file
    ? x
    : { name: x.name, size: x.size, lastModified: x.lastModified, file: x };
}
function slim(i) {
  return { name: i.name, size: i.size, lastModified: i.lastModified, handle: i.handle, sys: i.sys || "ps1" };
}
async function romFile(t) {
  if (t.file) return t.file;
  if (t.handle) {
    let p = await t.handle.queryPermission({ mode: "read" });
    p !== "granted" && (p = await t.handle.requestPermission({ mode: "read" }));
    if (p === "granted") return t.handle.getFile();
  }
  throw 0;
}
let dirHandle = null,
  syncBusy = !1,
  askedPerm = !1;
async function romHandles(e, t = 0, a = [], sys) {
  for await (const [s, n] of e.entries())
    n.kind === "file" && ROM_OK(s, sys)
      ? a.push([s, n, sys])
      : n.kind === "directory" && t < 3 && !s.startsWith(".") && (await romHandles(n, t + 1, a, sys));
  return a;
}
/* a pasta escolhida precisa ter só as subpastas dos consoles */
async function scanRoot(root) {
  const found = {},
    items = [],
    extra = [];
  for await (const [nm, h] of root.entries())
    if (h.kind === "directory") {
      if (nm.startsWith(".") || isIgn(nm)) continue;
      const s = sysOfFolder(nm);
      if (s && !found[s]) {
        found[s] = 1;
        (await romHandles(h, 0, [], s)).forEach((x) => items.push(x));
      } else extra.push(nm);
    }
  return { found, items, extra };
}
async function pickFolder() {
  if (!window.showDirectoryPicker) {
    $("#folder-input").click();
    return;
  }
  try {
    const e = await window.showDirectoryPicker({ id: "playrom-roms", mode: "read" }),
      sc = await scanRoot(e),
      t = await Promise.all(
        sc.items.map(async ([, a, s]) => {
          const f = await a.getFile();
          return { name: f.name, size: f.size, lastModified: f.lastModified, handle: a, file: f, sys: s };
        }),
      );
    if (Object.keys(CONSOLES).every((k) => sc.found[k]) && !sc.extra.length) {
      ((dirHandle = e), (askedPerm = !0));
      try {
        await idbOp("meta", "readwrite", (a) => a.put(e, "dir"));
      } catch {}
    }
    await importFiles(t, null, sc.found, sc.extra);
  } catch (e) {
    (!e || e.name !== "AbortError") && showBanner("N\xE3o foi poss\xEDvel abrir a pasta.");
  }
}
/* gera um .zip só com as 3 pastas vazias */
function downloadStructure() {
  const root = "PlayRom-Jogos",
    names = ["PS1", "Mega Drive", "Atari"],
    enc = new TextEncoder(),
    paths = [root + "/", ...names.map((n) => root + "/" + n + "/")],
    d = new Date(),
    time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    local = [],
    central = [];
  let off = 0,
    cdSize = 0;
  paths.forEach((p) => {
    const nb = enc.encode(p),
      lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint16(26, nb.length, true);
    local.push(new Uint8Array(lh.buffer), nb);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint16(28, nb.length, true);
    ch.setUint32(38, 0x10, true); /* atributo de diretório */
    ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);

    off += 30 + nb.length;
    cdSize += 46 + nb.length;
  });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, paths.length, true);
  end.setUint16(10, paths.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, off, true);
  const blob = new Blob([...local, ...central, new Uint8Array(end.buffer)], { type: "application/zip" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "PlayRom-Jogos.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Estrutura baixada. Extraia o .zip e coloque as ROMs nas pastas");
}
document.addEventListener("click", (e) => {
  e.target.closest("#btn-zip") && downloadStructure();
});
async function syncFolder(e) {
  if (!(!dirHandle || syncBusy || document.hidden || document.body.classList.contains("playing"))) {
    syncBusy = !0;
    try {
      let t = await dirHandle.queryPermission({ mode: "read" });
      if (
        (t !== "granted" && e && (t = await dirHandle.requestPermission({ mode: "read" })),
        t !== "granted")
      )
        return;
      const a = new Set(library.map((i) => (i.sys || "ps1") + "/" + i.name)),
        s = (await scanRoot(dirHandle)).items.filter(([i, , sy]) => !a.has(sy + "/" + i));
      if (!s.length) return;
      const n = await Promise.all(
          s.map(async ([, i, sy]) => {
            const f = await i.getFile();
            return { name: f.name, size: f.size, lastModified: f.lastModified, handle: i, file: f, sys: sy };
          }),
        ),
        o = [...new Map(n.map((i) => [i.sys + "/" + i.name, i])).values()];
      ((library = [...library, ...o]),
        await dbSave(library),
        document.body.classList.contains("playing") ||
          (renderLibrary(),
          toast(
            o.length === 1 ? "1 novo jogo adicionado" : o.length + " novos jogos adicionados",
          )));
    } catch (t) {
      console.warn("sync", t);
    } finally {
      syncBusy = !1;
    }
  }
}
(document.addEventListener(
  "click",
  () => {
    askedPerm || !dirHandle || ((askedPerm = !0), syncFolder(!0));
  },
  !0,
),
  document.addEventListener("visibilitychange", () => {
    document.hidden || syncFolder(!1);
  }),
  window.addEventListener("focus", () => syncFolder(!1)),
  setInterval(() => syncFolder(!1), 1e4));
function renderChips() {
  const L = libSys(),
    e = { all: L.length, fav: 0 };
  L.forEach((s) => {
    favs.has(s.name) && e.fav++;
  });
  const t = [
      ["all", "Todos", "fa-layer-group"],
      ["fav", "Favoritos", "fa-heart"],
    ],
    a = $("#chips");
  ((a.textContent = ""),
    t.forEach(([s, n, o]) => {
      const i = document.createElement("button");
      ((i.className = "chip" + (filter === s ? " active" : "")),
        (i.innerHTML = `<i class="fa-solid ${o}"></i>${n}<span class="n">${e[s]}</span>`),
        (i.onclick = () => {
          ((filter = s), renderLibrary());
        }),
        a.appendChild(i));
    }));
}
function renderLibrary() {
  renderChips();
  const e = $("#grid");
  e.textContent = "";
  const t = query.trim().toLowerCase(),
    a = library
      .map((s, n) => ({ f: s, i: n }))
      .filter(({ f: s }) => (s.sys || "ps1") === SYS)
      .filter(({ f: s }) =>
        filter === "fav" && !favs.has(s.name)
          ? !1
          : !t || fmtName(s.name).display.toLowerCase().includes(t),
      )
      .sort((s, n) => fmtName(s.f.name).display.localeCompare(fmtName(n.f.name).display, "pt-BR"));
  if (
    (($("#lib-sub").textContent =
      `${libSys().length} jogo(s) · ${con().name}` +
      (a.length !== libSys().length ? ` \xB7 ${a.length} exibido(s)` : "")),
    !a.length)
  ) {
    const s = document.createElement("p");
    ((s.className = "empty"),
      (s.textContent = libSys().length
        ? "Nenhum jogo encontrado com esse filtro."
        : "Nenhum jogo de " + con().name + " encontrado. Coloque ROMs (" + con().extTxt + ") na pasta desse console e escolha a pasta de novo em Configurações > Biblioteca."),
      e.appendChild(s));
    return;
  }
  a.forEach(({ f: s, i: n }, o) => {
    const { display: i, tag: r } = fmtName(s.name),
      c = document.createElement("div");
    ((c.className = "game" + (o < 18 ? " a" : "")), (c.style.animationDelay = o * 30 + "ms"));
    const l = document.createElement("button");
    ((l.className = "fav" + (favs.has(s.name) ? " on" : "")),
      (l.title = "Favoritar"),
      (l.innerHTML = '<i class="fa-solid fa-heart"></i>'),
      (l.onclick = (p) => {
        p.stopPropagation();
        const m = favs.has(s.name);
        (m ? favs.delete(s.name) : favs.add(s.name),
          saveFavs(),
          l.classList.toggle("on", !m),
          l.classList.remove("pop"),
          l.offsetWidth,
          m || l.classList.add("pop"),
          renderChips(),
          filter === "fav" &&
            m &&
            (c.classList.add("leaving"), setTimeout(renderLibrary, reduceMotion() ? 0 : 250)));
      }));
    const u = document.createElement("div");
    ((u.className = "disc"), (u.innerHTML = '<i class="fa-solid fa-gamepad"></i>'));
    const d = document.createElement("div");
    ((d.className = "g-name"), (d.textContent = i));
    const f = document.createElement("div");
    ((f.className = "g-meta"),
      (f.textContent = con().short + (r ? " \xB7 " + r : "")),
      c.append(l, u, d, f),
      (c.onclick = () => playGame(n)),
      e.appendChild(c));
  });
}
$("#search").oninput = (e) => {
  query = e.target.value;
  renderLibrary();
};

async function biosRefresh() {
  let b = null;
  try {
    b = await idbOp("meta", "readonly", (s) => s.get("bios"));
  } catch {}
  const has = !!(b && b.size);
  $("#bios-desc").textContent = has
    ? "BIOS carregada (" + Math.round(b.size / 1024) + " KB). Os jogos novos vão usá-la."
    : "Sem BIOS, muitos jogos travam ou ficam com imagem bugada. Escolha um arquivo scph*.bin seu.";
  $("#btn-bios-x").classList.toggle("hidden", !has);
  $("#btn-bios").textContent = has ? "Trocar" : "Escolher";
}

$("#btn-bios").onclick = () => $("#bios-input").click();
$("#bios-input").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (f.size < 256 * 1024 || f.size > 1024 * 1024) {
    toast("Arquivo inválido: a BIOS do PS1 tem 512 KB");
    return;
  }
  try {
    await idbOp("meta", "readwrite", (s) => s.put(f, "bios"));
    toast("BIOS salva");
    biosRefresh();
  } catch {
    toast("Não consegui salvar a BIOS");
  }
};
$("#btn-bios-x").onclick = async () => {
  try {
    await idbOp("meta", "readwrite", (s) => s.delete("bios"));
  } catch {}
  biosRefresh();
  toast("BIOS removida");
};
(($("#btn-clear-fav").onclick = () => {
  (favs.clear(), saveFavs(), renderLibrary(), toast("Favoritos limpos"));
}),
  ($("#btn-clear").onclick = async () => {
    if (confirm("Limpar a biblioteca? Os jogos salvos no navegador ser\xE3o removidos.")) {
      try {
        await dbClear();
      } catch {}
      dirHandle = null;
      try {
        await idbOp("meta", "readwrite", (e) => e.delete("dir"));
      } catch {}
      ((library = []),
        (SYS = null),
        (homeSub = null),
        delete document.body.dataset.sys,
        favs.clear(),
        saveFavs(),
        $("#app-header").classList.add("hidden"),
        $$(".view").forEach((e) => e.classList.remove("show")),
        $("#setup").classList.remove("hidden"),
        showStep("st1", !0),
        ($("#folder-input").value = ""));
    }
  }));
let fpsCap = 60,
  lastT = 0,
  frames = 0,
  hz = 60;
const rawRAF = window.requestAnimationFrame.bind(window),
  rawCAF = window.cancelAnimationFrame.bind(window),
  rafMap = new Map(),
  limMap = new WeakMap(),
  playerEl = $("#player");
let rafId = 1e9;
/* mede a taxa real de atualização da tela (Hz): só limita o FPS quando a tela é mais rápida que o jogo */ (function () {
  let n = 0,
    last = 0;
  const d = [];
  function f(t) {
    last && d.push(t - last);
    last = t;
    if (++n < 60) rawRAF(f);
    else {
      d.sort((x, y) => x - y);
      hz = Math.max(24, Math.min(1e3, Math.round(1e3 / (d[d.length >> 1] || 16.7))));
    }
  }
  rawRAF(f);
})();
((window.requestAnimationFrame = (e) => {
  if (!playerEl.classList.contains("show") || !fpsCap || hz <= fpsCap * 1.12)
    return rawRAF((n) => {
      (frames++, e(n));
    });
  const t = rafId++,
    a = 1e3 / fpsCap,
    s = (n) => {
      if (!rafMap.has(t)) return;
      let q = limMap.get(e);
      if (!q) {
        q = { t: n - a };
        limMap.set(e, q);
      }
      if (n - q.t < a - Math.max(2, 0.6 * (1e3 / hz))) {
        rafMap.set(t, rawRAF(s));
        return;
      }
      q.t = n - q.t > a * 2.5 ? n : q.t + a;
      rafMap.delete(t);
      frames++;
      e(n);
    };
  return (rafMap.set(t, rawRAF(s)), t);
}),
  (window.cancelAnimationFrame = (e) => {
    rafMap.has(e) ? (rawCAF(rafMap.get(e)), rafMap.delete(e)) : rawCAF(e);
  }));
let lastFrames = 0;
setInterval(() => {
  if (!$("#player").classList.contains("show")) return;
  const e = frames - lastFrames;
  ((lastFrames = frames),
    ($("#fps").textContent =
      (paused || autoPaused || gsOpen || svOpen || rsOpen ? 0 : e) + " FPS"));
  autoOptTick(paused || autoPaused || gsOpen || svOpen || rsOpen ? 0 : e);
}, 1e3);
let cur = S;
function padVisible(e) {
  return e.pad === "on"
    ? !0
    : e.pad === "off"
      ? !1
      : matchMedia("(pointer:coarse)").matches ||
        (navigator.maxTouchPoints > 0 && !matchMedia("(hover:hover)").matches);
}
function layoutInt() {
  const e = $("#ejs-box");
  if (!cur.intScale || cur.aspect === "stretch" || cur.rot % 180) {
    e.dataset.int = "0";
    return;
  }
  const t = 320,
    a = 240,
    s = cur.aspect === "43" ? 4 / 3 : cur.aspect === "169" ? 16 / 9 : t / a,
    n = e.clientWidth,
    o = e.clientHeight;
  if (n < t || o < t / s) {
    e.dataset.int = "0";
    return;
  }
  const i = Math.max(1, Math.floor(Math.min(n / t, o / (t / s))));
  (e.style.setProperty("--iw", t * i + "px"),
    e.style.setProperty("--ih", Math.round((t * i) / s) + "px"),
    (e.dataset.int = "1"));
}
new ResizeObserver(() => layoutInt()).observe($("#ejs-box"));
function applyAll(e) {
  e = autoOptApply(e);
  /* modo leve no celular: sem filtros pesados de GPU durante o jogo */
  $("#player").classList.contains("show") &&
    isMobDev() &&
    (e = Object.assign({}, e, { perf: !0, scan: 0, vig: 0, sharp: 0 }));
  cur = e;
  const t = $("#ejs-box");
  ((t.dataset.filter = e.filter),
    (t.dataset.aspect = e.aspect),
    (t.dataset.rot = String(e.rot)),
    t.style.setProperty(
      "--ar",
      e.aspect === "43" ? "1.3333" : e.aspect === "169" ? "1.7778" : "var(--orig)",
    ),
    t.style.setProperty("--zoom", e.zoom / 100),
    t.style.setProperty("--rot", e.rot));
  const a = [];
  if (!e.perf) {
    e.brightness != 100 && a.push(`brightness(${e.brightness}%)`);
    e.contrast != 100 && a.push(`contrast(${e.contrast}%)`);
    e.saturation != 100 && a.push(`saturate(${e.saturation}%)`);
    const l = { gray: "grayscale(1)", sepia: "sepia(.85)", vivid: "saturate(1.35) contrast(1.08)" }[
      e.color
    ];
    (l && a.push(l), e.sharp > 0 && !isMobDev() && a.push("url(#sharp)"));
  }
  t.style.filter = a.join(" ") || "none";
  const s = (e.sharp / 100) * 0.9;
  $("#sharpK").setAttribute("kernelMatrix", `0 ${-s} 0 ${-s} ${1 + 4 * s} ${-s} 0 ${-s} 0`);
  const n = $("#crt"),
    o = e.perf ? 0 : e.scan,
    i = e.perf ? 0 : e.vig;
  (n.style.setProperty("--scan", o / 100),
    n.style.setProperty("--vig", i / 100),
    n.classList.toggle("on", o > 0 || i > 0),
    $("#fps").classList.toggle("hidden", !e.showFps),
    (fpsCap = Number(e.fps) || 0));
  const r = document.documentElement.style;
  (r.setProperty("--pad-opacity", e.opacity / 100), r.setProperty("--ps", e.scale / 100));
  const c = $("#player").classList.contains("show") && (padEdit || padVisible(e));
  ($("#pad").classList.toggle("show", c),
    $("#stage").classList.toggle("pad-on", c),
    document.body.classList.toggle("reduce-anim", !!e.reduceAnim),
    layoutInt(),
    layoutPad());
}
bindUI(
  $("#view-settings"),
  () => S,
  () => {
    (persist(), applyAll(S), syncPreset2());
  },
);
function syncPreset2() {
  ($$("#presets2 button").forEach((e) => {
    const t = PRESETS[e.dataset.preset];
    e.classList.toggle(
      "active",
      Object.keys(t).every((a) => S[a] === t[a]),
    );
  }),
    updateSegs($("#view-settings")));
}
$$("#presets2 button").forEach(
  (e) =>
    (e.onclick = () => {
      (Object.assign(S, PRESETS[e.dataset.preset]),
        persist(),
        applyAll(S),
        syncUI($("#view-settings"), S),
        syncPreset2());
    }),
);
const PAD = {
    B: 0,
    Y: 1,
    SELECT: 2,
    START: 3,
    UP: 4,
    DOWN: 5,
    LEFT: 6,
    RIGHT: 7,
    A: 8,
    X: 9,
    L: 10,
    R: 11,
    L2: 12,
    R2: 13,
  },
  srcs = {},
  sent = {};
let codeToBtn = {};
let codeToBtn0 = {};
function buildLookup() {
  ((codeToBtn = {}),
    (codeToBtn0 = {}),
    KMK.forEach((k, p) =>
      Object.entries(S[k] || {}).forEach(([e, t]) => {
        t &&
          ((codeToBtn[t] = { p: p, b: e }),
          /^Shift/.test(t) && (codeToBtn.ShiftLeft = codeToBtn.ShiftRight = { p: p, b: e }));
      }),
    ),
    Object.entries(S.keymap || {}).forEach(([e, t]) => {
      t &&
        ((codeToBtn0[t] = { p: 0, b: e }),
        /^Shift/.test(t) && (codeToBtn0.ShiftLeft = codeToBtn0.ShiftRight = { p: 0, b: e }));
    }));
}
function setIn(e, t, a, p = 0) {
  if (SYS && !con().btns.includes(t)) return;
  const q = p + ":" + t,
    s = srcs[q] || (srcs[q] = new Set());
  a ? s.add(e) : s.delete(e);
  const n = s.size > 0;
  if (sent[q] !== n) {
    sent[q] = n;
    try {
      mp.role === "guest"
        ? mpIn(t, n)
        : window.EJS_emulator?.gameManager?.simulateInput(p, PAD[t], n ? 1 : 0);
    } catch {}
    p === 0 && $$(`#pad [data-btn="${t}"]`).forEach((o) => o.classList.toggle("down", n));
  }
}
function releaseAll() {
  [0, 1, 2].forEach((p) =>
    Object.keys(PAD).forEach((e) => {
      const q = p + ":" + e;
      (srcs[q] && srcs[q].clear(), sent[q] && setIn("x", e, !1, p));
    }),
  );
}
const buzz = (e) => {
  if (S.vib && navigator.vibrate)
    try {
      navigator.vibrate(e);
    } catch {}
};
($$("#pad .pb[data-btn]").forEach((e) => {
  if (e.closest("#dpad")) return;
  const t = e.dataset.btn,
    a = "t" + t;
  (e.addEventListener("pointerdown", (s) => {
    s.preventDefault();
    try {
      e.setPointerCapture(s.pointerId);
    } catch {}
    (setIn(a, t, !0), buzz(12));
  }),
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((s) =>
      e.addEventListener(s, () => setIn(a, t, !1)),
    ),
    e.addEventListener("contextmenu", (s) => s.preventDefault()));
}),
  (function () {
    const e = $("#dpad");
    let t = null;
    function a(n) {
      const o = e.getBoundingClientRect(),
        i = n.clientX - (o.left + o.width / 2),
        r = n.clientY - (o.top + o.height / 2),
        c = o.width * 0.13,
        l = Math.abs(i),
        u = Math.abs(r),
        d = Math.hypot(i, r) > c;
      (setIn("td", "LEFT", d && i < -c && l >= u * 0.5),
        setIn("td", "RIGHT", d && i > c && l >= u * 0.5),
        setIn("td", "UP", d && r < -c && u >= l * 0.5),
        setIn("td", "DOWN", d && r > c && u >= l * 0.5));
    }
    const s = () => {
      ((t = null), ["LEFT", "RIGHT", "UP", "DOWN"].forEach((n) => setIn("td", n, !1)));
    };
    (e.addEventListener("pointerdown", (n) => {
      (n.preventDefault(), (t = n.pointerId));
      try {
        e.setPointerCapture(t);
      } catch {}
      (buzz(10), a(n));
    }),
      e.addEventListener("pointermove", (n) => {
        n.pointerId === t && a(n);
      }),
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((n) =>
        e.addEventListener(n, (o) => {
          (t === null || o.pointerId === t) && s();
        }),
      ),
      e.addEventListener("contextmenu", (n) => n.preventDefault()));
  })());
const KMK = ["keymap", "keymap2"];
let kP = 0,
  gP = 0,
  capP = 0,
  capturing = null,
  capObj = null,
  gsOpen = !1,
  D = null,
  svOpen = !1,
  rsOpen = !1,
  svLoaded = null,
  rsWasPaused = !1,
  rsCloseT = 0;
function onKey(e) {
  if (mpCap) {
    (e.preventDefault(), e.stopImmediatePropagation(), e.type === "keydown" && mpKeyPick(e.code));
    return;
  }
  if (capturing) {
    if ((e.preventDefault(), e.stopImmediatePropagation(), e.type !== "keydown")) return;
    const a = capturing,
      T = capObj || D;
    if (e.code !== "Escape") {
      const mk = KMK[capP],
        s = T[mk][a];
      let h = null;
      (KMK.forEach((k) =>
        Object.keys(T[k]).forEach((o) => {
          !h && !(k === mk && o === a) && T[k][o] === e.code && (h = [k, o]);
        }),
      ),
        h && (T[h[0]][h[1]] = s),
        (T[mk][a] = e.code));
    }
    if (((capturing = null), capObj)) {
      ((capObj = null), persist(), buildLookup(), renderKeysTable(e.code !== "Escape" ? a : null));
      return;
    }
    renderKm(e.code !== "Escape" ? a : null);
    return;
  }
  if (gsOpen || svOpen || rsOpen || mpUiOpen() || !$("#player").classList.contains("show")) return;
  const t = (mp.on ? codeToBtn0 : codeToBtn)[e.code] || null;
  t &&
    (e.preventDefault(),
    e.stopImmediatePropagation(),
    !e.repeat && setIn("k", t.b, e.type === "keydown", t.p));
}
(window.addEventListener("keydown", onKey, !0),
  window.addEventListener("keyup", onKey, !0),
  window.addEventListener("blur", releaseAll));
let gpSeen = !1,
  gpTick = 0;
function getGamepad() {
  try {
    return (
      [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((e) => e && e.connected) ||
      null
    );
  } catch {
    return null;
  }
}
function updateGpStatus() {
  const e = getGamepad();
  ($("#gp-status").classList.toggle("on", !!e),
    ($("#gp-name").textContent = e
      ? e.id
          .replace(/\(.*?\)/g, "")
          .trim()
          .slice(0, 60) || "Controle conectado"
      : "Nenhum controle detectado. Conecte e aperte um bot\xE3o."));
}
(window.addEventListener("gamepadconnected", () => {
  ((gpSeen = !0),
    updateGpStatus(),
    (gsOpen || $("#player").classList.contains("show")) && toast("Controle conectado"));
}),
  window.addEventListener("gamepaddisconnected", () => {
    ((gpSeen = !!getGamepad()),
      updateGpStatus(),
      Object.keys(PAD).forEach((e) => setIn("g", e, !1)));
  }),
  setInterval(() => {
    if (!playerEl.classList.contains("show")) return;
    if (!gpSeen && gpTick++ & 15) return;
    const e = !gsOpen && !svOpen && !rsOpen && !mpUiOpen() && S.gpOn ? getGamepad() : null;
    if (!e) {
      Object.keys(PAD).forEach((r) => {
        srcs["0:" + r] && srcs["0:" + r].has("g") && setIn("g", r, !1);
      });
      return;
    }
    const t = (r) => !!(e.buttons[r] && e.buttons[r].pressed),
      a = S.gpDead / 100,
      s = e.axes[0] || 0,
      n = e.axes[1] || 0,
      o = S.gpSwap,
      i = {
        UP: t(12) || n < -a,
        DOWN: t(13) || n > a,
        LEFT: t(14) || s < -a,
        RIGHT: t(15) || s > a,
        B: t(o ? 1 : 0),
        A: t(o ? 0 : 1),
        Y: t(o ? 3 : 2),
        X: t(o ? 2 : 3),
        L: t(4),
        R: t(5),
        L2: t(6),
        R2: t(7),
        SELECT: t(8),
        START: t(9),
      };
    Object.keys(i).forEach((r) => setIn("g", r, i[r]));
  }, 16));
const LD_C = 289.03,
  LD_MIN = 2400;
let ldVal = 0,
  ldTarget = 0,
  ldRaf = 0,
  ldT = 0,
  ldT0 = 0,
  ldTm = 0,
  ldObs = null,
  ldFin = null,
  ldUp = () => {};
const ldUI = (e) => {
    const t = $(".ld-arc", e),
      a = $(".ld-fill", e),
      s = $(".ld-pct b", e);
    return (n) => {
      ((t.style.strokeDashoffset = LD_C * (1 - n / 100)),
        (a.style.transform = `scaleX(${n / 100})`),
        (s.textContent = Math.round(n)));
    };
  },
  ldStatus = (e) => {
    const t = $(".ld-st", $("#p-loading"));
    t && (t.textContent = e);
  };
function ldLoop(e) {
  const t = Math.max(0, Math.min(0.05, (e - ldT) / 1e3));
  if (((ldT = e), !ldFin)) {
    const a = e - ldT0,
      s = Math.min(1, a / LD_MIN);
    ldTarget = Math.max(
      ldTarget,
      Math.min(95, s < 1 ? 10 + 75 * s * s * (3 - 2 * s) : 85 + (a - LD_MIN) * 6e-4),
    );
  }
  if (
    ((ldVal += (ldTarget - ldVal) * (1 - Math.exp(-t * (ldFin ? 4.5 : 3)))),
    ldUp(ldVal),
    ldFin && ldVal > 99.5)
  ) {
    (ldUp(100), (ldRaf = 0));
    const a = ldFin;
    ((ldFin = null), a());
    return;
  }
  ldRaf = requestAnimationFrame(ldLoop);
}
function ldStart(e) {
  const t = $("#p-loading");
  (t.classList.remove("hidden", "go"),
    ($(".ld-name", t).textContent = fmtName(e.name).display),
    ldStatus("Preparando..."),
    (ldUp = ldUI(t)),
    (ldVal = 0),
    (ldTarget = 10),
    (ldFin = null),
    ldUp(0),
    (ldT = ldT0 = performance.now()),
    clearTimeout(ldTm),
    cancelAnimationFrame(ldRaf),
    (ldRaf = requestAnimationFrame(ldLoop)));
}
function ldStop() {
  ($("#player").classList.remove("barhide"),
    cancelAnimationFrame(ldRaf),
    clearTimeout(ldTm),
    (ldRaf = 0),
    (ldFin = null),
    ldObs && (ldObs.disconnect(), (ldObs = null)));
}
function ldWatch(e) {
  (ldObs && ldObs.disconnect(),
    (ldObs = new MutationObserver(() => {
      const t = (e.querySelector(".ejs_loading_text") || {}).textContent || "";
      if (!t) return;
      const a = t.match(/(\d{1,3})\s*%/);
      /core/i.test(t)
        ? ((ldTarget = Math.max(ldTarget, a ? 20 + a[1] * 0.35 : 30)),
          ldStatus("Carregando emulador..."))
        : /game|rom/i.test(t)
          ? ((ldTarget = Math.max(ldTarget, a ? 58 + a[1] * 0.3 : 65)),
            ldStatus("Carregando jogo..."))
          : /start|run|init/i.test(t) &&
            ((ldTarget = Math.max(ldTarget, 88)), ldStatus("Iniciando..."));
    })),
    ldObs.observe(e, { subtree: !0, childList: !0, characterData: !0 }));
}
function ldFinish() {
  ldObs && (ldObs.disconnect(), (ldObs = null));
  const e = reduceMotion(),
    t = $("#p-loading"),
    a = $("#ejs-host"),
    s = () => {
      (t.classList.add("go"),
        a && (a.classList.remove("reveal"), a.offsetWidth, a.classList.add("reveal")));
      try {
        paused || autoPaused || window.EJS_emulator?.play?.();
      } catch {}
      ((playReady = !0),
        applyVol(),
        resumeAudio(),
        (ldTm = setTimeout(() => t.classList.add("hidden"), e ? 0 : 760)));
    };
  ldTm = setTimeout(
    () => {
      (ldStatus("Pronto!"),
        (ldTarget = 100),
        (ldFin = () => {
          ldTm = setTimeout(s, e ? 0 : 420);
        }),
        ldRaf || ((ldT = performance.now()), (ldRaf = requestAnimationFrame(ldLoop))));
    },
    e ? 0 : Math.max(0, LD_MIN - (performance.now() - ldT0)),
  );
}
const EJS_VER = "4.2.3",
  EJS_PATH = "https://cdn.emulatorjs.org/" + EJS_VER + "/data/";
/* PS1: pula quadros automaticamente quando o aparelho não aguenta e desliga efeitos de áudio/imagem pesados */
const PS1_OPTS = {
  pcsx_rearmed_frameskip_type: "auto",
  pcsx_rearmed_drc: "enabled",
  pcsx_rearmed_spu_reverb: "disabled",
  pcsx_rearmed_spu_interpolation: "off",
  pcsx_rearmed_neon_enhancement_enable: "disabled",
  pcsx_rearmed_neon_interlace_enable: "disabled",
};
let scriptEl = null,
  romUrl = null,
  startTimer = null,
  started = !1,
  playTm = 0;
function cleanup() {
  (autoOptReset(),
    biosObjUrl && (URL.revokeObjectURL(biosObjUrl), (biosObjUrl = null)),
    clearTimeout(startTimer),
    clearTimeout(playTm),
    ldStop(),
    releaseAll(),
    (playReady = !1),
    closeVol(),
    tpClose(!1),
    (svLoaded = null));
  try {
    window.EJS_emulator?.pause?.();
  } catch {}
  try {
    const M = window.EJS_emulator?.Module;
    M?.pauseMainLoop?.();
    const ac =
      M && ((M.AL && M.AL.currentCtx && M.AL.currentCtx.audioCtx) || (M.SDL && M.SDL.audioContext));
    ac && ac.state !== "closed" && ac.close();
  } catch {}
  try {
    window.EJS_emulator?.callEvent?.("exit");
  } catch {}
  try {
    delete window.EJS_emulator;
  } catch {
    window.EJS_emulator = void 0;
  }
  (scriptEl && (scriptEl.remove(), (scriptEl = null)),
    romUrl && (URL.revokeObjectURL(romUrl), (romUrl = null)),
    ($("#ejs-box").textContent = ""),
    (paused = !1),
    (autoPaused = !1),
    ($("#p-pause").innerHTML = '<i class="fa-solid fa-pause"></i>'));
}
const isMobDev = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (matchMedia("(pointer:coarse)").matches && !matchMedia("(hover:hover)").matches);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
async function phFull() {
  if (!isMobDev() || isFs()) return;
  const d = document.documentElement;
  try {
    await (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: "hide" });
  } catch {}
}
async function phLand() {
  if (!isMobDev()) return;
  await phFull();
  let ok = false;
  try {
    await screen.orientation.lock("landscape");
    ok = true;
  } catch {}
  document.body.classList.toggle("needrot", !ok);
  if (!isFs() && !ok)
    document.addEventListener(
      "pointerdown",
      () => {
        current && phLand();
      },
      { once: true },
    );
}
function phLeave() {
  document.body.classList.remove("needrot", "needtap");
  const out = () => {
    try {
      isFs() && (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } catch {}
    try {
      screen.orientation.unlock();
    } catch {}
  };
  if (!isMobDev()) {
    out();
    return;
  }
  try {
    screen.orientation.lock("portrait").then(
      () => setTimeout(out, 250),
      () => out(),
    );
  } catch {
    out();
  }
  setTimeout(out, 1200);
}
$("#tapgo").onclick = async () => {
  document.body.classList.remove("needtap");
  await phLand();
};
document.addEventListener("fullscreenchange", () => {
  if (!isFs() && isMobDev() && current && document.body.classList.contains("playing"))
    document.body.classList.add("needtap");
});
let biosCache;
async function findBios() {
  if (biosCache !== void 0) return biosCache;
  biosCache = "";
  if (!/^https?:$/.test(location.protocol)) return biosCache;
  for (const n of [
    "scph5501.bin",
    "scph1001.bin",
    "scph7001.bin",
    "scph101.bin",
    "scph5500.bin",
    "scph5502.bin",
  ])
    try {
      const r = await fetch(n, { method: "HEAD", cache: "no-store" });
      if (r.ok && !/text\/html/i.test(r.headers.get("content-type") || "")) {
        biosCache = new URL(n, location.href).href;
        break;
      }
    } catch {}
  return biosCache;
}
let biosObjUrl = null;
async function userBios() {
  try {
    const b = await idbOp("meta", "readonly", (s) => s.get("bios"));
    if (b && b.size) return (biosObjUrl = URL.createObjectURL(b));
  } catch {}
  return "";
}
function playGame(e) {
  const t = library[e];
  if (!t) return;
  t.sys && t.sys !== SYS && setSys(t.sys, !0);
  phLand();
  ((current = t),
    (started = !1),
    (leavingPlayer = !1),
    cleanup(),
    ($("#p-title").textContent = fmtName(t.name).display),
    $("#p-full").classList.toggle(
      "hidden",
      !(document.fullscreenEnabled || document.webkitFullscreenEnabled),
    ));
  const a = $("#player");
  (a.classList.remove("leaving"),
    a.classList.add("show"),
    clearTimeout(playTm),
    (playTm = setTimeout(
      () => {
        current === t && document.body.classList.add("playing");
      },
      reduceMotion() ? 0 : 480,
    )),
    ldStart(t),
    tipUpdate(),
    (muted = !1),
    ($("#p-mute").innerHTML = '<i class="fa-solid fa-volume-high"></i>'),
    $("#ejs-box").style.setProperty("--orig", "1.3333"),
    autoOptStart(t.name),
    applyConsoleUI(),
    applyAll(S));
  if (AutoOpt.level > 0 && autoOptSavedLevels()[t.name])
    toast("Usando as otimizações salvas para este jogo.", 3000);
  const s = document.createElement("div");
  ((s.id = "ejs-host"), $("#ejs-box").appendChild(s), ldWatch(s));
  let n = null;
  const o = async () => {
      if (!current || current !== t) return;
      let f;
      let biosPick = "";
      try {
        biosPick = SYS === "ps1" ? (await userBios()) || (await findBios()) : "";
      } catch {}
      try {
        f = await romFile(t);
      } catch {
        failRom(
          "Não foi possível abrir o arquivo do jogo. Em Configurações > Biblioteca, selecione a pasta de novo e permita o acesso.",
        );
        return;
      }
      if (current !== t) return;
      n = romUrl = URL.createObjectURL(f);
      ((window.EJS_player = "#ejs-host"),
        (window.EJS_core = coreOf(t.name)),
        (window.EJS_threads = !1),
        (window.EJS_gameName = t.name),
        (window.EJS_gameUrl = romUrl),
        (window.EJS_pathtodata = EJS_PATH),
        (window.EJS_color = "#fb3333"),
        (window.EJS_volume = volNum() / 100),
        (window.EJS_startOnLoaded = !0),
        (window.EJS_CacheLimit = 1),
        (window.EJS_disableLocalStorage = !0),
        (window.EJS_defaultOptions = SYS === "ps1" ? PS1_OPTS : {}),
        (window.EJS_biosUrl = biosPick || ""),
        (window.EJS_Buttons = {
          playPause: !1,
          restart: !1,
          mute: !1,
          settings: !1,
          fullscreen: !1,
          saveState: !1,
          loadState: !1,
          screenRecord: !1,
          gamepad: !1,
          cheat: !1,
          volume: !1,
          saveSavFiles: !1,
          loadSavFiles: !1,
          quickSave: !1,
          quickLoad: !1,
          screenshot: !1,
          cacheManager: !1,
          exitEmulation: !1,
          netplay: !1,
          diskButton: !1,
          contextMenuButton: !1,
        }),
        (window.EJS_defaultControls = { 0: {}, 1: {}, 2: {}, 3: {} }),
        (window.EJS_VirtualGamepadSettings = []),
        (window.EJS_onGameStart = () => {
          if (!started) {
            ((started = !0), clearTimeout(startTimer));
            try {
              window.EJS_emulator?.pause?.();
            } catch {}
            ((muted = !1),
              autoOptApplyCore(),
              applyVol(),
              resumeAudio(),
              notifyLoaded(current ? fmtName(current.name).display : ""),
              ldFinish(),
              mpAttach());
          }
        }),
        (scriptEl = document.createElement("script")),
        (scriptEl.src = EJS_PATH + "loader.js"),
        (scriptEl.async = !0),
        (scriptEl.onload = () => {
          ((ldTarget = Math.max(ldTarget, 42)), ldStatus("Iniciando emulador..."));
        }),
        (scriptEl.onerror = () =>
          failRom("N\xE3o foi poss\xEDvel carregar o emulador. Verifique sua conex\xE3o.")),
        document.body.appendChild(scriptEl),
        (startTimer = setTimeout(() => {
          started || failRom("Erro ao iniciar a ROM.");
        }, 12e4)));
    },
    i = reduceMotion() ? 0 : 520;
  rawRAF(() => rawRAF(() => setTimeout(o, i)));
}
function failRom(e) {
  (exitPlayer(), showBanner(e, 7e3));
}
function exitPlayer() {
  if (leavingPlayer) return;
  mpLeave();
  (padEdit && endEdit(!1, !0),
    (leavingPlayer = !0),
    gsOpen && closeGs(!1, !0),
    svOpen && closeSv(!0),
    rsOpen && closeRs(!0, !0),
    cleanup(),
    (current = null),
    document.body.classList.remove("playing"),
    phLeave(),
    goView("library"));
  {
    const t = $("#view-library");
    t.classList.contains("show") && viewIn(t);
  }
  const e = $("#player");
  (e.classList.add("leaving"),
    setTimeout(
      () => {
        (e.classList.remove("show", "leaving"),
          $("#pad").classList.remove("show"),
          $("#stage").classList.remove("pad-on"),
          (leavingPlayer = !1));
      },
      reduceMotion() ? 0 : 410,
    ));
}
function setPaused(e) {
  const t = window.EJS_emulator;
  paused = e;
  try {
    t && (e ? t.pause() : t.play());
  } catch {}
  const a = $("#p-pause");
  ((a.innerHTML = `<i class="fa-solid fa-${e ? "play" : "pause"}"></i>`),
    a.classList.remove("swap"),
    a.offsetWidth,
    a.classList.add("swap"));
}
(($("#p-back").onclick = exitPlayer),
  ($("#ld-cancel") && ($("#ld-cancel").onclick = exitPlayer)),
  ($("#p-hide") && ($("#p-hide").onclick = () => $("#player").classList.add("barhide"))),
  ($("#p-show") && ($("#p-show").onclick = () => $("#player").classList.remove("barhide"))),
  ($("#p-pause").onclick = () => {
    window.EJS_emulator && setPaused(!paused);
  }));
async function doReset(e) {
  const t = window.EJS_emulator;
  if (t)
    try {
      e === "save" && svLoaded
        ? (await t.gameManager.loadState(svLoaded.data),
          toast("Reiniciado a partir do slot " + (svLoaded.slot + 1)))
        : (t.gameManager.restart(), toast("Jogo reiniciado"));
    } catch (a) {
      (console.warn(a), toast("N\xE3o foi poss\xEDvel reiniciar"));
    }
}
function openRs() {
  if (!(rsOpen || gsOpen || svOpen)) {
    if (
      (placeOvl(),
      releaseAll(),
      (rsOpen = !0),
      (rsWasPaused = paused),
      !paused && window.EJS_emulator)
    )
      try {
        window.EJS_emulator.pause();
      } catch {}
    (($("#rs-slot").textContent = "Slot " + (svLoaded.slot + 1)),
      ($("#rs-tip").textContent =
        "Dica: se salvar o jogo, salve no mesmo slot (" +
        (svLoaded.slot + 1) +
        ") para que ao reiniciar ele volte ao save mais novo."),
      ($("#rs-hide").checked = !1),
      clearTimeout(rsCloseT),
      $("#rs").classList.remove("closing", "hidden"),
      $("#rs-ok").focus({ preventScroll: !0 }));
  }
}
function closeRs(e, t) {
  if (!rsOpen) return;
  rsOpen = !1;
  const a = $("#rs");
  if (
    (e || reduceMotion()
      ? a.classList.add("hidden")
      : (a.classList.add("closing"),
        (rsCloseT = setTimeout(() => {
          (a.classList.add("hidden"), a.classList.remove("closing"));
        }, 210))),
    !t && !rsWasPaused && window.EJS_emulator && !autoPaused)
  )
    try {
      window.EJS_emulator.play();
    } catch {}
}
(($("#p-reset").onclick = () => {
  window.EJS_emulator &&
    (S.resetMode === "save" && svLoaded
      ? S.hideRsTip
        ? doReset("save")
        : openRs()
      : doReset("full"));
}),
  ($("#rs-cancel").onclick = () => closeRs()),
  ($("#rs-ok").onclick = async () => {
    ($("#rs-hide").checked && ((S.hideRsTip = !0), persist()), await doReset("save"), closeRs());
  }),
  ($("#rs-set").onclick = () => {
    (closeRs(!0, !0), openGs(), gsShow("ctrl", "reset"));
    const e = $("#rs-sel");
    (e.classList.remove("hl"), e.offsetWidth, e.classList.add("hl"));
  }),
  $("#rs").addEventListener("click", (e) => {
    e.target === $("#rs") && closeRs();
  }),
  ($("#p-mute").onclick = () => {
    const e = window.EJS_emulator;
    if (!e) return;
    muted = !muted;
    try {
      e.setVolume(muted ? 0 : 1);
    } catch {}
    const t = $("#p-mute");
    ((t.innerHTML = `<i class="fa-solid fa-volume-${muted ? "xmark" : "high"}"></i>`),
      t.classList.remove("swap"),
      t.offsetWidth,
      t.classList.add("swap"));
  }),
  ($("#p-full").onclick = () => {
    const e = $("#player");
    document.fullscreenElement
      ? document.exitFullscreen?.()
      : (e.requestFullscreen || e.webkitRequestFullscreen)?.call(e);
  }));
const ovl = ["#gs", "#sv", "#rs", "#tp", "#mpl", "#mpc", "#mpsh", "#toast"].map((e) => $(e));
function placeOvl() {
  const e = document.fullscreenElement || document.webkitFullscreenElement,
    t = e && e !== document.documentElement && e !== document.body ? e : document.body;
  ovl.forEach((a) => {
    a.parentNode !== t && t.appendChild(a);
  });
}
(["fullscreenchange", "webkitfullscreenchange"].forEach((e) =>
  document.addEventListener(e, placeOvl),
),
  document.addEventListener("fullscreenchange", () => {
    (($("#p-full").innerHTML =
      `<i class="fa-solid fa-${document.fullscreenElement ? "compress" : "expand"}"></i>`),
      setTimeout(layoutInt, 100));
  }),
  ($("#p-gear").onclick = openGs),
  document.addEventListener("visibilitychange", () => {
    if (!(!$("#player").classList.contains("show") || !window.EJS_emulator)) {
      if (document.hidden && S.autoPause && !mp.on && !paused && !autoPaused) {
        ((autoPaused = !0), releaseAll());
        try {
          window.EJS_emulator.pause();
        } catch {}
      } else if (
        !document.hidden &&
        autoPaused &&
        ((autoPaused = !1), !paused && !gsOpen && !svOpen && !rsOpen)
      )
        try {
          window.EJS_emulator.play();
        } catch {}
    }
  }),
  $("#player").addEventListener("contextmenu", (e) => e.preventDefault()),
  document.addEventListener("keydown", (e) => {
    if (tpOpen) {
      e.code === "Escape" && tpClose(!1);
      return;
    }
    if (mpUiOpen()) {
      e.code === "Escape" && mpEsc();
      return;
    }
    if (padEdit) {
      e.code === "Escape" && endEdit(!1);
      return;
    }
    e.code !== "Escape" ||
      capturing ||
      !$("#player").classList.contains("show") ||
      (gsOpen
        ? closeGs(!1)
        : svOpen
          ? closeSv()
          : rsOpen
            ? closeRs()
            : document.fullscreenElement || exitPlayer());
  }));
let gsTab = "ctrl",
  gsSub = "kb",
  wasPaused = !1,
  gsCloseT = null;
const KM_ITEMS = [
  ["UP", "Cima", "fa-arrow-up"],
  ["DOWN", "Baixo", "fa-arrow-down"],
  ["LEFT", "Esquerda", "fa-arrow-left"],
  ["RIGHT", "Direita", "fa-arrow-right"],
  ["A", "Bot\xE3o ○ (A)", "fa-circle"],
  ["B", "Bot\xE3o ✕ (B)", "fa-circle"],
  ["X", "Bot\xE3o △ (X)", "fa-circle"],
  ["Y", "Bot\xE3o □ (Y)", "fa-circle"],
  ["L", "Bot\xE3o L1", "fa-hand"],
  ["R", "Bot\xE3o R1", "fa-hand"],
  ["L2", "Bot\xE3o L2", "fa-hand"],
  ["R2", "Bot\xE3o R2", "fa-hand"],
  ["START", "Start", "fa-play"],
  ["SELECT", "Select", "fa-minus"],
];
function renderKm(e) {
  const t = $("#km-list");
  ((t.textContent = ""),
    KM_ITEMS.filter((x) => con().btns.includes(x[0])).forEach(([a, s0, n]) => {
      const s = KLBL()[a] || s0;
      const o = document.createElement("div");
      ((o.className = "km-item"), (capturing || e) && (o.style.animation = "none"));
      const i = document.createElement("i");
      i.className = "fa-solid " + n;
      const r = document.createElement("span");
      r.textContent = s;
      const c = document.createElement("button"),
        w = capturing === a && !capObj && capP === gP;
      ((c.className = "km-key" + (w ? " wait" : "") + (e === a ? " set" : "")),
        (c.textContent = w ? "Pressione..." : keyLabel(D[KMK[gP]][a])),
        (c.onclick = () => {
          const sm = capturing === a && capP === gP;
          ((capObj = null), (capP = gP), (capturing = sm ? null : a), renderKm());
        }),
        o.append(i, r, c),
        t.appendChild(o));
    }));
}
function syncPreset() {
  const e = $("#presets");
  D &&
    (e.querySelectorAll("button").forEach((t) => {
      const a = PRESETS[t.dataset.preset];
      t.classList.toggle(
        "active",
        Object.keys(a).every((s) => D[s] === a[s]),
      );
    }),
    updateSegs($("#gs")));
}
function gsShow(e, t) {
  ((gsTab = e),
    (gsSub = t || gsSub),
    (capturing = null),
    $$(".gs-nav button").forEach((a) => a.classList.toggle("active", a.dataset.gs === gsTab)),
    $("#gs-ctrl").classList.toggle("show", gsTab === "ctrl"),
    $("#gs-video").classList.toggle("show", gsTab === "video"),
    $$("#gs-sub button").forEach((a) => a.classList.toggle("active", a.dataset.sub === gsSub)),
    ["kb", "touch", "usb", "reset"].forEach((a) =>
      $("#sec-" + a).classList.toggle("show", a === gsSub),
    ),
    ($("#gs-content").scrollTop = 0),
    gsSub === "kb" && renderKm(),
    gsSub === "usb" && updateGpStatus(),
    updateSegs($("#gs")),
    setTimeout(() => updateSegs($("#gs")), 60));
}
function openGs() {
  if (!(gsOpen || rsOpen)) {
    if (
      (placeOvl(),
      clearTimeout(gsCloseT),
      $("#gs").classList.remove("closing"),
      (D = clone(S)),
      (gsOpen = !0),
      releaseAll(),
      (wasPaused = paused),
      !paused && window.EJS_emulator)
    )
      try {
        window.EJS_emulator.pause();
      } catch {}
    (($("#gs-game").textContent = current ? fmtName(current.name).display : ""),
      $("#gs").classList.remove("hidden"),
      syncUI($("#gs"), D),
      gsShow("ctrl", "kb"),
      syncPreset());
  }
}
function closeGs(e, t) {
  if (!gsOpen) return;
  ((capturing = null),
    e &&
      ((S = D),
      (S.keymap = Object.assign({}, DEFAULTS.keymap, S.keymap)),
      (S.keymap2 = Object.assign({}, DEFAULTS.keymap2, S.keymap2)),
      persist(),
      buildLookup()),
    (gsOpen = !1),
    (D = null),
    applyAll(S),
    syncUI($("#view-settings"), S));
  const a = $("#gs");
  if (
    (t || reduceMotion()
      ? a.classList.add("hidden")
      : (a.classList.add("closing"),
        (gsCloseT = setTimeout(() => {
          (a.classList.add("hidden"), a.classList.remove("closing"));
        }, 230))),
    !wasPaused && window.EJS_emulator && !autoPaused)
  )
    try {
      window.EJS_emulator.play();
    } catch {}
}
(bindUI(
  $("#gs"),
  () => D,
  () => {
    (applyAll(D), syncPreset());
  },
),
  $$(".gs-nav button").forEach((e) => (e.onclick = () => gsShow(e.dataset.gs))),
  $$("#gs-sub button").forEach((e) => (e.onclick = () => gsShow("ctrl", e.dataset.sub))),
  $$("#presets button").forEach(
    (e) =>
      (e.onclick = () => {
        (Object.assign(D, PRESETS[e.dataset.preset]),
          syncUI($("#gs"), D),
          applyAll(D),
          syncPreset());
      }),
  ),
  ($("#gs-x").onclick = () => closeGs(!1)),
  ($("#gs-cancel").onclick = () => closeGs(!1)),
  $("#gs").addEventListener("pointerdown", (e) => {
    e.target.id === "gs" && closeGs(!1);
  }),
  ($("#gs-save").onclick = () => {
    (closeGs(!0), toast("Configura\xE7\xF5es salvas"));
  }),
  ($("#gs-reset").onclick = () => {
    ((gsTab === "video" ? ["video"] : ["kb", "touch", "usb", "rst"]).forEach((t) =>
      GROUPS[t].forEach((a) => {
        D[a] = clone(DEFAULTS)[a];
      }),
    ),
      (capturing = null),
      syncUI($("#gs"), D),
      applyAll(D),
      syncPreset(),
      gsTab === "ctrl" && gsSub === "kb" && renderKm(),
      toast(gsTab === "video" ? "Aba V\xEDdeo reiniciada" : "Aba Controles reiniciada"));
  }));
let padEdit = !1,
  E = null,
  drag = null,
  selC = null;
const CTLS = ["L", "R", "L2", "R2", "X", "Y", "A", "B", "SELECT", "START", "STICK"],
  padEl = $("#pad"),
  lk = (o) => (SYS && SYS !== "ps1" ? o + "_" + SYS : o),
  ori = () => lk(padEl.clientWidth >= padEl.clientHeight ? "l" : "p"),
  clearLay = (L) => {
    L = L || {};
    delete L[lk("p")];
    delete L[lk("l")];
    return L;
  };
($$("#pad .pb[data-btn]").forEach((e) => {
  e.closest("#dpad") || (e.dataset.c = e.dataset.btn);
}),
  ($("#dpad").dataset.c = "STICK"),
  ($("#joy").dataset.c = "STICK"));
function ctlEl(e) {
  return $$(`#pad [data-c="${e}"]`).find((t) => !t.classList.contains("hidden") && !t.classList.contains("nc"));
}
function defPos(e, t, a, s, n) {
  const o = 16 + n[0],
    i = 16 + n[1],
    r = a - (20 + n[2]) - 150 * s,
    c = (l) => o + l * s,
    u = (l) => t - i - (164 - l) * s,
    d = (l) => r + l * s,
    f = a - 14 - n[2] - 14 * s;
  const P = {
    STICK: [c(75), d(75)],
    L: [c(42), d(-34)],
    R: [u(122), d(-34)],
    L2: [c(134), d(-34)],
    R2: [u(30), d(-34)],
    X: [u(82), d(27)],
    Y: [u(27), d(75)],
    A: [u(137), d(75)],
    B: [u(82), d(123)],
    SELECT: [t / 2 - 36 * s, f],
    START: [t / 2 + 36 * s, f],
  };
  if (SYS === "atari") P.B = [u(82), d(75)];
  if (SYS === "md") {
    Object.assign(P, {
      Y: [u(32), d(110)],
      B: [u(82), d(110)],
      A: [u(132), d(110)],
      L: [u(32), d(45)],
      X: [u(82), d(45)],
      R: [u(132), d(45)],
    });
  }
  return P[e];
}
function layoutPad() {
  if (!padEl.classList.contains("show")) return;
  const e = padEdit ? { padType: E.t, padLay: E.l, scale: cur.scale } : cur,
    t = padEl.clientWidth,
    a = padEl.clientHeight;
  if (!t || !a) return;
  const s = getComputedStyle(padEl),
    n = [
      parseFloat(s.paddingLeft) || 0,
      parseFloat(s.paddingRight) || 0,
      parseFloat(s.paddingBottom) || 0,
    ],
    o = lk(t >= a ? "l" : "p"),
    i = e.padType === "joy",
    r = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--auto")) || 1,
    c = ((e.scale || 100) / 100) * r,
    u = (e.padLay && e.padLay[o]) || {};
  ($("#dpad").classList.toggle("hidden", i),
    $("#joy").classList.toggle("hidden", !i),
    CTLS.forEach((d) => {
      const f = ctlEl(d);
      if (!f) return;
      const l = defPos(d, t, a, c, n),
        m = u[d] || {};
      ((f.style.left = (m.x != null ? m.x * t : l[0]) + "px"),
        (f.style.top = (m.y != null ? m.y * a : l[1]) + "px"),
        (f.style.scale = c * (m.s || 1)));
    }));
}
(new ResizeObserver(() => layoutPad()).observe($("#stage")),
  window.addEventListener("orientationchange", () => setTimeout(layoutPad, 200)),
  (function () {
    const e = $("#joy"),
      t = $(".jk", e);
    let a = null;
    function s(i) {
      const r = e.getBoundingClientRect(),
        c = r.width / 150 || 1,
        u = i.clientX - (r.left + r.width / 2),
        d = i.clientY - (r.top + r.height / 2),
        f = Math.hypot(u, d),
        l = 46 * c,
        m = f > l ? l / f : 1,
        p = r.width * 0.13,
        h = Math.abs(u),
        g = Math.abs(d),
        y = f > p;
      ((t.style.transform = `translate(${(u * m) / c}px,${(d * m) / c}px)`),
        setIn("tj", "LEFT", y && u < -p && h >= g * 0.5),
        setIn("tj", "RIGHT", y && u > p && h >= g * 0.5),
        setIn("tj", "UP", y && d < -p && g >= h * 0.5),
        setIn("tj", "DOWN", y && d > p && g >= h * 0.5));
    }
    const n = () => {
      ((a = null),
        (t.style.transform = ""),
        e.classList.remove("down"),
        ["LEFT", "RIGHT", "UP", "DOWN"].forEach((i) => setIn("tj", i, !1)));
    };
    (e.addEventListener("pointerdown", (i) => {
      (i.preventDefault(), (a = i.pointerId));
      try {
        e.setPointerCapture(a);
      } catch {}
      (e.classList.add("down"), buzz(10), s(i));
    }),
      e.addEventListener("pointermove", (i) => {
        i.pointerId === a && s(i);
      }),
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((i) =>
        e.addEventListener(i, (r) => {
          (a === null || r.pointerId === a) && n();
        }),
      ),
      e.addEventListener("contextmenu", (i) => i.preventDefault()));
  })());
function edSel() {
  $$("#pad [data-c]").forEach((a) =>
    a.classList.toggle(
      "sel-ctl",
      !!selC && a.dataset.c === selC && !a.classList.contains("hidden"),
    ),
  );
  const e = $("#ped-size");
  if (!selC) {
    ((e.disabled = !0), ($("#ped-sv").textContent = "--"), rangeFill(e));
    return;
  }
  const t = (E.l[ori()] || {})[selC] || {},
    a = Math.round((t.s || 1) * 100);
  ((e.disabled = !1), (e.value = a), ($("#ped-sv").textContent = a + "%"), rangeFill(e));
}
function edType() {
  ($$("#ped-type button").forEach((e) => e.classList.toggle("active", e.dataset.t === E.t)),
    updateSegs($("#ped")));
}
function startEdit() {
  if (padEdit || !gsOpen) return;
  ((E = { t: D.padType === "joy" ? "joy" : "dpad", l: clone(D.padLay || { p: {}, l: {} }) }),
    (padEdit = !0),
    (selC = null),
    (drag = null),
    releaseAll(),
    $("#gs").classList.add("hidden"),
    $("#player").classList.add("editing"),
    padEl.classList.add("show", "edit"),
    $("#ped").classList.remove("hidden"),
    edType(),
    layoutPad(),
    edSel(),
    setTimeout(() => {
      (updateSegs($("#ped")), layoutPad(), edSel());
    }, 120));
}
function endEdit(e, t) {
  if (!padEdit) return;
  ((padEdit = !1),
    (drag = null),
    e &&
      D &&
      ((D.padType = E.t),
      (D.padLay = clone(E.l)),
      (S.padType = E.t),
      (S.padLay = clone(E.l)),
      persist()),
    $("#player").classList.remove("editing"),
    padEl.classList.remove("edit"),
    $("#ped").classList.add("hidden"),
    $$("#pad .sel-ctl").forEach((a) => a.classList.remove("sel-ctl")),
    (selC = null),
    t
      ? applyAll(S)
      : ($("#gs").classList.remove("hidden"),
        syncUI($("#gs"), D),
        applyAll(D),
        updateSegs($("#gs")),
        e && toast("Layout do gamepad salvo")));
}
(padEl.addEventListener(
  "pointerdown",
  (e) => {
    if (!padEdit) return;
    (e.stopPropagation(), e.preventDefault());
    const t = e.target.closest("[data-c]");
    if (!t) return;
    const a = t.getBoundingClientRect();
    ((selC = t.dataset.c),
      (drag = {
        el: t,
        id: selC,
        pid: e.pointerId,
        dx: e.clientX - (a.left + a.width / 2),
        dy: e.clientY - (a.top + a.height / 2),
      }));
    try {
      t.setPointerCapture(e.pointerId);
    } catch {}
    edSel();
  },
  !0,
),
  padEl.addEventListener(
    "pointermove",
    (e) => {
      if (!padEdit || !drag || e.pointerId !== drag.pid) return;
      e.stopPropagation();
      const t = padEl.getBoundingClientRect(),
        a = drag.el.getBoundingClientRect(),
        s = a.width / 2,
        n = a.height / 2,
        o = $("#ped").offsetHeight;
      let i = e.clientX - t.left - drag.dx,
        r = e.clientY - t.top - drag.dy;
      ((i = Math.max(s, Math.min(t.width - s, i))),
        (r = Math.max(o + n, Math.min(t.height - n, r))));
      const c = lk(t.width >= t.height ? "l" : "p"),
        u = E.l[c] || (E.l[c] = {}),
        d = u[drag.id] || (u[drag.id] = {});
      ((d.x = i / t.width), (d.y = r / t.height), layoutPad());
    },
    !0,
  ),
  ["pointerup", "pointercancel"].forEach((e) =>
    padEl.addEventListener(
      e,
      (t) => {
        drag && t.pointerId === drag.pid && (drag = null);
      },
      !0,
    ),
  ),
  ($("#ped-type").onclick = (e) => {
    const t = e.target.closest("button");
    t && ((E.t = t.dataset.t), edType(), layoutPad(), edSel());
  }),
  ($("#ped-size").oninput = (e) => {
    if (!selC) return;
    const t = ori(),
      a = E.l[t] || (E.l[t] = {}),
      s = a[selC] || (a[selC] = {});
    ((s.s = e.target.value / 100),
      ($("#ped-sv").textContent = e.target.value + "%"),
      rangeFill(e.target),
      layoutPad());
  }),
  ($("#ped-def").onclick = () => {
    ((E.t = "dpad"),
      (E.l = clearLay(E.l)),
      (selC = null),
      edType(),
      layoutPad(),
      edSel(),
      toast("Padrão restaurado. Toque em Salvar para aplicar"));
  }),
  ($("#ped-cancel").onclick = () => endEdit(!1)),
  ($("#ped-save").onclick = () => endEdit(!0)),
  ($("#gs-edit").onclick = startEdit),
  ($("#kb-players").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    ((kP = +b.dataset.p),
      (capturing = null),
      (capObj = null),
      $$("#kb-players button").forEach((x) => x.classList.toggle("active", x === b)),
      updateSegs($("#view-settings")),
      renderKeysTable());
  }),
  ($("#gs-kb-players").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    ((gP = +b.dataset.p),
      (capturing = null),
      $$("#gs-kb-players button").forEach((x) => x.classList.toggle("active", x === b)),
      updateSegs($("#gs")),
      renderKm());
  }),
  ($("#gs-padreset").onclick = () => {
    ((D.padType = "dpad"),
      (D.padLay = clearLay(D.padLay)),
      syncUI($("#gs"), D),
      applyAll(D),
      toast("Layout restaurado. Toque em Salvar"));
  }),
  ($("#set-padreset").onclick = () => {
    ((S.padType = "dpad"),
      (S.padLay = clearLay(S.padLay)),
      persist(),
      syncUI($("#view-settings"), S),
      toast("Layout do gamepad restaurado"));
  }));
let playReady = !1,
  volOpen = !1,
  tpOpen = !1,
  tpRes = null;
function resumeAudio() {
  try {
    const e = window.EJS_emulator && window.EJS_emulator.Module,
      t =
        e &&
        ((e.AL && e.AL.currentCtx && e.AL.currentCtx.audioCtx) || (e.SDL && e.SDL.audioContext));
    t && t.state === "suspended" && t.resume();
  } catch {}
}
function volNum() {
  const e = Number(S.volume);
  return Number.isFinite(e) ? Math.max(0, Math.min(100, e)) : 100;
}
function volIcon() {
  const e = volNum(),
    t = muted || e === 0 ? "xmark" : e < 50 ? "low" : "high",
    a = `<i class="fa-solid fa-volume-${t}"></i>`;
  (($("#p-mute").innerHTML = a), ($("#vol-ico").innerHTML = a));
  const s = $("#vol-r");
  ((s.value = muted ? 0 : e), rangeFill(s), ($("#vol-v").textContent = (muted ? 0 : e) + "%"));
}
function applyVol() {
  try {
    window.EJS_emulator &&
      window.EJS_emulator.setVolume &&
      window.EJS_emulator.setVolume(muted ? 0 : volNum() / 100);
  } catch {}
  (mp.video && (mp.video.volume = muted ? 0 : volNum() / 100), volIcon());
}
function openVol() {
  const e = $("#p-mute").getBoundingClientRect(),
    t = $("#vol");
  t.classList.remove("hidden");
  const a = t.offsetWidth;
  ((t.style.left = Math.max(8, Math.min(innerWidth - a - 8, e.right - a)) + "px"),
    (t.style.top = e.bottom + 8 + "px"),
    (volOpen = !0),
    volIcon());
}
function closeVol() {
  ((volOpen = !1), $("#vol").classList.add("hidden"));
}
(($("#p-mute").onclick = () => {
  (window.EJS_emulator || mp.role === "guest") && (volOpen ? closeVol() : openVol(), resumeAudio());
}),
  ($("#vol-r").oninput = (e) => {
    const t = +e.target.value;
    ((S.volume = t), (muted = t === 0), persist(), applyVol(), resumeAudio());
  }),
  ($("#vol-ico").onclick = () => {
    ((muted = !muted),
      !muted && volNum() === 0 && (S.volume = 50),
      persist(),
      applyVol(),
      resumeAudio());
  }),
  document.addEventListener(
    "pointerdown",
    (e) => {
      (resumeAudio(), volOpen && !e.target.closest("#vol,#p-mute") && closeVol());
    },
    !0,
  ),
  document.addEventListener("keydown", resumeAudio, !0),
  $(".p-bar").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    t && t.blur();
  }),
  setInterval(() => {
    const e = window.EJS_emulator;
    if (
      !e ||
      !playReady ||
      paused ||
      autoPaused ||
      gsOpen ||
      svOpen ||
      rsOpen ||
      tpOpen ||
      padEdit ||
      document.hidden ||
      !$("#player").classList.contains("show")
    )
      return;
    try {
      e.paused && e.play();
    } catch {}
  }, 400));
function svTip(e) {
  return new Promise((t) => {
    ((tpOpen = !0),
      (tpRes = t),
      placeOvl(),
      ($("#tp-msg").innerHTML =
        `<b>Dica:</b> você carregou o <b>Slot ${svLoaded.slot + 1}</b> e está salvando no <b>Slot ${e + 1}</b>.`),
      ($("#tp-sub").textContent =
        `Ao reiniciar, o jogo volta ao Slot ${svLoaded.slot + 1}. Para reiniciar a partir deste novo save, salve no mesmo slot.`),
      ($("#tp-hide").checked = !1),
      $("#tp").classList.remove("hidden"),
      $("#tp-ok").focus({ preventScroll: !0 }));
  });
}
function tpClose(e) {
  if (!tpOpen) return;
  ((tpOpen = !1),
    $("#tp").classList.add("hidden"),
    e && $("#tp-hide").checked && ((S.hideSvTip = !0), persist()));
  const t = tpRes;
  ((tpRes = null), t && t(e));
}
(($("#tp-ok").onclick = () => tpClose(!0)),
  ($("#tp-no").onclick = () => tpClose(!1)),
  $("#tp").addEventListener("click", (e) => {
    e.target === $("#tp") && tpClose(!1);
  }),
  ($("#btn-tips").onclick = () => {
    ((S.hideRsTip = !1), (S.hideSvTip = !1), persist(), toast("Avisos reativados"));
  }));
function tipUpdate() {
  const e = !("Notification" in window) || Notification.permission === "granted";
  ($("#ld-tip").classList.toggle("hidden", e), $("#p-loading").classList.toggle("tip", !e));
}
function renderPerm() {
  const e = "Notification" in window,
    t = e ? Notification.permission : "unsupported",
    a = $("#perm-badge");
  ((a.className = "perm-badge" + (t === "granted" ? " ok" : t === "default" ? "" : " bad")),
    (a.textContent = {
      granted: "Ativadas",
      default: "Desativadas",
      denied: "Bloqueadas",
      unsupported: "Indisponível",
    }[t]),
    ($("#perm-desc").textContent = {
      granted: "As notificações estão ativadas neste navegador.",
      default: "Permita para ser avisado quando o jogo terminar de carregar.",
      denied:
        "O navegador bloqueou as notificações. Libere nas configurações do site (ícone ao lado do endereço) e recarregue a página.",
      unsupported: "Este navegador não suporta notificações.",
    }[t]),
    ($("#perm-btn").disabled = t !== "default"),
    ($("#perm-test").disabled = t !== "granted"));
}
async function notifyLoaded(e, t) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!t && (!S.notify || (!document.hidden && document.hasFocus()))) return;
  const a = {
    body: `O jogo ${e} foi carregado com sucesso! Volte à aba do PlayRom.io para se divertir!`,
    icon: "logo.png",
    badge: "logo.png",
    tag: "playrom-loaded",
  };
  try {
    const s = new Notification("Seu jogo carregou!", a);
    s.onclick = () => {
      (window.focus(), s.close());
    };
    return;
  } catch {}
  try {
    const s = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    s && s.showNotification && (await s.showNotification("Seu jogo carregou!", a));
  } catch {}
}
(($("#perm-btn").onclick = async () => {
  try {
    await Notification.requestPermission();
  } catch {}
  (renderPerm(),
    tipUpdate(),
    "Notification" in window &&
      Notification.permission === "granted" &&
      toast("Notificações ativadas"));
}),
  ($("#perm-test").onclick = () => notifyLoaded("Exemplo", !0)),
  ($("#ld-tip-btn").onclick = () => {
    (exitPlayer(), goView("settings"));
    const e = $('#set-nav button[data-pane="permissao"]');
    e && e.click();
  }),
  document.addEventListener("visibilitychange", renderPerm),
  window.addEventListener("focus", renderPerm),
  "serviceWorker" in navigator &&
    location.protocol !== "file:" &&
    navigator.serviceWorker.register("sw.js").catch(() => {}));
const SV_N = 5;
let svMode = "save",
  svWasPaused = !1,
  svCloseT = null,
  svConfT = null,
  svConfirm = -1,
  svSlots = [],
  svShot = "";
function svRead(e) {
  return openDB().then(
    (t) =>
      new Promise((a, s) => {
        const n = t.transaction("states"),
          o = n.objectStore("states"),
          i = new Array(SV_N).fill(null);
        for (let r = 0; r < SV_N; r++) {
          const c = o.get(e + "#" + r);
          c.onsuccess = () => {
            i[r] = c.result || null;
          };
        }
        ((n.oncomplete = () => a(i)), (n.onerror = () => s(n.error)));
      }),
  );
}
function emReady() {
  const e = window.EJS_emulator;
  return started && e && e.gameManager ? e : null;
}
function svCapture() {
  try {
    const e = document.querySelector("#ejs-box canvas");
    if (!e || !e.width || !e.height) return "";
    const t = document.createElement("canvas");
    ((t.width = 112), (t.height = Math.max(1, Math.round((112 * e.height) / e.width))));
    const a = t.getContext("2d", { willReadFrequently: !0 });
    a.drawImage(e, 0, 0, t.width, t.height);
    const s = a.getImageData(0, 0, t.width, t.height).data;
    let n = 0;
    for (let o = 0; o < s.length; o += 16) n += s[o] + s[o + 1] + s[o + 2];
    return n < 30 ? "" : t.toDataURL("image/jpeg", 0.6);
  } catch {
    return "";
  }
}
const fmtDate = (e) =>
  new Date(e).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function renderSv() {
  const e = $("#sv-list");
  e.textContent = "";
  for (let t = 0; t < SV_N; t++) {
    const a = svSlots[t],
      s = document.createElement("button");
    ((s.type = "button"),
      (s.className = "sv-slot" + (svConfirm === t ? " confirm" : "")),
      (s.disabled = svMode === "load" && !a));
    const n = document.createElement("div");
    if (((n.className = "sv-thumb"), a && a.thumb)) {
      const l = document.createElement("img");
      ((l.src = a.thumb), (l.alt = ""), n.appendChild(l));
    } else n.innerHTML = '<i class="fa-solid fa-' + (a ? "floppy-disk" : "plus") + '"></i>';
    const o = document.createElement("div");
    o.className = "sv-info";
    const i = document.createElement("b");
    i.textContent = "Slot " + (t + 1);
    const r = document.createElement("span");
    ((r.textContent = a ? fmtDate(a.time) : "Vazio"), o.append(i, r));
    const c = document.createElement("span");
    ((c.className = "sv-act"),
      (c.textContent =
        svMode === "load"
          ? a
            ? "Carregar"
            : ""
          : svConfirm === t
            ? "Confirmar?"
            : a
              ? "Substituir"
              : "Salvar aqui"),
      s.append(n, o, c),
      (s.onclick = () => svPick(t)),
      e.appendChild(s));
  }
}
async function openSv(e) {
  if (svOpen || gsOpen || rsOpen || !current) return;
  placeOvl();
  const t = emReady();
  if (!t) {
    toast("Aguarde o jogo carregar");
    return;
  }
  if (((svOpen = !0), (svMode = e), (svConfirm = -1), releaseAll(), (svShot = ""), e === "save"))
    for (let a = 0; a < 3 && !svShot; a++)
      (await new Promise((s) => rawRAF(s)), (svShot = svCapture()));
  try {
    svSlots = await svRead(current.name);
  } catch {
    svSlots = new Array(SV_N).fill(null);
  }
  if (!(!svOpen || !current)) {
    if (((svWasPaused = paused), !paused))
      try {
        t.pause();
      } catch {}
    (($("#sv-ttl").textContent = e === "save" ? "Salvar jogo" : "Carregar jogo"),
      ($("#sv-ico").className = "fa-solid fa-" + (e === "save" ? "floppy-disk" : "folder-open")),
      ($("#sv-game").textContent = fmtName(current.name).display),
      renderSv(),
      clearTimeout(svCloseT),
      $("#sv").classList.remove("closing", "hidden"));
  }
}
function closeSv(e) {
  if (!svOpen) return;
  ((svOpen = !1), clearTimeout(svConfT));
  const t = $("#sv");
  if (
    (e || reduceMotion()
      ? t.classList.add("hidden")
      : (t.classList.add("closing"),
        (svCloseT = setTimeout(() => {
          (t.classList.add("hidden"), t.classList.remove("closing"));
        }, 210))),
    !svWasPaused && window.EJS_emulator && !autoPaused)
  )
    try {
      window.EJS_emulator.play();
    } catch {}
}
async function svPick(e) {
  const t = emReady();
  if (!t || !current) {
    closeSv();
    return;
  }
  if (svMode === "save") {
    if (svSlots[e] && svConfirm !== e) {
      ((svConfirm = e),
        clearTimeout(svConfT),
        (svConfT = setTimeout(() => {
          ((svConfirm = -1), svOpen && renderSv());
        }, 3e3)),
        renderSv());
      return;
    }
    if (svLoaded && svLoaded.slot !== e && !S.hideSvTip && !(await svTip(e))) return;
    try {
      const a = await t.gameManager.getState();
      if (!a || !a.length) throw new Error("vazio");
      (await idbOp("states", "readwrite", (s) =>
        s.put({
          id: current.name + "#" + e,
          game: current.name,
          slot: e,
          time: Date.now(),
          thumb: svShot,
          data: new Uint8Array(a),
        }),
      ),
        svLoaded && svLoaded.slot === e && (svLoaded.data = new Uint8Array(a)),
        toast("Jogo salvo no slot " + (e + 1)),
        closeSv());
    } catch (a) {
      (console.warn(a), showBanner("N\xE3o foi poss\xEDvel salvar o jogo."));
    }
  } else {
    const a = svSlots[e];
    if (!a) return;
    try {
      (await t.gameManager.loadState(a.data),
        (svLoaded = { slot: e, data: a.data }),
        toast("Slot " + (e + 1) + " carregado"),
        closeSv());
    } catch (s) {
      (console.warn(s), showBanner("N\xE3o foi poss\xEDvel carregar o save."));
    }
  }
}
(($("#p-save").onclick = () => openSv("save")),
  ($("#p-load").onclick = () => openSv("load")),
  ($("#sv-x").onclick = () => closeSv()),
  $("#sv").addEventListener("click", (e) => {
    e.target === $("#sv") && closeSv();
  }));
/* ===== Tela "Nova update!" =====
   A cada atualização do site: mude APP_VER e a lista APP_NOTES. */
const APP_VER = "1.2.0",
  APP_NOTES = [
    "O PSP foi removido: agora o PlayRom.io tem PS1, Mega Drive e Atari.",
    "A pasta principal agora tem só 3 pastas: PS1, Mega Drive e Atari (uma pasta PSP antiga é ignorada).",
    "Otimizador automático em PS1 e Mega Drive, com modo leve automático no celular.",
  ];
function updCheck() {
  const old = cfg.get("ver", null);
  if (old === APP_VER) return Promise.resolve();
  if (old === null && !cfg.get("setupDone", 0)) {
    cfg.set("ver", APP_VER);
    return Promise.resolve();
  }
  return new Promise((res) => {
    const st = document.createElement("style");
    st.textContent =
      "#upd{position:fixed;inset:0;z-index:150;background:#080808;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .4s ease}" +
      "#upd.out{animation:fadeOut .3s ease forwards}" +
      "#upd .upd-box{width:100%;max-width:440px;max-height:100%;overflow-y:auto;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:30px 26px 24px;text-align:center;box-shadow:0 30px 60px #000c;animation:popIn .5s var(--spring)}" +
      "#upd .icon-box{margin-bottom:14px}" +
      "#upd h2{font-family:'Space Grotesk',sans-serif;font-size:1.7rem;margin-bottom:10px}" +
      "#upd .upd-v{display:inline-block;padding:5px 14px;border-radius:999px;background:#fb333324;border:1px solid #fb333380;font:700 .8rem 'Space Grotesk',sans-serif;letter-spacing:.06em}" +
      "#upd .upd-h{margin:20px 0 8px;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--red);font-weight:700;text-align:left}" +
      "#upd ul{list-style:none;text-align:left;display:flex;flex-direction:column;gap:8px;margin-bottom:22px}" +
      "#upd li{display:flex;gap:10px;font-size:.85rem;line-height:1.45;color:#ddd;padding:10px 12px;background:#ffffff06;border:1px solid var(--line);border-radius:12px}" +
      "#upd li:before{content:'\\2022';color:var(--red);font-weight:700}";
    document.head.appendChild(st);
    const o = document.createElement("div");
    o.id = "upd";
    o.setAttribute("role", "dialog");
    o.setAttribute("aria-modal", "true");
    o.innerHTML =
      '<div class="upd-box"><div class="icon-box"><i class="fa-solid fa-bolt"></i></div>' +
      "<h2>Nova update!</h2>" +
      '<span class="upd-v"></span>' +
      '<div class="upd-h">O que mudou</div><ul></ul>' +
      '<button class="btn block" type="button"><span>Continuar</span><i class="fa-solid fa-arrow-right"></i></button></div>';
    $(".upd-v", o).textContent = "Versão " + APP_VER;
    const ul = $("ul", o);
    APP_NOTES.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    $("button", o).onclick = () => {
      cfg.set("ver", APP_VER);
      o.classList.add("out");
      setTimeout(
        () => {
          o.remove();
          st.remove();
          res();
        },
        reduceMotion() ? 0 : 300,
      );
    };
    document.body.appendChild(o);
    $("button", o).focus({ preventScroll: !0 });
  });
}
async function endSplash() {
  const e = $("#splash"),
    t = $("#splash-ui"),
    a = $("#splash-logo");
  if (reduceMotion()) {
    ((e.style.transition = "opacity .3s"),
      (e.style.opacity = 0),
      e.classList.add("out"),
      await sleep(300),
      e.remove());
    return;
  }
  const s = $("#app-header").classList.contains("hidden") ? null : $("#brand-logo");
  (s && s.classList.add("wait"), document.body.classList.remove("booting"));
  const n = a.getBoundingClientRect(),
    o = s
      ? (() => {
          const h = $("#app-header");
          h.style.animation = "none";
          const q = s.getBoundingClientRect();
          return ((h.style.animation = ""), q);
        })()
      : { left: 20, top: 15, width: 34, height: 34 };
  (t.classList.add("fade"), e.classList.add("out"));
  const i = o.left + o.width / 2 - (n.left + n.width / 2),
    r = o.top + o.height / 2 - (n.top + n.height / 2),
    c = o.width / n.width;
  (await a
    .animate([{ transform: "none" }, { transform: `translate(${i}px,${r}px) scale(${c})` }], {
      duration: 850,
      easing: "cubic-bezier(.65,0,.35,1)",
      fill: "forwards",
    })
    .finished.catch(() => {}),
    s
      ? s.classList.remove("wait")
      : await a
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" })
          .finished.catch(() => {}),
    e.remove());
}
(window.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.add("booting");
  await updCheck();
  const e = $("#splash-logo").cloneNode(),
    t = $("#splash-ui").cloneNode(!0);
  (e.removeAttribute("id"),
    t.removeAttribute("id"),
    t.appendChild(e),
    $("#p-loading").appendChild(t));
  const a = ldUI($("#splash")),
    s = performance.now(),
    n = reduceMotion() ? 200 : 7e3;
  await new Promise((l) => requestAnimationFrame(() => requestAnimationFrame(l)));
  const o = $(".ld-st", $("#splash")),
    i = ["Iniciando...", "Carregando biblioteca...", "Preparando interface...", "Quase pronto..."];
  let r = -1;
  ((function l(u) {
    const d = Math.min(1, Math.max(0, (u - s) / n)),
      f = d < 0.25 ? 0 : d < 0.55 ? 1 : d < 0.85 ? 2 : 3;
    (a(100 * d * d * (3 - 2 * d)),
      f !== r && o && (o.textContent = i[(r = f)]),
      d < 1 && requestAnimationFrame(l));
  })(s),
    buildLookup(),
    applyAll(S),
    syncUI($("#view-settings"), S));
  let c = [];
  try {
    c = (await dbLoad()).map((x) => Object.assign(x, { sys: x.sys || "ps1" })).filter((x) => x.handle && ROM_OK(x.name, x.sys));
  } catch (l) {
    console.error(l);
  }
  try {
    dirHandle = (await idbOp("meta", "readonly", (l) => l.get("dir"))) || null;
  } catch {
    dirHandle = null;
  }
  ((c && c.length) || cfg.get("setupDone", 0) || window.__plPend
    ? ((library = c || []), showApp())
    : ($("#setup").classList.remove("hidden"), showStep("st1", !0)),
    await sleep(Math.max(0, n - (performance.now() - s))),
    o && (o.textContent = "Pronto!"),
    await sleep(reduceMotion() ? 0 : 450),
    await new Promise((l) => requestAnimationFrame(() => requestAnimationFrame(l))),
    await endSplash(),
    document.body.classList.remove("booting"),
    moveInd(),
    tosCheck(),
    syncFolder(!1),
    !$("#app-header").classList.contains("hidden") && window.__plPend && mpLinkJoin());
}),
  window.addEventListener("beforeunload", () => {
    romUrl && URL.revokeObjectURL(romUrl);
  }));
const TOS_V = 2,
  tosEl = $("#tos"),
  tosCk = $("#tos-ck"),
  tosOk = $("#tos-ok");
function tosOpen(f) {
  $$(".ejs-v").forEach((e) => (e.textContent = EJS_VER));
  tosEl.dataset.f = f ? 1 : 0;
  tosCk.checked = !1;
  tosCk.parentNode.classList.toggle("hidden", !f);
  $("#tos-x").classList.toggle("hidden", !!f);
  tosOk.disabled = !!f;
  tosOk.firstChild.textContent = f ? "Continuar" : "Fechar";
  tosEl.classList.remove("hidden");
  $(".tos-body", tosEl).scrollTop = 0;
}
const tosClose = () => tosEl.classList.add("hidden"),
  tosCheck = () => {
    cfg.get("tos", 0) !== TOS_V && tosOpen(!0);
  };
((tosCk.onchange = () => {
  tosOk.disabled = !tosCk.checked;
}),
  (tosOk.onclick = () => {
    (tosEl.dataset.f === "1" && cfg.set("tos", TOS_V), tosClose());
  }),
  ($("#tos-x").onclick = tosClose),
  ($("#btn-tos").onclick = () => tosOpen(!1)),
  $$(".ejs-v").forEach((e) => (e.textContent = EJS_VER)));
