"use strict";
const mp = {
  ws: null,
  conn: null,
  id: null,
  on: false,
  role: null,
  room: null,
  slot: 0,
  hostId: null,
  peers: {},
  maps: {},
  rooms: [],
  searching: false,
  pend: null,
  started: false,
  pings: {},
  video: null,
  stream: null,
  vOk: false,
  vt: 0,
  busy: false,
};
let mpCap = null,
  mplMode = "",
  mplT = 0,
  mpTap = null;
const mplEl = $("#mpl"),
  mpcEl = $("#mpc"),
  shEl = $("#mpsh");
const MP_ACT = [
  ["UP", "Cima"],
  ["DOWN", "Baixo"],
  ["LEFT", "Esquerda"],
  ["RIGHT", "Direita"],
  ["A", "Botão ○ (A)"],
  ["B", "Botão ✕ (B)"],
  ["X", "Botão △ (X)"],
  ["Y", "Botão □ (Y)"],
  ["L", "Botão L1"],
  ["R", "Botão R1"],
  ["L2", "Botão L2"],
  ["R2", "Botão R2"],
  ["START", "Start"],
  ["SELECT", "Select"],
];
/* consoles aceitos nas salas e na contagem de pessoas online */
const MP_SYS = ["ps1", "psp", "md", "atari"];
const mpUiOpen = () =>
  !mplEl.classList.contains("hidden") ||
  !mpcEl.classList.contains("hidden") ||
  !shEl.classList.contains("hidden");
