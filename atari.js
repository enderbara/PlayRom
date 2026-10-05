"use strict";

/*
 * Controles do Atari
 * ------------------
 * O Atari não tem os botões do PlayStation: só direcional + 1 botão de fogo (o 7800 tem 2),
 * além de Reset e Select. Por isso ele usa um mapa de controles próprio (teclado e controle USB),
 * separado do mapa do PS1. Ao abrir um jogo de Atari, um aviso mostra os controles e deixa alterar.
 */

const ATARI_ACTIONS = [
  ["UP", "Cima", 0],
  ["DOWN", "Baixo", 0],
  ["LEFT", "Esquerda", 0],
  ["RIGHT", "Direita", 0],
  ["FIRE", "Botão de fogo", 1],
  ["FIRE2", "Fogo 2 (só Atari 7800)", 1],
  ["RESET", "Reset / Start", 1],
  ["SELECT", "Select", 1],
];
const ATARI_DEF = {
  kb: {
    UP: "ArrowUp",
    DOWN: "ArrowDown",
    LEFT: "ArrowLeft",
    RIGHT: "ArrowRight",
    FIRE: "KeyZ",
    FIRE2: "KeyX",
    RESET: "Enter",
    SELECT: "ShiftRight",
  },
  gp: { FIRE: 0, FIRE2: 1, RESET: 9, SELECT: 8 },
};
/* nome do botão no padrão do emulador (RetroPad) */
const ATARI_BTN = {
  UP: "UP",
  DOWN: "DOWN",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
  FIRE: "B",
  FIRE2: "A",
  RESET: "START",
  SELECT: "SELECT",
};

let atOpen = false,
  atCap = null, // { type: "kb" | "gp", act }
  atWasPaused = false,
  atGpTimer = 0,
  atEl = null;

function atariCfg() {
  if (!S.atari || typeof S.atari !== "object") S.atari = {};
  S.atari.kb = Object.assign({}, ATARI_DEF.kb, S.atari.kb);
  S.atari.gp = Object.assign({}, ATARI_DEF.gp, S.atari.gp);
  return S.atari;
}

function atariOn() {
  return !!(
    typeof current !== "undefined" &&
    current &&
    mp.role !== "guest" &&
    SYSTEMS[sysOf(current)].group === "atari"
  );
}

function atariLookup() {
  const kb = atariCfg().kb,
    m = {};
  for (const a of Object.keys(kb)) {
    const code = kb[a];
    if (!code) continue;
    m[code] = { p: 0, b: ATARI_BTN[a] };
    if (/^Shift/.test(code)) m.ShiftLeft = m.ShiftRight = { p: 0, b: ATARI_BTN[a] };
  }
  return m;
}

/* Botões do controle USB para o Atari (substitui o mapa do PS1). */
function atariGpMap(t) {
  const g = atariCfg().gp;
  return {
    B: t(g.FIRE),
    A: t(g.FIRE2),
    START: t(g.RESET),
    SELECT: t(g.SELECT),
    X: false,
    Y: false,
    L: false,
    R: false,
    L2: false,
    R2: false,
  };
}

/* Gamepad na tela: mostra só o que o Atari usa e troca os nomes. */
function atariPad(sys) {
  const pad = document.getElementById("pad");
  if (!pad) return;
  pad.classList.toggle("atari", !!sys);
  if (sys) pad.dataset.sys = sys;
  else delete pad.dataset.sys;
  const set = (b, txt) => {
    const el = pad.querySelector('.pb[data-btn="' + b + '"]');
    if (!el) return;
    if (el.dataset.orig === undefined) el.dataset.orig = el.textContent;
    el.textContent = sys && txt != null ? txt : el.dataset.orig;
  };
  set("B", "FOGO");
  set("A", sys === "a7800" ? "FOGO 2" : null);
  set("START", "RESET");
  const b = document.getElementById("p-atari");
  b && b.classList.toggle("hidden", !sys);
}

