"use strict";

/*
 * Otimizador automático do PlayRom.io (versão corrigida)
 * ------------------------------------------------------
 * Níveis (cada um inclui os anteriores):
 *   0  Nenhum:   usa as configurações do jogador
 *   1  Leve:     sem efeitos de imagem + opções leves do núcleo (áudio, dithering)
 *   2  Médio:    pulo de quadros automático
 *   3  Alto:     pulo de quadros fixo + atalhos de velocidade (só nesta partida)
 *   4  Máximo:   pulo de quadros agressivo (só nesta partida)
 *
 * Mudanças desta versão:
 *  - NÃO força mais o filtro "pixel" (a imagem fica suave e bonita em qualquer nível).
 *  - Só sobe de nível depois de lentidão LONGA (carregamento de disco/FMV não conta).
 *  - Sobe 1 nível por vez e espera mais entre ajustes.
 *  - Níveis 3 e 4 NÃO são salvos por jogo (o máximo salvo é o 2).
 *  - A predefinição "Baixa" usa filtro suave.
 *  - A taxa de atualização da tela (Hz) é medida de novo fora da splash e a cada jogo.
 */

const AutoOpt = {
  MAX: 4,
  STORE_KEY: "autoOptLevels",
  SAVE_MAX: 2, // maior nível que fica salvo para o jogo
  LAG_RATIO: 0.7, // abaixo de 70% do FPS esperado = travando
  SEVERE_RATIO: 0.35, // abaixo de 35% = muito lento
  LAG_SECONDS: 6, // segundos seguidos de lentidão antes de agir
  SEVERE_SECONDS: 4, // idem, quando está muito lento
  GRACE_SECONDS: 15, // tolerância depois que o jogo começa (boot / leitura de disco)
  COOLDOWN_SECONDS: 10, // espera depois de cada ajuste antes de medir de novo

  level: 0,
  game: "",
  lagSeconds: 0,
  wait: 0,
  warnedMax: false,
};

/* Opções do núcleo aplicadas em cada nível (cumulativo), por console. */
const AUTO_OPT_CORE = {
  ps1: {
    1: {
      pcsx_rearmed_spu_reverb: "disabled",
      pcsx_rearmed_spu_interpolation: "off",
      pcsx_rearmed_neon_enhancement_enable: "disabled",
      pcsx_rearmed_neon_interlace_enable: "disabled",
      pcsx_rearmed_dithering: "disabled",
    },
    2: { pcsx_rearmed_frameskip_type: "auto" },
    3: {
      pcsx_rearmed_frameskip_type: "fixed interval",
      pcsx_rearmed_frameskip_interval: "1",
      pcsx_rearmed_nostalls: "enabled",
      pcsx_rearmed_nosmccheck: "enabled",
      pcsx_rearmed_nogteflags: "enabled",
      pcsx_rearmed_gteregsunneeded: "enabled",
    },
    4: { pcsx_rearmed_frameskip_interval: "2" },
  },
  md: {
    2: {
      genesis_plus_gx_audio_filter: "disabled",
      genesis_plus_gx_blargg_ntsc_filter: "disabled",
    },
    3: { genesis_plus_gx_no_sprite_limit: "disabled" },
  },
  atari: {},
};

/* Consoles em que o otimizador atua. */
const AUTO_OPT_SYS = ["ps1", "md", "atari"];

/* Nível máximo útil por console (o Atari não precisa de mais que o nível 1). */
const AUTO_OPT_CAP = { ps1: 4, md: 3, atari: 1 };

const AUTO_OPT_MESSAGES = {
  1: "Jogo travando: desliguei os efeitos visuais (otimização leve).",
  2: "Ainda lento: ativei o pulo de quadros automático (otimização média).",
  3: "Ainda lento: otimização alta ativada nesta partida. Alguns jogos podem ter pequenos defeitos.",
  4: "Ainda lento: otimização máxima ativada nesta partida. A imagem fica menos fluida, mas o jogo mantém a velocidade. Feche outras abas e apps.",
};

function autoOptEnabled() {
  return S.autoOpt !== false && AUTO_OPT_SYS.includes(SYS);
}

function autoOptCap() {
  return Math.min(AutoOpt.MAX, AUTO_OPT_CAP[SYS] || 1);
}

function autoOptMin(settings) {
  const n = Number((settings || S).optMin) || 0;
  return Math.max(0, Math.min(AutoOpt.MAX, n));
}

/* Nível realmente em uso agora. */
function autoOptLevel(settings) {
  return Math.min(autoOptCap(), Math.max(AutoOpt.level, autoOptMin(settings)));
}

function autoOptSavedLevels() {
  return cfg.get(AutoOpt.STORE_KEY, {}) || {};
}

/* Salva só níveis suaves (até SAVE_MAX). Níveis 3 e 4 valem apenas nesta partida. */
function autoOptSave() {
  if (!AutoOpt.game) return;
  const all = autoOptSavedLevels();
  const lv = Math.min(AutoOpt.level, AutoOpt.SAVE_MAX);
  if (lv > 0) all[AutoOpt.game] = lv;
  else delete all[AutoOpt.game];
  cfg.set(AutoOpt.STORE_KEY, all);
}

function autoOptWeakDevice() {
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  return isMobDev() || cores <= 4 || mem <= 4;
}

/* Chamado ao abrir um jogo: escolhe o nível inicial. */
function autoOptStart(gameName) {
  AutoOpt.game = gameName || "";
  AutoOpt.lagSeconds = 0;
  AutoOpt.wait = AutoOpt.GRACE_SECONDS;
  AutoOpt.warnedMax = false;
  AutoOpt.level = 0;
  if (!autoOptEnabled()) return;

  const saved = autoOptSavedLevels()[AutoOpt.game];
  // níveis salvos por versões antigas (3 ou 4) são limitados ao 2
  if (saved) AutoOpt.level = Math.min(autoOptCap(), saved, AutoOpt.SAVE_MAX);
  else if (autoOptWeakDevice()) AutoOpt.level = SYS === "ps1" ? 1 : 0;
}