const MP_PORT = 3000;
const MP_SERVERS = ["wss://playrom.onrender.com"];
const MP_SITE = "https://playrom.onrender.com";
{
  const q = new URLSearchParams(location.search).get("sala");
  window.__plPend = q && /^[a-f0-9]{8}$/i.test(q) ? q.toLowerCase() : null;
}
// Brokers MQTT públicos usados só para achar salas e trocar a sinalização WebRTC.
// Todos são tentados ao mesmo tempo; basta um responder.
const MQ_BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
  "wss://mqtt.eclipseprojects.io:443/mqtt",
];
function mpMq(brokers, ms) {
  brokers = brokers || MQ_BROKERS;
  ms = ms || 8000;
  return new Promise((resolve) => {
    const hex = (n) =>
      [...crypto.getRandomValues(new Uint8Array(n))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const me = hex(4),
      NS = "playrom1",
      enc = new TextEncoder(),
      dec = new TextDecoder();
    const links = [],
      seen = new Set(),
      rooms = new Map(),
      pres = new Map();
    let myRoom = null,
      guestOf = null,
      annT = 0,
      pruneT = 0,
      pend = {},
      closed = false,
      ready = false,
      presOn = false,
      mySys = "",
      fake = null;
    const rl = (n) => {
      const a = [];
      do {
        let d = n % 128;
        n = Math.floor(n / 128);
        if (n > 0) d |= 128;
        a.push(d);
      } while (n > 0);
      return a;
    };
    const S = (s) => {
      const b = enc.encode(s),
        o = new Uint8Array(2 + b.length);
      o[0] = b.length >> 8;
      o[1] = b.length & 255;
      o.set(b, 2);
      return o;
    };
    const pkt = (h, parts) => {
      let n = 0;
      parts.forEach((p) => (n += p.length));
      const r = rl(n),
        o = new Uint8Array(1 + r.length + n);
      o[0] = h;
      o.set(r, 1);
      let k = 1 + r.length;
      parts.forEach((p) => {
        o.set(p, k);
        k += p.length;
      });
      return o;
    };
    const emit = (m) =>
      setTimeout(() => {
        fake && fake.onmessage && fake.onmessage({ data: JSON.stringify(m) });
      }, 0);
    const pubRoom = (r) => ({
      id: r.id,
      name: r.name,
      game: r.game,
      sys: r.sys,
      max: r.max,
      count: r.members.length,
    });
    function out(topic, obj) {
      obj.u = hex(5);
      const body = enc.encode(JSON.stringify(obj)),
        p = pkt(0x30, [S(topic), body]);
      links.forEach((l) => {
        if (l.ok) {
          try {
            l.ws.send(p);
          } catch {}
        }
      });
    }
    const to = (id, o) => out(NS + "/u/" + id, o);
    const announce = () => {
      if (myRoom && !myRoom.locked) out(NS + "/lobby", { k: "room", room: pubRoom(myRoom) });
    };
    const emitRooms = () => {
      const now = Date.now(),
        l = [];
      rooms.forEach((v, k) => {
        if (now - v.t > 9000) rooms.delete(k);
        else l.push(v.room);
      });
      emit({ t: "rooms", rooms: l });
    };
    const emitOnline = () => {
      const now = Date.now(),
        c = {};
      MP_SYS.forEach((k) => (c[k] = 0));
      pres.forEach((v, k) => {
        if (now - v.t > 10000) pres.delete(k);
        else if (c[v.sys] !== undefined) c[v.sys]++;
      });
      emit({ t: "online", counts: c });
    };
    const presOut = () => {
      pres.set(me, { sys: mySys, t: Date.now() });
      out(NS + "/pres", { k: "pres", id: me, sys: mySys });
    };
    function onPub(topic, txt) {
      let m;
      try {
        m = JSON.parse(txt);
      } catch {
        return;
      }
      if (!m || !m.u || seen.has(m.u)) return;
      seen.add(m.u);
      if (seen.size > 600) seen.delete(seen.values().next().value);
      if (topic.endsWith("/pres")) {
        if (m.k === "pres" && m.id) {
          pres.set(m.id, { sys: String(m.sys || ""), t: Date.now() });
          emitOnline();
        }
        return;
      }
      if (topic.endsWith("/lobby")) {
        if (m.k === "room" && m.room && m.room.id && m.room.id !== me) {
          rooms.set(m.room.id, { room: m.room, t: Date.now() });
          emitRooms();
        } else if (m.k === "gone") {
          rooms.delete(m.id);
          emitRooms();
        }
        return;
      }
      switch (m.k) {
        case "join":
          if (!myRoom || myRoom.locked) {
            to(m.from, { k: "err", m: "Essa sala não está mais disponível." });
            break;
          }
          if (myRoom.members.some((x) => x.id === m.from)) {
            break;
          }
          if (myRoom.members.length >= myRoom.max) {
            to(m.from, { k: "err", m: "A sala está cheia." });
            break;
          }
          {
            let slot = 1;
            while (myRoom.members.some((x) => x.slot === slot)) slot++;
            myRoom.members.push({ id: m.from, slot });
            to(m.from, { k: "joined", room: pubRoom(myRoom), slot, host: me });
            emit({ t: "peer", id: m.from, slot });
            announce();
          }
          break;
        case "joined":
          clearTimeout(pend.j);
          guestOf = m.host;
          emit({ t: "joined", room: m.room, slot: m.slot, host: m.host });
          break;
        case "err":
          clearTimeout(pend.j);
          emit({ t: "err", m: m.m });
          break;
        case "sig":
          emit({ t: "sig", from: m.from, d: m.d });
          break;
        case "leave":
          if (myRoom) {
            const x = myRoom.members.find((y) => y.id === m.from);
            myRoom.members = myRoom.members.filter((y) => y.id !== m.from);
            if (x) {
              emit({ t: "gone", id: m.from, slot: x.slot });
              announce();
            }
          }
          break;
        case "closed":
          if (guestOf === m.from || guestOf) {
            guestOf = null;
            emit({ t: "closed" });
          }
          break;
        case "info":
          to(m.from, {
            k: "infor",
            room: myRoom && !myRoom.locked ? pubRoom(myRoom) : null,
            locked: !!(myRoom && myRoom.locked),
          });
          break;
        case "infor":
          clearTimeout(pend.r);
          emit({ t: "room", room: m.room, locked: !!m.locked });
          break;
      }
    }
    const clean = (s, n) =>
      String(s == null ? "" : s)
        .replace(/[\u0000-\u001f\u007f<>]/g, "")
        .trim()
        .slice(0, n);
    function leave() {
      if (myRoom) {
        myRoom.members.forEach((x) => {
          if (x.id !== me) to(x.id, { k: "closed", from: me });
        });
        out(NS + "/lobby", { k: "gone", id: me });
        clearInterval(annT);
        myRoom = null;
      } else if (guestOf) {
        to(guestOf, { k: "leave", from: me });
        guestOf = null;
      }
    }
    fake = {
      readyState: 1,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(str) {
        let m;
        try {
          m = JSON.parse(str);
        } catch {
          return;
        }
        if (!m || typeof m.t !== "string") return;
        switch (m.t) {
          case "list":
            emitRooms();
            break;
          case "pres":
            mySys = MP_SYS.includes(m.sys) ? m.sys : "";
            presOn = true;
            presOut();
            emitOnline();
            break;
          case "create": {
            if (myRoom || guestOf) {
              emit({ t: "err", m: "Você já está em uma sala." });
              break;
            }
            const name = clean(m.name, 20),
              game = clean(m.game, 120),
              max = Math.round(+m.max);
            if (!name) {
              emit({ t: "err", m: "Dê um nome para a sala." });
              break;
            }
            if (!game) {
              emit({ t: "err", m: "Escolha um jogo." });
              break;
            }
            if (max !== 2) {
              emit({ t: "err", m: "A sala aceita 2 jogadores." });
              break;
            }
            myRoom = { id: me, name, game, max, locked: false, sys: MP_SYS.includes(m.sys) ? m.sys : "ps1", members: [{ id: me, slot: 0 }] };
            emit({ t: "created", room: pubRoom(myRoom) });
            announce();
            clearInterval(annT);
            annT = setInterval(announce, 2500);
            break;
          }
          case "join":
            if (myRoom || guestOf) {
              emit({ t: "err", m: "Você já está em uma sala." });
              break;
            }
            clearTimeout(pend.j);
            pend.j = setTimeout(
              () => emit({ t: "err", m: "Essa sala não está mais disponível." }),
              7000,
            );
            to(String(m.id), { k: "join", from: me });
            break;
          case "room":
            clearTimeout(pend.r);
            pend.r = setTimeout(() => emit({ t: "room", room: null, locked: false }), 5000);
            to(String(m.id), { k: "info", from: me });
            break;
          case "sig":
            to(String(m.to), { k: "sig", from: me, d: m.d });
            break;
          case "lock":
            if (myRoom) {
              myRoom.locked = true;
              out(NS + "/lobby", { k: "gone", id: me });
            }
            break;
          case "leave":
            leave();
            break;
        }
      },
      close() {
        if (closed) return;
        closed = true;
        leave();
        clearInterval(annT);
        clearInterval(pruneT);
        links.forEach((l) => {
          try {
            l.ws.close();
          } catch {}
        });
        fake.readyState = 3;
        fake.onclose && fake.onclose();
      },
    };
    function link(url, i) {
      const l = { ok: false, ws: null };
      links.push(l);
      let ws;
      try {
        ws = new WebSocket(url, "mqtt");
      } catch {
        return;
      }
      ws.binaryType = "arraybuffer";
      l.ws = ws;
      let buf = new Uint8Array(0),
        ping = 0;
      ws.onopen = () =>
        ws.send(pkt(0x10, [S("MQTT"), Uint8Array.of(4, 2, 0, 30), S("ph-" + me + "-" + i)]));
      ws.onmessage = (e) => {
        const d = new Uint8Array(e.data),
          nb = new Uint8Array(buf.length + d.length);
        nb.set(buf);
        nb.set(d, buf.length);
        buf = nb;
        for (;;) {
          if (buf.length < 2) break;
          let k = 1,
            mul = 1,
            len = 0,
            b,
            ok = false;
          while (k < buf.length && k < 5) {
            b = buf[k++];
            len += (b & 127) * mul;
            mul *= 128;
            if (!(b & 128)) {
              ok = true;
              break;
            }
          }
          if (!ok || buf.length < k + len) break;
          const h = buf[0],
            type = h >> 4,
            body = buf.subarray(k, k + len);
          buf = buf.slice(k + len);
          if (type === 2 && body[1] === 0) {
            l.ok = true;
            ws.send(pkt(0x82, [Uint8Array.of(0, 1), S(NS + "/lobby"), Uint8Array.of(0)]));
            ws.send(pkt(0x82, [Uint8Array.of(0, 2), S(NS + "/u/" + me), Uint8Array.of(0)]));
            ws.send(pkt(0x82, [Uint8Array.of(0, 3), S(NS + "/pres"), Uint8Array.of(0)]));
            ping = setInterval(() => {
              try {
                ws.send(Uint8Array.of(0xc0, 0));
              } catch {}
            }, 20000);
            if (!ready) {
              ready = true;
              pruneT = setInterval(() => {
                emitRooms();
                presOn && presOut();
                emitOnline();
              }, 3000);
              resolve({
                ws: fake,
                buf: [
                  { t: "hello", id: me, ips: [], port: 0, pub: "", ice: null },
                  { t: "rooms", rooms: [] },
                ],
                url: "mqtt",
              });
            }
          } else if (type === 3) {
            const tl = (body[0] << 8) | body[1],
              topic = dec.decode(body.subarray(2, 2 + tl)),
              qos = (h >> 1) & 3;
            onPub(topic, dec.decode(body.subarray(2 + tl + (qos ? 2 : 0))));
          }
        }
      };
      const dead = () => {
        l.ok = false;
        clearInterval(ping);
        if (ready && !closed && !links.some((x) => x.ok)) {
          closed = true;
          clearInterval(annT);
          clearInterval(pruneT);
          fake.readyState = 3;
          fake.onclose && fake.onclose();
        }
      };
      ws.onclose = dead;
      ws.onerror = () => {};
    }
    brokers.forEach(link);
    setTimeout(() => {
      if (!ready) {
        closed = true;
        links.forEach((l) => {
          try {
            l.ws && l.ws.close();
          } catch {}
        });
        resolve(null);
      }
    }, ms);
  });
}
mp.online = {};
/* diz aos outros em qual console estou (só conta quando estou DENTRO de um console) */
function mpPresence() {
  mpWs({ t: "pres", sys: typeof SYS !== "undefined" && SYS && ctx === "console" ? SYS : "" });
}
setInterval(mpPresence, 6000);
function mpWs(o) {
  try {
    mp.ws && mp.ws.readyState === 1 && mp.ws.send(JSON.stringify(o));
  } catch {}
}
function mpTry(url, ms) {
  return new Promise((res) => {
    let ws,
      done = false,
      tm = 0;
    const buf = [];
    const end = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(tm);
      if (!ok) {
        try {
          ws && ws.close();
        } catch {}
      }
      res(ok ? { ws, buf } : null);
    };
    tm = setTimeout(() => end(false), ms);
    try {
      ws = new WebSocket(url);
    } catch {
      end(false);
      return;
    }
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      buf.push(m);
      if (m && m.t === "hello") end(true);
    };
    ws.onerror = () => end(false);
    ws.onclose = () => end(false);
  });
}
function mpRace(list, ms, n) {
  return new Promise((res) => {
    let i = 0,
      run = 0,
      won = false;
    const next = () => {
      if (won) return;
      if (i >= list.length && run === 0) {
        res(null);
        return;
      }
      while (run < n && i < list.length) {
        const u = list[i++];
        run++;
        mpTry(u, ms).then((r) => {
          run--;
          if (r) {
            if (won) {
              try {
                r.ws.close();
              } catch {}
              return;
            }
            won = true;
            r.url = u;
            res(r);
            return;
          }
          next();
        });
      }
    };
    next();
  });
}
async function mpFind() {
  const direct = [];
  const add = (u) => {
    if (u && !direct.includes(u)) direct.push(u);
  };
  if (/^https?:$/.test(location.protocol))
    add((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
  add(cfg.get("mpManual", ""));
  MP_SERVERS.forEach(add);

  // Servidor próprio (se existir) e brokers públicos são tentados juntos; o primeiro que responder vence.
  const attempts = [];
  if (direct.length) attempts.push(mpRace(direct, 2500, direct.length));
  attempts.push(mpMq(null, 8000));

  const r = await new Promise((resolve) => {
    let pending = attempts.length;
    let done = false;
    attempts.forEach((p) =>
      p.then((x) => {
        pending--;
        if (x && !done) {
          done = true;
          resolve(x);
        } else if (x) {
          try {
            x.ws.close();
          } catch {}
        } else if (pending === 0 && !done) {
          resolve(null);
        }
      }),
    );
  });
  if (r) return r;
  throw new Error("Sem conexão com o servidor de salas.");
}

function mpConnect() {
  if (mp.ws && mp.ws.readyState === 1) return Promise.resolve();
  if (mp.conn) return mp.conn;
  mp.conn = mpFind().then(
    (r) => {
      const ws = r.ws;
      ws.onmessage = (e) => {
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        mpOnWs(m);
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (mp.ws === ws) {
          mp.ws = null;
          mpWsLost();
        }
      };
      mp.ws = ws;
      mp.srv = r.url;
      mp.conn = null;
      r.buf.forEach(mpOnWs);
    },
    (e) => {
      mp.conn = null;
      throw e;
    },
  );
  return mp.conn;
}
function mpWsLost() {
  mp.rooms = [];
  if (mp.on && !mp.started) mpFail("Conexão com o servidor perdida.");
  else mpRenderRooms();
  if (!mp.on)
    setTimeout(() => {
      if (!mp.ws && !mp.conn) mpConnect().catch(() => {});
    }, 2500);
}
setInterval(() => mpWs({ t: "ping" }), 25000);
mp.mask = 0;
mp.seq = 0;
function mpPeerSend(s, fast) {
  const p = mp.peers[mp.hostId];
  if (!p) return;
  try {
    const c = fast && p.fast && p.fast.readyState === "open" ? p.fast : p.dc;
    c && c.readyState === "open" && c.send(s);
  } catch {}
}
function mpIn(b, on) {
  const k = Object.keys(PAD).indexOf(b);
  if (k < 0) return;
  mp.mask = on ? mp.mask | (1 << k) : mp.mask & ~(1 << k);
  const s = JSON.stringify({ t: "ib", n: ++mp.seq, m: mp.mask });
  mpPeerSend(s, true);
  mpPeerSend(s, false);
  setTimeout(() => mpPeerSend(s, true), 25);
  setTimeout(() => mpPeerSend(s, true), 70);
}
setInterval(() => {
  if (mp.on && mp.role === "guest" && mp.mask)
    mpPeerSend(JSON.stringify({ t: "ib", n: mp.seq, m: mp.mask }), true);
}, 200);
function mpApplyMask(p, mask) {
  const ks = Object.keys(PAD),
    old = p.mask || 0;
  p.mask = mask;
  if (old === mask) return;
  const gm = window.EJS_emulator?.gameManager;
  ks.forEach((b, i) => {
    const a = (old >> i) & 1,
      c = (mask >> i) & 1;
    if (a !== c) {
      try {
        gm?.simulateInput(p.slot, PAD[b], c);
      } catch {}
    }
  });
}
function mpFast(p, ch) {
  p.fast = ch;
  ch.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m && typeof m.t === "string") mpOnData(p, m);
  };
}
function mpTune(pc, sd, t) {
  if (t.kind !== "video") return;
  try {
    t.contentHint = "motion";
  } catch {}
  try {
    const tr = pc.getTransceivers().find((x) => x.sender === sd),
      caps = RTCRtpSender.getCapabilities("video");
    if (tr && tr.setCodecPreferences && caps) {
      const pr = (c) =>
        /vp8/i.test(c.mimeType)
          ? 0
          : /h264/i.test(c.mimeType)
            ? 1
            : /vp9/i.test(c.mimeType)
              ? 3
              : 2;
      tr.setCodecPreferences([...caps.codecs].sort((a, b) => pr(a) - pr(b)));
    }
  } catch {}
  const tune = async () => {
    try {
      const q = sd.getParameters();
      if (!q.encodings || !q.encodings.length) q.encodings = [{}];
      const e = q.encodings[0];
      e.maxBitrate = 6e6;
      e.maxFramerate = 60;
      e.scaleResolutionDownBy = 1;
      e.priority = "high";
      e.networkPriority = "high";
      q.degradationPreference = "maintain-framerate";
      await sd.setParameters(q);
    } catch {}
  };
  tune();
  setTimeout(tune, 1500);
  setTimeout(tune, 5000);
}
function mpReq(o, ok, ms = 8000) {
  return new Promise((res, rej) => {
    const tm = setTimeout(() => {
      mp.pend = null;
      rej(new Error("O servidor não respondeu."));
    }, ms);
    mp.pend = { ok, res, rej, tm };
    mpWs(o);
  });
}
function mpOnWs(m) {
  const p = mp.pend;
  if (p) {
    if (m.t === p.ok) {
      clearTimeout(p.tm);
      mp.pend = null;
      p.res(m);
      return;
    }
    if (m.t === "err") {
      clearTimeout(p.tm);
      mp.pend = null;
      p.rej(new Error(m.m || "Erro no servidor."));
      return;
    }
  }
  switch (m.t) {
    case "hello":
      mp.id = m.id;
      mp.ips = Array.isArray(m.ips) ? m.ips : [];
      mp.pub = typeof m.pub === "string" ? m.pub : "";
      mp.port = m.port || MP_PORT;
      mp.ice = Array.isArray(m.ice) ? m.ice : null;
      mpPresence();
      break;
    case "online":
      mp.online = m.counts && typeof m.counts === "object" ? m.counts : {};
      typeof updateOnline === "function" && updateOnline();
      break;
    case "rooms":
      mp.rooms = Array.isArray(m.rooms) ? m.rooms : [];
      mp.searching = false;
      mpRenderRooms();
      break;
    case "peer":
      if (mp.role === "host") mpMakePeer(m.id, m.slot, true);
      break;
    case "gone":
      if (mp.role === "host") mpDrop(m.id);
      break;
    case "closed":
      mpFail("A sala foi encerrada.");
      break;
    case "sig":
      mpSig(m.from, m.d || {});
      break;
  }
}
function mpSend(o, id) {
  const s = JSON.stringify(o);
  const go = (p) => {
    try {
      p.dc && p.dc.readyState === "open" && p.dc.send(s);
    } catch {}
  };
  if (id) {
    mp.peers[id] && go(mp.peers[id]);
  } else Object.values(mp.peers).forEach(go);
}
function mpMakePeer(id, slot, off) {
  const pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun.cloudflare.com:3478",
        ],
      },
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turns:openrelay.metered.ca:443?transport=tcp",
        ],
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ].concat(mp.ice || []),
  });
  const p = {
    id,
    slot,
    pc,
    dc: null,
    q: [],
    open: null,
    fail: null,
    tm: 0,
    ok: false,
    sent: false,
  };
  mp.peers[id] = p;
  pc.onicecandidate = (e) => {
    e.candidate && mpWs({ t: "sig", to: id, d: { c: e.candidate } });
  };
  pc.onconnectionstatechange = () => {
    clearTimeout(p.dt);
    if (pc.connectionState === "failed") mpDrop(id);
    else if (pc.connectionState === "disconnected")
      p.dt = setTimeout(() => {
        pc.connectionState !== "connected" && mpDrop(id);
      }, 5000);
  };
  if (off) {
    mpDC(p, pc.createDataChannel("g"));
    mpFast(p, pc.createDataChannel("i", { ordered: false, maxRetransmits: 0 }));
    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        mpWs({ t: "sig", to: id, d: { s: pc.localDescription } });
      } catch (e) {
        console.warn(e);
      }
    };
  } else {
    pc.ondatachannel = (e) => {
      e.channel.label === "i" ? mpFast(p, e.channel) : mpDC(p, e.channel);
    };
    pc.ontrack = mpOnTrack;
  }
  return p;
}
async function mpSig(from, d) {
  const p = mp.peers[from];
  if (!p) return;
  const pc = p.pc;
  try {
    if (d.s) {
      await pc.setRemoteDescription(d.s);
      while (p.q.length) await pc.addIceCandidate(p.q.shift());
      if (d.s.type === "offer") {
        await pc.setLocalDescription(await pc.createAnswer());
        mpWs({ t: "sig", to: from, d: { s: pc.localDescription } });
      }
    } else if (d.c) {
      if (pc.remoteDescription) await pc.addIceCandidate(d.c);
      else p.q.push(d.c);
    }
  } catch (e) {
    console.warn("sig", e);
  }
}
function mpDC(p, dc) {
  p.dc = dc;
  dc.onopen = () => {
    p.ok = true;
    p.open && p.open();
    if (mp.role === "host") {
      mp.maps[p.slot] = mp.maps[p.slot] || {};
      mpBroadcastMaps();
      mpWaitUpdate();
      mpLobbyRender();
      toast("Jogador " + (p.slot + 1) + " entrou");
    }
  };
  dc.onclose = () => mpDrop(p.id);
  dc.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m && typeof m.t === "string") mpOnData(p, m);
  };
}
function mpCleanMap(m) {
  const o = {};
  MP_ACT.forEach(([a]) => {
    if (m && typeof m[a] === "string") o[a] = m[a].slice(0, 24);
  });
  return o;
}
function mpOnData(p, m) {
  switch (m.t) {
    case "ping":
      mpSend({ t: "pong", id: m.id }, p.id);
      break;
    case "pong":
      if (mp.pings[m.id]) {
        mp.pings[m.id]();
        delete mp.pings[m.id];
      }
      break;
    case "map":
      if (mp.role === "host") {
        mp.maps[p.slot] = mpCleanMap(m.map);
        mpBroadcastMaps();
        mpLobbyRender();
      }
      break;
    case "maps":
      if (mp.role === "guest") {
        const o = {};
        Object.keys(m.maps || {}).forEach((k) => {
          o[k] = mpCleanMap(m.maps[k]);
        });
        mp.maps = o;
        mpLobbyRender();
      }
      break;
    case "ib":
      if (
        mp.role === "host" &&
        typeof m.n === "number" &&
        typeof m.m === "number" &&
        m.n > (p.seq || 0)
      ) {
        p.seq = m.n;
        mpApplyMask(p, m.m | 0);
      }
      break;
    case "in":
      if (
        mp.role === "host" &&
        typeof m.b === "string" &&
        Object.prototype.hasOwnProperty.call(PAD, m.b)
      ) {
        try {
          window.EJS_emulator?.gameManager?.simulateInput(p.slot, PAD[m.b], m.v ? 1 : 0);
        } catch {}
      }
      break;
    case "start":
      if (mp.role === "guest") mpGuestStart();
      break;
    case "bye":
      if (mp.role === "guest")
        mpFail(typeof m.m === "string" && m.m ? m.m : "O anfitrião saiu da sala.");
      break;
  }
}
function mpBroadcastMaps() {
  mp.maps[0] = clone(S.keymap);
  mpSend({ t: "maps", maps: mp.maps });
}
function mpPing() {
  return new Promise((ok, no) => {
    const id = String(Math.random());
    const tm = setTimeout(() => {
      delete mp.pings[id];
      no(new Error("Falha ao sincronizar com o anfitrião."));
    }, 5000);
    mp.pings[id] = () => {
      clearTimeout(tm);
      ok();
    };
    mpSend({ t: "ping", id });
  });
}
function mpDrop(id) {
  const p = mp.peers[id];
  if (!p) return;
  delete mp.peers[id];
  clearTimeout(p.tm);
  p.mask = 0;
  try {
    p.pc.close();
  } catch {}
  if (mp.role === "host" && p.ok && mp.on) {
    mpFail("Jogador " + (p.slot + 1) + " saiu. A sala foi encerrada.");
    return;
  }
  try {
    p.pc.close();
  } catch {}
  p.fail && p.fail(new Error("Conexão perdida."));
  if (mp.role === "host") {
    Object.keys(PAD).forEach((b) => {
      try {
        window.EJS_emulator?.gameManager?.simulateInput(p.slot, PAD[b], 0);
      } catch {}
    });
    delete mp.maps[p.slot];
    mpBroadcastMaps();
    mpLobbyRender();
    mpWaitUpdate();
    toast("Jogador " + (p.slot + 1) + " saiu");
  } else if (mp.on) mpFail("Conexão com o anfitrião perdida.");
}
async function mpCreate(name, game, max) {
  await mpConnect();
  const m = await mpReq({ t: "create", name, game, max, sys: SYS }, "created");
  mp.on = true;
  mp.role = "host";
  mp.room = m.room;
  mp.slot = 0;
  mp.hostId = mp.id;
  mp.maps = { 0: clone(S.keymap) };
  mp.started = false;
}
async function mpJoin(r, link) {
  await mpConnect();
  mp.mask = 0;
  mp.seq = 0;
  const m = await mpReq({ t: "join", id: r.id, link: link ? 1 : 0 }, "joined");
  mp.on = true;
  mp.role = "guest";
  mp.room = m.room;
  mp.slot = m.slot;
  mp.hostId = m.host;
  mp.maps = {};
  mp.started = false;
  mp.stream = null;
  const p = mpMakePeer(m.host, 0, false);
  await new Promise((ok, no) => {
    p.open = ok;
    p.fail = no;
    p.tm = setTimeout(
      () =>
        no(new Error("Não foi possível conectar ao anfitrião. Verifique se estão na mesma rede.")),
      15000,
    );
  });
  clearTimeout(p.tm);
  for (let i = 0; i < 3; i++) await mpPing();
  mpSend({ t: "map", map: clone(S.keymap) });
}
function mpLeave() {
  if (!mp.on && !Object.keys(mp.peers).length) return;
  const peers = Object.values(mp.peers);
  if (mp.role === "host") mpSend({ t: "bye", m: mp.byeMsg || "" });
  mp.byeMsg = "";
  mpWs({ t: "leave" });
  mp.peers = {};
  mp.on = false;
  mp.role = null;
  mp.room = null;
  mp.maps = {};
  mp.started = false;
  mp.pend = null;
  mp.stream = null;
  mp.video = null;
  mp.vOk = false;
  mp.pings = {};
  clearTimeout(mp.vt);
  setTimeout(
    () =>
      peers.forEach((p) => {
        clearTimeout(p.tm);
        try {
          p.pc.close();
        } catch {}
      }),
    250,
  );
  document.body.classList.remove("mpg");
  mpUiReset();
}
function mpFail(msg) {
  if (!mp.on) return;
  const r = mp.role,
    st = mp.started;
  mp.byeMsg = msg;
  mpLeave();
  toast(msg);
  if ($("#player").classList.contains("show") && (r === "guest" || st)) exitPlayer();
}
function mpUiReset() {
  mpcEl.classList.add("hidden");
  shEl.classList.add("hidden");
  mpCap = null;
  mplHide(true);
}
function mplOpen(title) {
  clearTimeout(mplT);
  placeOvl();
  releaseAll();
  mplMode = "";
  mplEl.classList.remove("hidden", "out");
  $("#mpl-name").textContent = title;
  $("#mpl-bar").classList.remove("hidden");
  $("#mpl-pct").classList.remove("hidden");
  $("#mpl-cnt").classList.add("hidden");
  $("#mpl-act").classList.add("hidden");
  $("#mpl-cont").classList.add("hidden");
  $("#mpl-st").textContent = "";
  ldUI(mplEl)(0);
}
function mplHide(now) {
  clearTimeout(mplT);
  mplMode = "";
  if (now || reduceMotion() || mplEl.classList.contains("hidden")) {
    mplEl.classList.add("hidden");
    return;
  }
  mplEl.classList.add("out");
  mplT = setTimeout(() => mplEl.classList.add("hidden"), 360);
}
async function mplRun(title, msgs, ms, work) {
  mplOpen(title);
  const up = ldUI(mplEl),
    st = $("#mpl-st");
  if (reduceMotion()) ms = 300;
  const t0 = performance.now();
  let done = false,
    res,
    err,
    v = 0;
  Promise.resolve()
    .then(work)
    .then(
      (r) => {
        res = r;
      },
      (e) => {
        err = e || new Error("Erro desconhecido.");
      },
    )
    .then(() => {
      done = true;
    });
  await new Promise((ok) => {
    const iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      if (done && err) {
        clearInterval(iv);
        ok();
        return;
      }
      const tg = done && k >= 1 ? 100 : Math.min(92, 92 * k * k * (3 - 2 * k));
      v += (tg - v) * 0.25;
      if (tg === 100 && v > 99.4) v = 100;
      up(v);
      st.textContent = msgs[Math.min(msgs.length - 1, Math.floor(k * msgs.length))];
      if (v >= 100) {
        clearInterval(iv);
        ok();
      }
    }, 30);
  });
  return { res, err };
}
function mplWait() {
  mplMode = "wait";
  $("#mpl-name").textContent = mp.room.name;
  $("#mpl-bar").classList.add("hidden");
  $("#mpl-pct").classList.add("hidden");
  $("#mpl-cnt").classList.remove("hidden");
  $("#mpl-act").classList.remove("hidden");
  $("#mpl-st").textContent = "Esperando jogador...";
  mpWaitUpdate();
}
const mpCount = () => Object.keys(mp.maps).length;
function mpWaitUpdate() {
  if (mplMode !== "wait" || !mp.room) return;
  const n = mpCount(),
    mx = mp.room.max;
  $("#mpl-cnt").textContent = n + " / " + mx + " jogadores";
  $("#mpl-cont").classList.toggle("hidden", n < 2);
  if (n >= mx) mpGoLobby();
}
function mpGoLobby() {
  mplHide();
  mpLobbyOpen();
}
function mpLobbyOpen() {
  placeOvl();
  releaseAll();
  mpcEl.classList.remove("hidden");
  mpLobbyRender();
}
const mpIsMobile = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (matchMedia("(pointer:coarse)").matches && !matchMedia("(hover:hover)").matches);
function mpLobbyRender() {
  if (!mp.on || !mp.room || mpcEl.classList.contains("hidden")) return;
  const r = mp.room,
    mx = r.max,
    n = mpCount(),
    host = mp.role === "host",
    mob = mpIsMobile();
  $("#mpc-name").textContent = r.name;
  $("#mpc-game").textContent = fmtName(r.game).display + " · " + n + "/" + mx + " jogadores";
  const pl = $("#mpc-players");
  pl.textContent = "";
  for (let sl = 0; sl < mx; sl++) {
    const has = sl in mp.maps,
      d = document.createElement("div");
    d.className = "mpc-pl" + (sl === mp.slot ? " me" : "") + (has ? "" : " off");
    const i = document.createElement("i");
    i.className = "fa-solid " + (has ? "fa-user" : "fa-hourglass-half");
    const t = document.createElement("span");
    t.textContent = has
      ? "Jogador " + (sl + 1) + (sl === mp.slot ? " (você)" : "") + (sl === 0 ? " · host" : "")
      : "Aguardando...";
    d.append(i, t);
    pl.appendChild(d);
  }
  $("#mpc-keys").classList.toggle("hidden", mob);
  $("#mpc-hint").textContent = mob
    ? "Você joga com os botões na tela (ou com um controle conectado)."
    : "Suas teclas. Clique em uma e pressione a nova (Esc cancela). Cada jogador usa o próprio teclado, então pode repetir as teclas dos outros.";
  const t = $("#mpc-table");
  t.textContent = "";
  if (!mob) {
    const ACT = MP_ACT.filter(([a]) => con().btns.includes(a)).map(([a, l]) => [a, KLBL()[a] || l]),
      h = Math.ceil(ACT.length / 2);
    for (let k = 0; k < h; k++) {
      const row = t.insertRow();
      [ACT[k], ACT[k + h]].forEach((it) => {
        if (!it) {
          row.insertCell();
          row.insertCell();
          return;
        }
        const [a, l] = it;
        row.insertCell().textContent = l;
        const c = row.insertCell(),
          b = document.createElement("button");
        b.className = "km-key" + (mpCap === a ? " wait" : "");
        b.style.minWidth = "74px";
        b.textContent = mpCap === a ? "Pressione..." : keyLabel(S.keymap[a]);
        b.onclick = () => {
          capturing = null;
          capObj = null;
          mpCap = mpCap === a ? null : a;
          mpLobbyRender();
        };
        c.appendChild(b);
      });
    }
  }
  $("#mpc-start").classList.toggle("hidden", !host);
  $("#mpc-start").disabled = n < 2;
  $("#mpc-wait").textContent = host
    ? n < 2
      ? "Aguardando jogadores..."
      : n < mx
        ? "Você pode iniciar ou esperar mais jogadores."
        : "Todos conectados."
    : "Aguardando o anfitrião iniciar...";
}
function mpKeyPick(code) {
  const act = mpCap;
  mpCap = null;
  if (code !== "Escape" && act) {
    const km = S.keymap,
      old = km[act];
    let h = null;
    KMK.forEach((k) =>
      Object.keys(S[k]).forEach((o) => {
        if (!h && !(k === "keymap" && o === act) && S[k][o] === code) h = [k, o];
      }),
    );
    if (h) S[h[0]][h[1]] = old;
    km[act] = code;
    persist();
    buildLookup();
    mp.maps[mp.slot] = clone(km);
    if (mp.role === "host") mpBroadcastMaps();
    else mpSend({ t: "map", map: clone(km) }, mp.hostId);
  }
  mpLobbyRender();
}
function mpEsc() {
  shEl.classList.contains("hidden") || shClose();
}
function mpStart() {
  const i = library.findIndex((f) => f.name === mp.room.game && (f.sys || "ps1") === (mp.room.sys || SYS));
  if (i < 0) {
    toast("Jogo não encontrado na biblioteca");
    return;
  }
  if (mpCount() < 2) return;
  mpWs({ t: "lock" });
  mp.started = true;
  mpSend({ t: "start" });
  mpcEl.classList.add("hidden");
  mpCap = null;
  mpTapAudio();
  playGame(i);
}
function mpTapAudio() {
  if (mpTap) return;
  mpTap = { map: new Map(), first: null };
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...a) {
    const r = oc.call(this, d, ...a);
    try {
      if (
        mpTap &&
        d &&
        typeof AudioDestinationNode !== "undefined" &&
        d instanceof AudioDestinationNode
      ) {
        let x = mpTap.map.get(d.context);
        if (!x) {
          x = d.context.createMediaStreamDestination();
          mpTap.map.set(d.context, x);
          mpTap.first = mpTap.first || x;
        }
        oc.call(this, x, ...a);
      }
    } catch {}
    return r;
  };
}
function mpAttach(n = 0) {
  if (mp.role !== "host" || !mp.on) return;
  const ax = mpTap && mpTap.first;
  if (!ax && n < 15) {
    setTimeout(() => mpAttach(n + 1), 200);
    return;
  }
  const cv = document.querySelector("#ejs-box canvas");
  if (!cv || !cv.captureStream) {
    mpFail("Seu navegador não consegue transmitir o jogo.");
    return;
  }
  const tracks = [...cv.captureStream(60).getVideoTracks()];
  if (ax) tracks.push(...ax.stream.getAudioTracks());
  const ms = new MediaStream(tracks);
  Object.values(mp.peers).forEach((p) => {
    if (p.sent || !p.ok) return;
    p.sent = true;
    tracks.forEach((t) => {
      try {
        mpTune(p.pc, p.pc.addTrack(t, ms), t);
      } catch (e) {
        console.warn(e);
      }
    });
  });
}
function mpGuestPrep() {
  const g = mp.room.game;
  leavingPlayer = false;
  cleanup();
  current = { name: g };
  started = false;
  $("#p-title").textContent = fmtName(g).display + " · " + mp.room.name;
  $("#p-full").classList.toggle(
    "hidden",
    !(document.fullscreenEnabled || document.webkitFullscreenEnabled),
  );
  const a = $("#player");
  a.classList.remove("leaving");
  a.classList.add("show");
  document.body.classList.add("playing", "mpg");
  $("#ejs-box").style.setProperty("--orig", (mp.room.sys || SYS) === "psp" ? "1.7647" : "1.3333");
  applyAll(S);
}
function mpGuestStart() {
  mp.started = true;
  mp.vOk = false;
  phLand();
  setTimeout(() => {
    if (
      isMobDev() &&
      mp.started &&
      (!isFs() || !/landscape/.test((screen.orientation && screen.orientation.type) || ""))
    )
      document.body.classList.add("needtap");
  }, 900);
  mpcEl.classList.add("hidden");
  mpCap = null;
  ldStart(current);
  const v = document.createElement("video");
  v.id = "mp-video";
  v.autoplay = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  $("#ejs-box").appendChild(v);
  mp.video = v;
  v.onplaying = () => {
    if (mp.vOk) return;
    mp.vOk = true;
    clearTimeout(mp.vt);
    ldFinish();
  };
  if (mp.stream) mpPlayVideo();
  applyVol();
  clearTimeout(mp.vt);
  mp.vt = setTimeout(() => {
    if (!mp.vOk) mpFail("Não foi possível receber o vídeo do anfitrião.");
  }, 25000);
}
function mpPlayVideo() {
  const v = mp.video;
  if (!v) return;
  if (v.srcObject !== mp.stream) v.srcObject = mp.stream;
  const pr = v.play();
  pr &&
    pr.catch(() => {
      v.muted = true;
      v.play().catch(() => {});
      toast("Toque na tela para ativar o som");
      document.addEventListener(
        "pointerdown",
        () => {
          v.muted = false;
          v.play().catch(() => {});
        },
        { once: true },
      );
    });
}
function mpOnTrack(e) {
  try {
    e.receiver.jitterBufferTarget = e.track.kind === "audio" ? 60 : 0;
  } catch {}
  try {
    e.receiver.playoutDelayHint = e.track.kind === "audio" ? 0.06 : 0;
  } catch {}
  mp.stream = (e.streams && e.streams[0]) || new MediaStream([e.track]);
  mpPlayVideo();
}
const mpLists = () =>
  [[$("#mp-pg-join"), $("#mp-jlist")]]
    .filter((x) => !x[0].classList.contains("hidden"))
    .map((x) => x[1]);
