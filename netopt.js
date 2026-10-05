"use strict";

/*
 * Otimização de rede do multiplayer
 * ---------------------------------
 * No PlayRom.io o anfitrião roda o jogo e envia o VÍDEO para o convidado (WebRTC).
 * Antes, o vídeo saía sempre travado em 6 Mbps / 60 FPS: ótimo no Wi-Fi, péssimo em 3G/4G/5G,
 * que perdem pacotes e deixam a imagem congelando.
 *
 * Agora:
 *   ANFITRIÃO  começa num bitrate adequado ao tipo de conexão (navigator.connection) e, a cada
 *              segundo, lê as estatísticas do WebRTC (perda de pacotes, latência, banda estimada):
 *                - rede piorou  -> baixa o bitrate rápido (e, se precisar, FPS e resolução)
 *                - rede estável -> sobe devagar, até o teto da conexão
 *              Se o CPU do anfitrião estiver sofrendo, o optimizer.js pede para aliviar o vídeo
 *              (netoptShedLoad) antes de piorar o emulador.
 *   CONVIDADO  ajusta sozinho o "colchão" do vídeo (jitter buffer): 0 ms em rede boa, mais em
 *              rede com oscilação (celular), para o vídeo não ficar picotando.
 */

const NetOpt = {
  senders: [], // um por conexão do anfitrião
  timer: 0,
  guest: [], // receptores do convidado
  gTimer: 0,
  lastToast: 0,
  hud: "", // texto de rede mostrado ao lado do FPS
  rtt: 0, // latência medida pelo canal de entrada (ms)
  hwH264: true, // celular anfitrião: prefere H264 (codificador por hardware, poupa CPU)
};

/* Teto de qualidade segundo o tipo de conexão informado pelo navegador. */
function netoptProfile() {
  const c = navigator.connection || {};
  const t = c.effectiveType || "";
  const dl = Number(c.downlink) || 0; // Mbps estimados
  let max = 2.5e6,
    fps = 60,
    jit = 0;
  if (t === "slow-2g" || t === "2g") {
    max = 150e3;
    fps = 20;
    jit = 120;
  } else if (t === "3g") {
    max = 450e3;
    fps = 30;
    jit = 90;
  } else if (t === "4g") {
    max = dl && dl < 5 ? 1.2e6 : dl >= 15 ? 3e6 : 2e6;
  }
  if (c.type === "cellular") {
    max = Math.min(max, 2e6);
    jit = Math.max(jit, 40);
  }
  if (c.saveData) {
    max = Math.min(max, 800e3);
    fps = Math.min(fps, 30);
  }
  return { max, fps, jit };
}

/* FPS do vídeo enviado: celular muito fraco como anfitrião transmite a 30 FPS (metade do custo de codificar). */
function netoptFps() {
  let f = netoptProfile().fps;
  try {
    if (typeof autoOptDeviceTier === "function" && autoOptDeviceTier() >= 2) f = Math.min(f, 30);
  } catch {}
  return f;
}

/* O canvas do emulador às vezes tem resolução enorme (do tamanho da tela). Codificar isso em tempo real
   derruba o celular do anfitrião: limita o vídeo enviado a ~480p, que é mais que suficiente para PS1. */
function netoptBaseScale() {
  try {
    const cv = document.querySelector("#ejs-box canvas");
    if (cv && cv.width && cv.height) return Math.max(1, cv.height / 480, cv.width / 854);
  } catch {}
  return 1;
}

/* Ordem de preferência dos codecs: no PC, VP8 > H264. No celular anfitrião, H264 (hardware) > VP8:
   o codificador por hardware gasta bem menos CPU e deixa o emulador mais folgado. */
function netoptCodecs(pc, sd) {
  try {
    const tr = pc.getTransceivers().find((x) => x.sender === sd);
    const caps = RTCRtpSender.getCapabilities("video");
    if (tr && tr.setCodecPreferences && caps) {
      const mob = NetOpt.hwH264 && typeof isMobDev === "function" && isMobDev();
      const pr = (c) => {
        const m = c.mimeType;
        if (/h264/i.test(m))
          return (mob ? 0 : 1) + (/profile-level-id=42/i.test(c.sdpFmtpLine || "") ? 0 : 0.5);
        if (/vp8/i.test(m)) return mob ? 1 : 0;
        return /vp9|av1/i.test(m) ? 3 : 2;
      };
      tr.setCodecPreferences([...caps.codecs].sort((a, b) => pr(a) - pr(b)));
    }
  } catch {}
}