function atariGpName(n) {
  return "Botão " + n;
}

/* ---------- captura de tecla / botão ---------- */
function atariKey(code) {
  const cap = atCap;
  if (!cap || cap.type !== "kb") return;
  atCap = null;
  if (code !== "Escape") {
    const kb = atariCfg().kb;
    for (const k of Object.keys(kb)) if (k !== cap.act && kb[k] === code) kb[k] = kb[cap.act];
    kb[cap.act] = code;
    persist();
  }
  atariRender(code !== "Escape" ? cap.act : null);
}

function atariGpCapture(act) {
  clearInterval(atGpTimer);
  const t0 = performance.now();
  let armed = false;
  atGpTimer = setInterval(() => {
    const gp = typeof getGamepad === "function" ? getGamepad() : null;
    if (!gp || performance.now() - t0 > 8000) {
      clearInterval(atGpTimer);
      atCap = null;
      atariRender();
      return;
    }
    const down = [];
    gp.buttons.forEach((b, i) => b && b.pressed && i < 12 && down.push(i));
    if (!armed) {
      armed = !down.length; // espera soltar tudo antes de ouvir
      return;
    }
    if (down.length) {
      clearInterval(atGpTimer);
      const g = atariCfg().gp;
      for (const k of Object.keys(g)) if (k !== act && g[k] === down[0]) g[k] = g[act];
      g[act] = down[0];
      atCap = null;
      persist();
      atariRender(act);
    }
  }, 40);
}

/* ---------- janela ---------- */
function atariBuild() {
  if (atEl) return atEl;
  atEl = document.createElement("div");
  atEl.id = "atari-ui";
  atEl.className = "hidden";
  atEl.innerHTML =
    '<div class="at-box">' +
    '<div class="at-head"><i class="fa-solid fa-ghost"></i><h2>Controles do Atari</h2></div>' +
    '<p class="at-note"><b>Atenção:</b> o Atari funciona diferente do PlayStation. Ele tem só o ' +
    "direcional e <b>1 botão de fogo</b> (o 7800 tem 2), além de <b>Reset</b> e <b>Select</b>. " +
    "Por isso os controles mudam em relação aos jogos de PS1. Clique em uma tecla ou botão abaixo para alterar.</p>" +
    '<div class="at-gpst" id="at-gpst"></div>' +
    '<div class="at-list" id="at-list"></div>' +
    '<label class="at-skip"><input type="checkbox" id="at-skip" /> Não mostrar este aviso ao abrir jogos do Atari</label>' +
    '<div class="at-actions"><button class="btn small ghost" id="at-def">Restaurar padrão</button>' +
    '<button class="btn small" id="at-ok">Fechar</button></div>' +
    "</div>";
  document.body.appendChild(atEl);
  atEl.querySelector("#at-def").onclick = () => {
    atCap = null;
    clearInterval(atGpTimer);
    S.atari = { kb: Object.assign({}, ATARI_DEF.kb), gp: Object.assign({}, ATARI_DEF.gp) };
    persist();
    atariRender();
  };
  atEl.querySelector("#at-ok").onclick = () => atariClose();
  atEl.querySelector("#at-skip").onchange = (e) => {
    S.atariHintOff = !!e.target.checked;
    persist();
  };
  atEl.addEventListener("pointerdown", (e) => {
    if (e.target === atEl) atariClose();
  });
  return atEl;
}