function mpNote(l, t) {
  l.textContent = "";
  const p = document.createElement("p");
  p.className = "empty";
  p.style.gridColumn = "1/-1";
  p.textContent = t;
  l.appendChild(p);
}
function mpRenderRooms() {
  const mine = mp.rooms.filter((r) => (r.sys || "ps1") === SYS),
    others = {};
  mp.rooms.forEach((r) => {
    const k = r.sys || "ps1";
    k !== SYS && CONSOLES[k] && !r.locked && (others[k] = 1);
  });
  const ok = Object.keys(others),
    txt = ok.length
      ? (ok.length > 1 ? "Há salas nos consoles " : "Há salas no console ") + ok.map((k) => CONSOLES[k].name).join(" e ")
      : "";
  if (txt && mpSub === "join" && !mp.searching && mpRenderRooms.sig !== txt) toast(txt, 5000);
  mpRenderRooms.sig = txt;
  mpLists().forEach((l) => {
    l.textContent = "";
    if (mp.searching && !mp.ws) {
      mpNote(l, "Procurando servers na sua rede...");
      return;
    }
    if (txt) {
      const n = document.createElement("div");
      n.className = "mp-other";
      n.innerHTML = '<i class="fa-solid fa-circle-info"></i><span></span>';
      n.lastChild.textContent = txt;
      l.appendChild(n);
    }
    if (!mine.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.style.gridColumn = "1/-1";
      p.textContent = "Nenhuma sala de " + con().name + " aberta ainda :/";
      l.appendChild(p);
      return;
    }
    mine.forEach((r) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mp-room";
      b.disabled = r.count >= r.max;
      const top = document.createElement("div");
      top.className = "mr-top";
      const nm = document.createElement("span");
      nm.className = "mr-name";
      nm.textContent = r.name;
      const ct = document.createElement("span");
      ct.className = "mr-cnt";
      ct.textContent = r.count + "/" + r.max;
      top.append(nm, ct);
      const d = document.createElement("div");
      d.className = "disc";
      d.innerHTML = '<i class="fa-solid fa-compact-disc"></i>';
      const g = document.createElement("div");
      g.className = "mr-game";
      g.textContent = fmtName(r.game).display;
      b.append(top, d, g);
      b.onclick = () => mpJoinRoom(r);
      l.appendChild(b);
    });
  });
}
async function mpSearch() {
  mp.searching = true;
  mpRenderRooms();
  try {
    await mpConnect();
    mpWs({ t: "list" });
  } catch (e) {
    mp.searching = false;
    mpLists().forEach((l) => mpNote(l, e.message + " Verifique sua internet e tente de novo."));
  }
}
async function mpJoinRoom(r) {
  if (mp.busy) return;
  phFull();
  mp.busy = true;
  mpShowSub("hub");
  const out = await mplRun(r.name, ["Verificando conexões...", "Sincronizando..."], 2800, () =>
    mpJoin(r),
  );
  mp.busy = false;
  if (out.err) {
    mpLeave();
    mplHide();
    toast(out.err.message);
    return;
  }
  mpGuestPrep();
  mplHide();
  mpLobbyOpen();
}
function mpWarn(t) {
  const a = $("#mp-banner");
  a.textContent = "";
  const i = document.createElement("i");
  i.className = "fa-solid fa-triangle-exclamation";
  const s = document.createElement("span");
  s.textContent = t;
  a.append(i, s);
  a.style.display = "none";
  a.offsetWidth;
  a.style.display = "flex";
  clearTimeout(mpWarn.t);
  mpWarn.t = setTimeout(() => (a.style.display = "none"), 9000);
}
function mpFillGames() {
  const s = $("#mp-game"),
    old = s.value;
  s.textContent = "";
  const l = [...library].filter((f) => (f.sys || "ps1") === SYS).sort((a, b) =>
    fmtName(a.name).display.localeCompare(fmtName(b.name).display, "pt-BR"),
  );
  if (!l.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Nenhum jogo na biblioteca";
    s.appendChild(o);
    return;
  }
  l.forEach((f) => {
    const o = document.createElement("option");
    o.value = f.name;
    o.textContent = fmtName(f.name).display + " (" + con().short + ")";
    s.appendChild(o);
  });
  if (old && l.some((f) => f.name === old)) s.value = old;
}
let mpSub = "hub";
function mpShowSub(n) {
  mpSub = n;
  $("#mp-hub").classList.toggle("hidden", n !== "hub");
  $("#mp-pg-create").classList.toggle("hidden", n !== "create");
  $("#mp-pg-join").classList.toggle("hidden", n !== "join");
  $("#mp-srvbar").classList.toggle("hidden", n !== "hub");
  if (n === "create") mpFillGames();
  if (n === "join") mpSearch();
  setTimeout(() => updateSegs($("#view-multi")), 60);
}
$("#mp-opt-create").onclick = () => {
  if (mp.on) {
    toast("Você já está em uma sala");
    return;
  }
  mpShowSub("create");
};
$("#mp-opt-join").onclick = () => {
  if (mp.on) {
    toast("Você já está em uma sala");
    return;
  }
  mpShowSub("join");
};
$("#mp-back-c").onclick = () => mpShowSub("hub");
$("#mp-back-j").onclick = () => mpShowSub("hub");
$("#mp-refresh").onclick = () => mpSearch();
async function mpOpenTab() {
  const v = $("#view-multi");
  if ((v.classList.contains("show") && !v.classList.contains("out")) || mp.busy) return;
  if (mp.on) {
    goView("multi");
    return;
  }
  mp.busy = true;
  const out = await mplRun(
    "Multiplayer",
    ["Conectando à sua rede...", "Procurando servidor..."],
    1700,
    () => mpConnect(),
  );
  mp.busy = false;
  mpShowSub("hub");
  mpFillGames();
  goView("multi");
  mplHide();
  setTimeout(() => updateSegs(v), 120);
  if (out.err) mpWarn(out.err.message + " Verifique sua internet e tente de novo.");
  else $("#mp-banner").style.display = "none";
}
$("#mp-name").addEventListener("input", (e) => {
  $("#mp-cnt").textContent = e.target.value.length + "/20";
});
$("#mp-name").addEventListener("keydown", (e) => {
  e.key === "Enter" && $("#mp-create").click();
});
$("#mp-create").onclick = async () => {
  if (mp.busy || mp.on) return;
  const name =
      $("#mp-name").value.trim().slice(0, 20) || "Sala " + (100 + Math.floor(Math.random() * 900)),
    game = $("#mp-game").value,
    max = 2;
  if (!game) {
    toast("Escolha um jogo");
    return;
  }
  mp.busy = true;
  const out = await mplRun("Criando sala", ["Conectando...", "Criando sala..."], 1800, () =>
    mpCreate(name, game, max),
  );
  mp.busy = false;
  if (out.err) {
    mplHide();
    mpWarn(out.err.message);
    return;
  }
  mplWait();
};
$("#mpl-cancel").onclick = () => {
  mpLeave();
  mplHide(true);
};
$("#mpl-cont").onclick = () => {
  mpCount() >= 2 && mpGoLobby();
};
$("#mpc-start").onclick = mpStart;
function mpBase() {
  if (mp.pub) return mp.pub.replace(/\/+$/, "") + "/";
  if (mp.srv === "mqtt") {
    if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname;
    return MP_SITE || "";
  }
  const m = (mp.srv || "").match(/^(wss?):\/\/([^/]+)/);
  if (m) {
    let h = m[2];
    if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) {
      const ip = (mp.ips || [])[0];
      if (ip) h = ip + ":" + (mp.port || MP_PORT);
    }
    return (m[1] === "wss" ? "https://" : "http://") + h + "/";
  }
  return /^https?:$/.test(location.protocol) ? location.origin + "/" : "";
}
function shClose() {
  shEl.classList.add("hidden");
}
async function shCopy(inp, btn) {
  const txt = inp.value;
  let ok = !1;
  try {
    await navigator.clipboard.writeText(txt);
    ok = !0;
  } catch {
    try {
      inp.focus();
      inp.select();
      ok = document.execCommand("copy");
    } catch {}
  }
  if (!ok) {
    inp.focus();
    inp.select();
    toast("Selecionei o texto: aperte Ctrl+C para copiar");
    return;
  }
  const sp = btn.querySelector("span"),
    ic = btn.querySelector("i");
  btn.dataset.t || ((btn.dataset.t = sp.textContent), (btn.dataset.i = ic.className));
  sp.textContent = "Copiado!";
  ic.className = "fa-solid fa-check";
  btn.classList.add("copied");
  clearTimeout(btn._t);
  btn._t = setTimeout(() => {
    sp.textContent = btn.dataset.t;
    ic.className = btn.dataset.i;
    btn.classList.remove("copied");
  }, 1800);
}
function mpShare() {
  if (!mp.room) return;
  const b = mpBase(),
    id = mp.room.id,
    l = b ? b + "?sala=" + id : "";
  $("#mpsh-room").textContent = mp.room.name || "";
  $("#sh-link").value = l;
  $("#sh-link-row").classList.toggle("hidden", !l);
  $("#sh-code").value = id;
  $("#sh-hint").textContent = l
    ? "Mande o link ou o código para quem vai jogar com você. O link já abre a sala; com o código, a pessoa toca em “Entrar com código” na aba Multiplayer."
    : "Mande o código para quem vai jogar com você. A pessoa toca em “Entrar com código” na aba Multiplayer.";
  $("#sh-native").classList.toggle("hidden", !navigator.share);
  placeOvl();
  shEl.classList.remove("hidden");
  setTimeout(() => {
    try {
      $(l ? "#sh-link-copy" : "#sh-code-copy").focus();
    } catch {}
  }, 60);
}
$("#sh-link-copy").onclick = () => shCopy($("#sh-link"), $("#sh-link-copy"));
$("#sh-code-copy").onclick = () => shCopy($("#sh-code"), $("#sh-code-copy"));
$("#sh-link").onfocus = (e) => e.target.select();
$("#sh-code").onfocus = (e) => e.target.select();
$("#sh-close").onclick = shClose;
shEl.addEventListener("click", (e) => {
  e.target === shEl && shClose();
});
$("#sh-native").onclick = async () => {
  if (!navigator.share || !mp.room) return;
  const l = $("#sh-link").value,
    id = mp.room.id;
  try {
    await navigator.share(
      l
        ? { title: "PlayRom.io", text: "Entre na minha sala do PlayRom.io! Código: " + id, url: l }
        : { title: "PlayRom.io", text: "Entre na minha sala do PlayRom.io! Código: " + id },
    );
  } catch {}
};
$("#mp-code").onclick = () => {
  if (mp.busy || mp.on) return;
  const v = (window.prompt("Digite o código da sala:", "") || "").trim().toLowerCase();
  if (!v) return;
  if (!/^[a-f0-9]{8}$/.test(v)) {
    toast("Código inválido");
    return;
  }
  window.__plPend = v;
  mpLinkJoin();
};
$("#mpl-share").onclick = mpShare;
$("#mpc-share").onclick = mpShare;
async function mpLinkJoin() {
  const id = window.__plPend;
  if (!id) return;
  window.__plPend = null;
  try {
    history.replaceState(null, "", location.pathname);
  } catch {}
  if (mp.on || mp.busy) return;
  mp.busy = true;
  goView("multi");
  mpShowSub("hub");
  const out = await mplRun(
    "Entrando na sala",
    ["Procurando servidor...", "Verificando conexões...", "Sincronizando..."],
    3000,
    async () => {
      await mpConnect();
      const m = await mpReq({ t: "room", id }, "room");
      if (!m.room)
        throw new Error(
          m.locked ? "Essa partida já começou." : "Essa sala não está mais disponível.",
        );
      m.room.sys && CONSOLES[m.room.sys] && m.room.sys !== SYS && setSys(m.room.sys, true);
      return mpJoin(m.room, true);
    },
  );
  mp.busy = false;
  if (out.err) {
    mpLeave();
    mplHide();
    toast(out.err.message);
    return;
  }
  mpGuestPrep();
  mplHide();
  mpLobbyOpen();
}
function mpNorm(v) {
  v = String(v || "")
    .trim()
    .replace(/\/+$/, "");
  if (!v) return "";
  let sch = null;
  const m = v.match(/^(wss?|https?):\/\//i);
  if (m) {
    sch = /s$/i.test(m[1]) ? "wss" : "ws";
    v = v.slice(m[0].length);
  }
  const ip = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$|^localhost(:\d+)?$/i.test(v);
  if (!sch) sch = ip ? "ws" : "wss";
  if (ip && !/:\d+$/.test(v)) v += ":" + MP_PORT;
  return sch + "://" + v;
}
$("#mp-srv").onclick = async () => {
  if (mp.busy || mp.on) return;
  const v = window.prompt(
    "Endereço do servidor do PlayRom.io.\nEx.: 192.168.0.10  ou  https://meu-servidor.com\n(deixe vazio para procurar automaticamente)",
    cfg.get("mpManual", "") || "",
  );
  if (v === null) return;
  cfg.set("mpManual", mpNorm(v));
  try {
    mp.ws && mp.ws.close();
  } catch {}
  mp.ws = null;
  mp.conn = null;
  mp.busy = true;
  const out = await mplRun("Multiplayer", ["Procurando servidor..."], 1200, () => mpConnect());
  mp.busy = false;
  mplHide();
  if (out.err) mpWarn(out.err.message);
  else {
    $("#mp-banner").style.display = "none";
    toast("Servidor encontrado");
  }
};
$("#mpc-leave").onclick = () => {
  const g = mp.role === "guest";
  mpLeave();
  g && $("#player").classList.contains("show") && exitPlayer();
};
