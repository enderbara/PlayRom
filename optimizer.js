"use strict";

/*
 * Otimizador automático do PlayRom.io
 * -----------------------------------
 * 4 níveis, cada um inclui os anteriores:
 *   0  Nenhum:   usa as configurações do jogador
 *   1  Leve:     sem efeitos de imagem + opções leves do núcleo (áudio, texturas)
 *   2  Médio:    pulo de quadros automático / 1 quadro
 *   3  Alto:     pulo de quadros fixo + atalhos de velocidade (pode causar pequenos defeitos)
 *   4  Máximo:   pulo de quadros agressivo (a imagem fica menos fluida, mas o jogo mantém a velocidade)
 *
 * O nível usado é o MAIOR entre o mínimo manual (S.optMin) e o nível automático.
 * Vigia o FPS: se o jogo ficar lento, sobe de nível (2 níveis de uma vez se estiver MUITO lento,
 * ex.: 2 FPS), avisa na tela e guarda o nível por jogo para abrir já otimizado da próxima vez.
 * Funciona em PS1 e Mega Drive (Atari 2600 só usa o nível 1, pois é muito leve).
 */

const AutoOpt = {
  MAX: 4,
  STORE_KEY: "autoOptLevels",
  LAG_RATIO: 0.75, // abaixo de 75% do FPS esperado = travando
  SEVERE_RATIO: 0.4, // abaixo de 40% = muito lento: reage mais rápido e sobe 2 níveis
  LAG_SECONDS: 3, // segundos seguidos de lentidão antes de agir
  SEVERE_SECONDS: 2, // idem, quando está muito lento
  GRACE_SECONDS: 6, // tolerância depois que o jogo começa
  COOLDOWN_SECONDS: 5, // espera depois de cada ajuste antes de medir de novo

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
  3: "Ainda lento: otimização alta ativada. Alguns jogos podem ter pequenos defeitos.",
  4: "Ainda lento: otimização máxima ativada. A imagem fica menos fluida, mas o jogo mantém a velocidade. Feche outras abas e apps.",
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

function autoOptSave() {
  if (!AutoOpt.game) return;
  const all = autoOptSavedLevels();
  if (AutoOpt.level > 0) all[AutoOpt.game] = AutoOpt.level;
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
  if (saved) AutoOpt.level = Math.min(autoOptCap(), saved);
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

/* Devolve as configurações de vídeo já otimizadas (sem alterar as salvas do jogador). */
function autoOptApply(settings) {
  if (!autoOptEnabled() || autoOptLevel(settings) < 1) return settings;
  return Object.assign({}, settings, { perf: true, filter: "pixel" });
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

/* Sobe de nível (1 ou 2), aplica e avisa. */
function autoOptStep(jump) {
  const cap = autoOptCap();
  AutoOpt.level = Math.min(cap, autoOptLevel() + (jump || 1));
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
    autoOptStep(severe ? 2 : 1);
  } else if (!AutoOpt.warnedMax) {
    AutoOpt.warnedMax = true;
    toast(
      SYS === "ps1"
          ? "Já estou no modo mais leve. Se continuar lento, tente selecionar uma BIOS."
          : "Já estou no modo mais leve. Feche outras abas e apps.",
      5500,
    );
  }
}