function atariRender(setAct) {
  const list = document.getElementById("at-list");
  if (!list) return;
  const c = atariCfg();
  list.textContent = "";
  ATARI_ACTIONS.forEach(([act, label, hasGp]) => {
    const row = document.createElement("div");
    row.className = "at-row";
    const name = document.createElement("span");
    name.className = "at-name";
    name.textContent = label;
    const kb = document.createElement("button"),
      waitK = atCap && atCap.type === "kb" && atCap.act === act;
    kb.className = "km-key" + (waitK ? " wait" : "") + (setAct === act ? " set" : "");
    kb.textContent = waitK ? "Pressione..." : keyLabel(c.kb[act]);
    kb.title = "Tecla";
    kb.onclick = () => {
      clearInterval(atGpTimer);
      atCap = waitK ? null : { type: "kb", act };
      atariRender();
    };
    const gp = document.createElement("button"),
      waitG = atCap && atCap.type === "gp" && atCap.act === act;
    if (hasGp) {
      gp.className = "km-key at-gpb" + (waitG ? " wait" : "") + (setAct === act ? " set" : "");
      gp.textContent = waitG ? "Aperte no controle..." : atariGpName(c.gp[act]);
      gp.title = "Botão do controle";
      gp.onclick = () => {
        if (waitG) {
          clearInterval(atGpTimer);
          atCap = null;
          atariRender();
          return;
        }
        if (!getGamepad()) {
          toast("Conecte um controle e aperte um botão nele primeiro.");
          return;
        }
        atCap = { type: "gp", act };
        atariRender();
        atariGpCapture(act);
      };
    } else {
      gp.className = "at-fixed";
      gp.textContent = "D-pad / analógico";
    }
    row.append(name, kb, gp);
    list.appendChild(row);
  });
  const st = document.getElementById("at-gpst");
  if (st) {
    const g = getGamepad();
    st.textContent = g ? "Controle conectado: " + (g.id || "").replace(/\(.*?\)/g, "").trim().slice(0, 50) : "Nenhum controle USB detectado (conecte e aperte um botão para poder alterar os botões dele).";
    st.classList.toggle("on", !!g);
  }
  const skip = document.getElementById("at-skip");
  if (skip) skip.checked = !!S.atariHintOff;
  const h = atEl.querySelector("h2");
  if (h) {
    h.textContent =
      "Controles do Atari" +
      (typeof current !== "undefined" && current && atariOn() ? " · " + SYSTEMS[sysOf(current)].label : "");
  }
}

function atariOpen() {
  if (atOpen) return;
  atariBuild();
  atOpen = true;
  atCap = null;
  try {
    releaseAll();
  } catch {}
  atWasPaused = !!(typeof paused !== "undefined" && paused) || !!(typeof autoPaused !== "undefined" && autoPaused);
  if (!atWasPaused && window.EJS_emulator) {
    try {
      window.EJS_emulator.pause();
    } catch {}
  }
  atariRender();
  atEl.classList.remove("hidden");
}

function atariClose(quiet) {
  if (!atOpen) return;
  clearInterval(atGpTimer);
  atCap = null;
  atOpen = false;
  persist();
  atEl && atEl.classList.add("hidden");
  if (!quiet && !atWasPaused && window.EJS_emulator && !(typeof autoPaused !== "undefined" && autoPaused)) {
    try {
      window.EJS_emulator.play();
    } catch {}
  }
}

/* Chamado quando o jogo inicia: ajusta o gamepad da tela e mostra o aviso. */
function atariAutoShow() {
  const t = current;
  if (!atariOn()) {
    atariPad(null);
    return;
  }
  atariPad(sysOf(t));
  if (S.atariHintOff) return;
  let n = 0;
  const iv = setInterval(() => {
    if (current !== t) return clearInterval(iv);
    if (playReady) {
      clearInterval(iv);
      setTimeout(() => current === t && !atOpen && atariOpen(), 900);
    } else if (++n > 80) clearInterval(iv);
  }, 250);
}

document.addEventListener("keydown", (e) => {
  if (atOpen && !atCap && e.key === "Escape") {
    e.preventDefault();
    atariClose();
  }
});
(function () {
  const b = document.getElementById("p-atari");
  b && (b.onclick = () => atariOpen());
  const s = document.getElementById("btn-atari-ctl");
  s && (s.onclick = () => atariOpen());
})();