/* Registra o vídeo do anfitrião para ser vigiado e ajustado. */
function netoptTune(pc, sd, t) {
  if (t.kind === "audio") {
    /* áudio do jogo não precisa de mais que 64 kbps: sobra banda para o vídeo */
    const cap = async () => {
      try {
        const q = sd.getParameters();
        if (!q.encodings || !q.encodings.length) q.encodings = [{}];
        q.encodings[0].maxBitrate = 64e3;
        await sd.setParameters(q);
      } catch {}
    };
    cap();
    setTimeout(cap, 1500);
    setTimeout(cap, 5000);
    return;
  }
  if (t.kind !== "video") return;
  try {
    t.contentHint = "motion";
  } catch {}
  netoptCodecs(pc, sd);
  const pf = netoptProfile();
  pf.fps = netoptFps();
  const s = {
    pc,
    sd,
    max: pf.max, // teto da conexão
    fpsMax: pf.fps,
    br: Math.min(pf.max, 1.5e6), // bitrate atual (começa moderado e sobe se a rede ajudar)
    fps: pf.fps,
    scale: 1,
    good: 0,
    shed: 0, // quantas vezes o CPU pediu alívio
    applied: "",
    lastBytes: 0,
    lastTs: 0,
    rec: 0, // alvo de recuperação rápida depois de uma queda
  };
  NetOpt.senders.push(s);
  netoptApply(s, true);
  setTimeout(() => netoptApply(s, true), 1500);
  setTimeout(() => netoptApply(s, true), 5000);
  if (!NetOpt.timer) NetOpt.timer = setInterval(netoptTick, 1000);
}

/* Converte o bitrate em FPS/escala e manda para o codificador. */
async function netoptApply(s, force) {
  let fps = s.fpsMax,
    scale = 1;
  if (s.br < 250e3) {
    fps = Math.min(fps, 20);
    scale = 2;
  } else if (s.br < 500e3) {
    fps = Math.min(fps, 30);
    scale = 1.5;
  } else if (s.br < 900e3) {
    fps = Math.min(fps, 30);
  }
  if (s.shed >= 1) fps = Math.min(fps, 30);
  if (s.shed >= 2) {
    fps = Math.min(fps, 20);
    scale = Math.max(scale, 1.5);
  }
  scale = Math.round(scale * netoptBaseScale() * 100) / 100;
  s.fps = fps;
  s.scale = scale;
  const br = Math.round(s.br / 5e3) * 5e3;
  const key = br + "|" + fps + "|" + scale;
  if (!force && key === s.applied) return;
  try {
    const q = s.sd.getParameters();
    if (!q.encodings || !q.encodings.length) q.encodings = [{}];
    const e = q.encodings[0];
    e.maxBitrate = br;
    e.maxFramerate = fps;
    e.scaleResolutionDownBy = scale;
    e.priority = "high";
    e.networkPriority = "high";
    q.degradationPreference = "maintain-framerate";
    await s.sd.setParameters(q);
    s.applied = key;
  } catch {}
}

function netoptNotify(msg) {
  const now = Date.now();
  if (now - NetOpt.lastToast < 20000) return;
  NetOpt.lastToast = now;
  try {
    toast(msg, 3500);
  } catch {}
}

/* Lê as estatísticas e decide se sobe ou desce a qualidade (uma vez por segundo). */
async function netoptTick() {
  NetOpt.senders = NetOpt.senders.filter(
    (s) => s.pc.connectionState !== "closed" && s.pc.connectionState !== "failed",
  );
  if (!NetOpt.senders.length) {
    clearInterval(NetOpt.timer);
    NetOpt.timer = 0;
    return;
  }
  for (const s of NetOpt.senders) {
    let st;
    try {
      st = await s.pc.getStats();
    } catch {
      continue;
    }
    let loss = 0,
      rtt = 0,
      avail = 0,
      limit = "none",
      bytes = 0;
    st.forEach((r) => {
      if (r.type === "remote-inbound-rtp" && r.kind === "video") {
        loss = Math.max(loss, r.fractionLost || 0);
        rtt = Math.max(rtt, (r.roundTripTime || 0) * 1000);
      } else if (r.type === "outbound-rtp" && r.kind === "video") {
        limit = r.qualityLimitationReason || "none";
        bytes = r.bytesSent || 0;
      } else if (r.type === "candidate-pair" && (r.selected || r.nominated) && r.state === "succeeded") {
        avail = r.availableOutgoingBitrate || avail;
        if (!rtt) rtt = (r.currentRoundTripTime || 0) * 1000;
      }
    });

    const congested = loss > 0.04 || rtt > 400;
    const before = s.br;
    if (congested) {
      s.good = 0;
      s.rec = before * 0.85;
      s.br = Math.max(120e3, s.br * (loss > 0.12 || rtt > 800 ? 0.55 : 0.78));
    } else if (loss < 0.015 && rtt < 250) {
      s.good++;
      // Depois de uma queda, volta rápido até ~85% do que funcionava; acima disso sobe devagar.
      const fast = s.br < s.rec;
      if (s.good >= (fast ? 2 : 4) && limit !== "cpu") {
        s.br = Math.min(s.max, s.br * (fast ? 1.2 : 1.12) + 20e3);
        s.good = fast ? 0 : 2;
      }
    } else {
      s.good = 0;
    }
    // O navegador também estima a banda disponível: nunca passa de ~85% dela.
    if (avail > 0) s.br = Math.min(s.br, Math.max(120e3, avail * 0.85));
    s.br = Math.min(s.br, s.max);

    if (limit === "cpu" && s.shed < 2) netoptShedLoad("cpu");

    NetOpt.hud =
      (s.br / 1e6).toFixed(1) +
      " Mbps · " +
      Math.round(rtt || NetOpt.rtt) +
      " ms" +
      (loss > 0.01 ? " · " + Math.round(loss * 100) + "% perda" : "");

    if (s.br < before * 0.9 && s.br < 600e3)
      netoptNotify("Conexão fraca: baixei a qualidade do vídeo para o jogo continuar fluido.");
    netoptApply(s, false);
  }
}

