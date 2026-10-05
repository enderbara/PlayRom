"use strict";

/*
 * Otimização de desempenho do emulador
 * ------------------------------------
 * Existem 4 níveis de otimização. Cada nível inclui os anteriores:
 *
 *   0  Nenhuma: usa exatamente as configurações escolhidas pelo jogador
 *   1  Leve:    desliga efeitos de imagem (nitidez, scanlines, vinheta, cores) e usa filtro nítido
 *   2  Médio:   liga o pulo de quadros automático do núcleo do PS1
 *   3  Máximo:  pulo de quadros fixo + atalhos de velocidade do núcleo
 *              (podem causar pequenos defeitos em poucos jogos)
 *
 * O nível usado é o MAIOR entre:
 *   - o "nível mínimo" escolhido em Configurações › Vídeo (manual)
 *   - o nível que a otimização automática alcançou (ela sobe sozinha quando o jogo trava)
 *
 * A otimização automática vigia o FPS. Se o jogo ficar lento, ela sobe UM nível, avisa na tela
 * e volta a medir. O nível alcançado fica salvo por jogo, então da próxima vez o jogo já abre
 * otimizado. No multiplayer, o anfitrião primeiro reduz a qualidade do vídeo enviado (veja
 * netopt.js) e só depois mexe no emulador.
 */

const AutoOpt = {
  MAX: 3,
  STORE_KEY: "autoOptLevels",
  LAG_RATIO: 0.75, // abaixo de 75% do FPS esperado conta como travando
  LAG_SECONDS: 3, // segundos seguidos de lentidão antes de agir
  GRACE_SECONDS: 6, // tolerância depois que o jogo começa
  COOLDOWN_SECONDS: 6, // espera depois de cada ajuste antes de medir de novo

  level: 0, // nível alcançado automaticamente
  game: "",
  lagSeconds: 0,
  wait: 0,
  warnedMax: false,
};

/* Opções do núcleo PS1 (PCSX-ReARMed) aplicadas em cada nível. */
const AUTO_OPT_CORE = {
  1: {},
  2: {
    pcsx_rearmed_frameskip_type: "auto",
  },
  3: {
    pcsx_rearmed_frameskip_type: "fixed_interval",
    pcsx_rearmed_frameskip_interval: "1",
    pcsx_rearmed_nostalls: "enabled",
    pcsx_rearmed_nosmccheck: "enabled",
    pcsx_rearmed_nogteflags: "enabled",
    pcsx_rearmed_gteregsunneeded: "enabled",
  },
};

const AUTO_OPT_NAMES = { 1: "leve", 2: "média", 3: "máxima" };

const AUTO_OPT_MESSAGES = {
  1: "Jogo travando: desliguei os efeitos visuais (otimização leve).",
  2: "Ainda lento: ativei o pulo de quadros automático (otimização média).",
  3: "Ainda lento: otimização máxima ativada. Alguns jogos podem ter pequenos defeitos. Feche outras abas e apps para ajudar.",
};

function autoOptEnabled() {
  return S.autoOpt !== false && SYS === "ps1";
}

function autoOptMin(settings) {
  const n = Number((settings || S).optMin) || 0;
  return Math.max(0, Math.min(AutoOpt.MAX, n));
}

/* Nível realmente em uso agora. */
function autoOptLevel(settings) {
  return Math.max(AutoOpt.level, autoOptMin(settings));
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
  if (saved) AutoOpt.level = Math.min(AutoOpt.MAX, saved);
  else if (autoOptWeakDevice()) AutoOpt.level = 1;
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
  if (autoOptLevel(settings) < 1) return settings;
  return Object.assign({}, settings, { perf: true, filter: "pixel" });
}

/* Aplica no núcleo as opções do nível atual (e dos anteriores). */
function autoOptApplyCore() {
  const emu = window.EJS_emulator;
  if (SYS !== "ps1") return;
  if (!emu || typeof emu.changeSettingOption !== "function") return;
  const level = autoOptLevel();
  for (let n = 1; n <= level; n++) {
    const opts = AUTO_OPT_CORE[n] || {};
    for (const key of Object.keys(opts)) {
      try {
        emu.changeSettingOption(key, opts[key]);
      } catch (err) {
        console.warn("otimização: não consegui mudar " + key, err);
      }
    }
  }
}

/* Sobe um nível, aplica e avisa. */
function autoOptStep() {
  AutoOpt.level = Math.min(AutoOpt.MAX, autoOptLevel() + 1);
  AutoOpt.lagSeconds = 0;
  AutoOpt.wait = AutoOpt.COOLDOWN_SECONDS;
  autoOptSave();
  applyAll(S);
  autoOptApplyCore();
  toast(AUTO_OPT_MESSAGES[AutoOpt.level], 4500);
}

function autoOptCanMeasure() {
  return (
    playReady &&
    !paused &&
    !autoPaused &&
    !gsOpen &&
    !svOpen &&
    !rsOpen &&
    !document.hidden &&
    !padEdit
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

  AutoOpt.lagSeconds += 1;
  if (AutoOpt.lagSeconds < AutoOpt.LAG_SECONDS) return;

  // Anfitrião no multiplayer: o vídeo enviado também gasta CPU. Reduz ele antes do emulador.
  if (typeof netoptShedLoad === "function" && netoptShedLoad("cpu")) {
    AutoOpt.lagSeconds = 0;
    AutoOpt.wait = AutoOpt.COOLDOWN_SECONDS;
    return;
  }

  if (autoOptLevel() < AutoOpt.MAX) {
    autoOptStep();
  } else if (!AutoOpt.warnedMax) {
    AutoOpt.warnedMax = true;
    toast("Já estou no modo mais leve. Se continuar lento, tente selecionar uma BIOS.", 5000);
  }
}