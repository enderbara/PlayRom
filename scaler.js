"use strict";

/*
 * Ampliador "HD" (bilinear nítido)
 * --------------------------------
 * Ampliar o jogo direto com filtro suave deixa jogos de baixa resolução borrados, e o filtro
 * pixelado deixa os pixels aparecendo. Aqui fazemos em 2 passos:
 *   1. amplia a imagem por um número INTEIRO de vezes, sem suavizar (bordas firmes)
 *   2. reduz esse resultado até o tamanho real da tela, com suavização
 * O resultado fica nítido em qualquer resolução do jogo, sem borrar e sem blocos.
 *
 * O canvas original continua rodando (escondido); desenhamos num canvas "#hd-canvas".
 * Se não der para copiar a imagem (navegador/núcleo), volta sozinho para o filtro normal.
 */

const HDS = {
  cv: null,
  tmp: null,
  raf: 0,
  frames: 0,
  seen: false, // já vimos imagem não preta?
  broken: false,
  src: null,
};

function hdsOk(settings) {
  const s = settings || (typeof cur !== "undefined" ? cur : null);
  return !!(s && s.filter === "hd" && !s.perf && !HDS.broken && HDS.cv && HDS.cv.isConnected);
}

function hdsWanted(s) {
  return !!(s && s.filter === "hd" && !s.perf && !HDS.broken);
}

function hdsStop() {
  if (HDS.raf) {
    (typeof rawCAF === "function" ? rawCAF : cancelAnimationFrame)(HDS.raf);
    HDS.raf = 0;
  }
  const box = document.getElementById("ejs-box");
  if (box) box.dataset.hd = "0";
  if (HDS.cv) HDS.cv.remove();
  HDS.cv = null;
  HDS.src = null;
  HDS.frames = 0;
  HDS.seen = false;
}

/* Chamado pelo applyAll sempre que as configurações de vídeo mudam. */
function hdsSync(settings) {
  if (!hdsWanted(settings)) {
    hdsStop();
    return;
  }
  if (HDS.raf) return;
  HDS.frames = 0;
  HDS.seen = false;
  HDS.raf = (typeof rawRAF === "function" ? rawRAF : requestAnimationFrame)(hdsDraw);
}

function hdsSource() {
  if (HDS.src && HDS.src.isConnected) return HDS.src;
  HDS.src = document.querySelector("#ejs-host canvas");
  return HDS.src;
}

function hdsFallback() {
  HDS.broken = true;
  hdsStop();
  if (typeof applyAll === "function" && typeof S !== "undefined") applyAll(S);
}

function hdsDraw() {
  HDS.raf = 0;
  const player = document.getElementById("player");
  if (!player || !player.classList.contains("show") || !hdsWanted(typeof cur !== "undefined" ? cur : null)) {
    hdsStop();
    return;
  }
  HDS.raf = (typeof rawRAF === "function" ? rawRAF : requestAnimationFrame)(hdsDraw);
  if (document.hidden) return;

  const box = document.getElementById("ejs-box"),
    src = hdsSource();
  if (!box || !src || !src.width || !src.height) return;

  if (!HDS.cv) {
    HDS.cv = document.createElement("canvas");
    HDS.cv.id = "hd-canvas";
    HDS.tmp = document.createElement("canvas");
    box.appendChild(HDS.cv); // depois do #ejs-host: o canvas original continua sendo o primeiro
  }
  const cv = HDS.cv,
    dpr = Math.min(window.devicePixelRatio || 1, 2),
    dw = Math.max(1, Math.round(cv.clientWidth * dpr)),
    dh = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (dw < 4 || dh < 4) return;
  if (cv.width !== dw || cv.height !== dh) {
    cv.width = dw;
    cv.height = dh;
  }

  const sw = src.width,
    sh = src.height,
    k = Math.max(1, Math.min(8, Math.ceil(dw / sw))),
    tmp = HDS.tmp;
  if (tmp.width !== sw * k || tmp.height !== sh * k) {
    tmp.width = sw * k;
    tmp.height = sh * k;
  }
  try {
    const t = tmp.getContext("2d");
    t.imageSmoothingEnabled = false;
    t.drawImage(src, 0, 0, sw * k, sh * k);
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(tmp, 0, 0, dw, dh);
  } catch (err) {
    console.warn("ampliador HD indisponível", err);
    hdsFallback();
    return;
  }

  // Confere se realmente está saindo imagem; se ficar tudo preto por ~5s, desiste do ampliador.
  HDS.frames++;
  if (!HDS.seen && HDS.frames % 20 === 0) {
    try {
      const c = cv.getContext("2d"),
        pts = [0.2, 0.4, 0.5, 0.6, 0.8];
      for (const fx of pts) {
        for (const fy of pts) {
          const d = c.getImageData(Math.floor(dw * fx), Math.floor(dh * fy), 1, 1).data;
          if (d[0] + d[1] + d[2] > 12) {
            HDS.seen = true;
            break;
          }
        }
        if (HDS.seen) break;
      }
    } catch {
      hdsFallback();
      return;
    }
    if (HDS.seen) box.dataset.hd = "1";
    else if (HDS.frames >= 300) {
      hdsFallback();
      return;
    }
  }
  if (HDS.seen) box.dataset.hd = "1";
}