/*
 * Chamado pelo optimizer.js quando o jogo trava no anfitrião: o vídeo enviado também gasta CPU.
 * Devolve true se conseguiu aliviar (e então o optimizer espera antes de mexer no emulador).
 */
function netoptShedLoad(reason) {
  if (typeof mp === "undefined" || mp.role !== "host" || !NetOpt.senders.length) return false;
  let did = false;
  for (const s of NetOpt.senders) {
    if (s.shed < 2) {
      s.shed++;
      s.br = Math.min(s.br, s.shed === 1 ? 1.2e6 : 600e3);
      netoptApply(s, true);
      did = true;
    }
  }
  if (did) netoptNotify("Aliviei o vídeo enviado para o jogo rodar mais leve.");
  return did;
}

/* CONVIDADO: ajusta o colchão do vídeo conforme a oscilação da rede. */
function netoptGuest(e, pc) {
  const isAudio = e.track.kind === "audio";
  const base = netoptProfile().jit;
  const g = {
    rc: e.receiver,
    pc,
    audio: isAudio,
    base,
    target: isAudio ? Math.max(60, base) : base,
    calm: 0,
    lastLost: 0,
    lastRecv: 0,
  };
  netoptSetBuffer(g);
  NetOpt.guest.push(g);
  if (!NetOpt.gTimer) NetOpt.gTimer = setInterval(netoptGuestTick, 2000);
}

function netoptSetBuffer(g) {
  try {
    g.rc.jitterBufferTarget = g.target;
  } catch {}
  try {
    g.rc.playoutDelayHint = g.target / 1000;
  } catch {}
}

async function netoptGuestTick() {
  NetOpt.guest = NetOpt.guest.filter(
    (g) => g.pc.connectionState !== "closed" && g.pc.connectionState !== "failed",
  );
  if (!NetOpt.guest.length) {
    clearInterval(NetOpt.gTimer);
    NetOpt.gTimer = 0;
    return;
  }
  for (const g of NetOpt.guest) {
    let st;
    try {
      st = await g.rc.getStats();
    } catch {
      continue;
    }
    let jitter = 0,
      lost = 0,
      recv = 0;
    st.forEach((r) => {
      if (r.type === "inbound-rtp") {
        jitter = Math.max(jitter, (r.jitter || 0) * 1000);
        lost = r.packetsLost || 0;
        recv = r.packetsReceived || 0;
      }
    });
    const dl = lost - g.lastLost,
      dr = recv - g.lastRecv;
    g.lastLost = lost;
    g.lastRecv = recv;
    const rate = dl > 0 && dl + dr > 0 ? dl / (dl + dr) : 0;
    if (!g.audio) {
      let rt = NetOpt.rtt;
      if (!rt) {
        try {
          (await g.pc.getStats()).forEach((r) => {
            if (r.type === "candidate-pair" && (r.selected || r.nominated) && r.state === "succeeded")
              rt = (r.currentRoundTripTime || 0) * 1000;
          });
        } catch {}
      }
      NetOpt.hud =
        "ping " +
        Math.round(rt) +
        " ms · jitter " +
        Math.round(jitter) +
        " ms" +
        (rate > 0.01 ? " · " + Math.round(rate * 100) + "% perda" : "");
    }
    const maxT = g.audio ? 250 : 200;
    if (jitter > 30 || rate > 0.02) {
      g.calm = 0;
      g.target = Math.min(maxT, g.target + 30);
    } else if (jitter < 12 && rate === 0) {
      if (++g.calm >= 5) {
        g.calm = 3;
        g.target = Math.max(g.base, g.audio ? 60 : 0, g.target - 10);
      }
    } else g.calm = 0;
    netoptSetBuffer(g);
  }
}

/* Limpa tudo quando a partida termina. */
function netoptStop() {
  NetOpt.senders = [];
  NetOpt.guest = [];
  clearInterval(NetOpt.timer);
  clearInterval(NetOpt.gTimer);
  NetOpt.timer = NetOpt.gTimer = 0;
  NetOpt.hud = "";
  NetOpt.rtt = 0;
}