/* Chamado quando o jogo sai: limpa o estado. */
function autoOptReset() {
  AutoOpt.level = 0;
  AutoOpt.game = "";
  AutoOpt.lagSeconds = 0;
  AutoOpt.wait = 0;
  AutoOpt.warnedMax = false;
}

/* Devolve as configurações de vídeo já otimizadas (sem alterar as salvas do jogador).
   Não força mais o filtro "pixel": a imagem continua como o jogador escolheu. */
function autoOptApply(settings) {
  if (!autoOptEnabled() || autoOptLevel(settings) < 1) return settings;
  return Object.assign({}, settings, { perf: true });
}

/* Muda uma opção do núcleo em execução. */
function autoOptSetCore(emu, key, value) {
  try {
    if (typeof emu.changeSettingOption === "function") emu.changeSettingOption(key, value);
  } catch (err) {
    console.warn("otimização: não consegui mudar " + key, err);
  }
  try {
    emu.gameManager && typeof emu.gameManager.setVariable === "function" && emu.gameManager.setVariable(key, value);
  } catch {}
}

/* Aplica no núcleo as opções do nível atual (e dos anteriores). */
function autoOptApplyCore() {
  const emu = window.EJS_emulator;
  if (!emu || !autoOptEnabled()) return;
  const table = AUTO_OPT_CORE[SYS] || {};
  const level = autoOptLevel();
  for (let n = 1; n <= level; n++) {
    const opts = table[n] || {};
    for (const key of Object.keys(opts)) autoOptSetCore(emu, key, opts[key]);
  }
}

/* Sobe de nível (sempre 1 por vez), aplica e avisa. */
function autoOptStep() {
  const cap = autoOptCap();
  AutoOpt.level = Math.min(cap, autoOptLevel() + 1);
  AutoOpt.lagSeconds = 0;
  AutoOpt.wait = AutoOpt.COOLDOWN_SECONDS;
  autoOptSave();
  applyAll(S);
  autoOptApplyCore();
  toast(AUTO_OPT_MESSAGES[AutoOpt.level] || AUTO_OPT_MESSAGES[4], 4500);
}

function autoOptCanMeasure() {
  return (
    playReady &&
    !paused &&
    !autoPaused &&
    !gsOpen &&
    !svOpen &&
    !rsOpen &&
    !tpOpen &&
    !document.hidden &&
    !padEdit &&
    !(typeof mp !== "undefined" && mp && mp.role === "guest")
  );
}

/* Chamado uma vez por segundo com o FPS medido nesse segundo. */
function autoOptTick(fps) {
  if (!autoOptEnabled() || !autoOptCanMeasure()) {
    AutoOpt.lagSeconds = 0;
    return;
  }
  if (AutoOpt.wait > 0) {
    AutoOpt.wait -= 1;
    return;
  }

  const expected = Math.min(fpsCap || 60, hz, 60);
  if (fps >= expected * AutoOpt.LAG_RATIO) {
    AutoOpt.lagSeconds = 0;
    return;
  }

  const severe = fps < expected * AutoOpt.SEVERE_RATIO;
  AutoOpt.lagSeconds += 1;
  if (AutoOpt.lagSeconds < (severe ? AutoOpt.SEVERE_SECONDS : AutoOpt.LAG_SECONDS)) return;

  // Anfitrião no multiplayer: o vídeo enviado também gasta CPU. Reduz ele antes do emulador.
  if (typeof netoptShedLoad === "function" && netoptShedLoad("cpu")) {
    AutoOpt.lagSeconds = 0;
    AutoOpt.wait = AutoOpt.COOLDOWN_SECONDS;
    return;
  }

  if (autoOptLevel() < autoOptCap()) {
    autoOptStep();
  } else if (!AutoOpt.warnedMax) {
    AutoOpt.warnedMax = true;
    toast("Já estou no modo mais leve. Feche outras abas e apps.", 5500);
  }
}

/* =====================================================================
 * Correções que vivem aqui, para você não precisar editar o app.js
 * ===================================================================== */

/* 1) Predefinição "Baixa": mantém a imagem suave (antes era pixelada e serrilhada). */
PRESETS.low.filter = "smooth";

/* 2) Medição confiável da taxa de atualização da tela (Hz).
      Usa o percentil 10 dos intervalos: travadas só aumentam o intervalo,
      então o menor valor é o mais próximo do real. */
function measureHz(frames) {
  frames = frames || 60;
  return new Promise((resolve) => {
    const d = [];
    let last = 0,
      n = 0;
    const step = (t) => {
      if (last) d.push(t - last);
      last = t;
      if (++n < frames) rawRAF(step);
      else {
        d.sort((a, b) => a - b);
        const best = d[Math.floor(d.length * 0.1)] || 16.7;
        resolve(Math.max(24, Math.min(1000, Math.round(1000 / best))));
      }
    };
    rawRAF(step);
  });
}

/* mede de novo depois que a splash terminou (a splash é pesada e distorcia a medida) */
window.addEventListener("load", () => {
  setTimeout(() => {
    measureHz(60).then((v) => {
      hz = v;
    });
  }, 8000);
});

/* mede a cada jogo aberto, antes de começar o carregamento */
(function () {
  const originalPlayGame = playGame;
  playGame = function (index) {
    measureHz(45).then((v) => {
      hz = v;
    });
    return originalPlayGame(index);
  };
})();
