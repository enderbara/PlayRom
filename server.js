"use strict";
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { WebSocketServer } = require("ws");
if (process.argv.includes("--instalar") || process.argv.includes("--desinstalar")) {
  if (process.platform !== "win32") {
    console.log("O início automático só está disponível no Windows.");
    process.exit(0);
  }
  const startup = path.join(
    process.env.APPDATA || "",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
    "PlayRom-servidor.vbs",
  );
  if (process.argv.includes("--desinstalar")) {
    try {
      fs.unlinkSync(startup);
      console.log(
        "Início automático removido. (O servidor atual continua até reiniciar o PC ou encerrar o node.exe.)",
      );
    } catch {
      console.log("O início automático não estava instalado.");
    }
    process.exit(0);
  }
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const cmd = q(process.execPath) + " " + q(__filename) + " --no-open";
  const vbs =
    'Set sh = CreateObject("WScript.Shell")\r\nsh.CurrentDirectory = ' +
    q(__dirname) +
    "\r\nsh.Run " +
    q(cmd) +
    ", 0, False\r\n";
  try {
    fs.mkdirSync(path.dirname(startup), { recursive: true });
    fs.writeFileSync(startup, vbs, "latin1");
  } catch (e) {
    console.error("Não consegui instalar:", e.message);
    process.exit(1);
  }
  require("child_process")
    .spawn(process.execPath, [__filename, "--no-open"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      cwd: __dirname,
    })
    .unref();
  console.log(
    "Pronto! O servidor do PlayRom.io já está rodando em segundo plano e vai ligar sozinho sempre que o Windows iniciar.",
  );
  console.log("Agora é só abrir o index.html no Chrome.");
  console.log("Para desfazer: node server.js --desinstalar");
  process.exit(0);
}
const PORT = +process.env.PORT || 3000;
const ROOT = __dirname;
const FILES = {
  "index.html": "text/html; charset=utf-8",
  "logo.png": "image/png",
  "sw.js": "text/javascript; charset=utf-8",
  "style.css": "text/css; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "multiplayer.js": "text/javascript; charset=utf-8",
  "optimizer.js": "text/javascript; charset=utf-8",
};
for (const b of ["scph5501", "scph1001", "scph7001", "scph101", "scph5500", "scph5502"])
  FILES[b + ".bin"] = "application/octet-stream";
const LAN_IPS = () =>
  Object.values(require("os").networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
let ICE = null;
try {
  ICE = JSON.parse(process.env.PLAYROM_ICE || process.env.PLAYHUB_ICE || "null");
} catch {}
const server = http.createServer((req, res) => {
  if ((req.url || "").split("?")[0] === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  p = p === "/" ? "index.html" : path.basename(p);
  const type = FILES[p];
  if (!type) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(data);
  });
});
function openBrowser(url) {
  if (process.env.NO_OPEN || process.argv.includes("--no-open")) return;
  const cmd =
    process.platform === "win32"
      ? 'start "" "' + url + '"'
      : process.platform === "darwin"
        ? 'open "' + url + '"'
        : 'xdg-open "' + url + '"';
  require("child_process").exec(cmd, () => {});
}
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on("error", () => {});
const clients = new Set();
const SYSK = ["ps1", "md", "atari"];
function onlineCounts() {
  const c = { ps1: 0, md: 0, atari: 0 };
  clients.forEach((w) => c[w.sys] !== undefined && c[w.sys]++);
  return c;
}
function pushOnline() {
  const o = { t: "online", counts: onlineCounts() };
  clients.forEach((c) => send(c, o));
}
const rooms = new Map();
function groupOf(req) {
  let ip = String(
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "",
  );
  ip = ip.replace(/^::ffff:/, "");
  const priv =
    /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i.test(ip);
  return priv ? "lan" : ip;
}
const send = (ws, o) => {
  try {
    ws.readyState === 1 && ws.send(JSON.stringify(o));
  } catch {}
};
const pub = (r) => ({ id: r.id, name: r.name, game: r.game, sys: r.sys, max: r.max, count: r.members.length });
const listFor = (g) => [...rooms.values()].filter((r) => r.group === g && !r.locked).map(pub);
function pushRooms(g) {
  const l = listFor(g);
  clients.forEach((c) => c.group === g && send(c, { t: "rooms", rooms: l }));
}
const clean = (s, n) =>
  String(s == null ? "" : s)
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, n);
function leave(c) {
  const r = c.room;
  if (!r) return;
  c.room = null;
  if (r.host === c || r.locked) {
    r.members.forEach((m) => {
      if (m.ws !== c) {
        m.ws.room = null;
        send(m.ws, { t: "closed" });
      }
    });
    rooms.delete(r.id);
  } else {
    const m = r.members.find((x) => x.ws === c);
    r.members = r.members.filter((x) => x.ws !== c);
    send(r.host, { t: "gone", id: c.id, slot: m ? m.slot : -1 });
  }
  pushRooms(c.group);
}
wss.on("connection", (ws, req) => {
  ws.id = crypto.randomBytes(6).toString("hex");
  ws.group = groupOf(req);
  ws.room = null;
  ws.sys = "";
  ws.alive = true;
  clients.add(ws);
  ws.on("pong", () => {
    ws.alive = true;
  });
  console.log("[+] conectou:", ws.id);
  send(ws, {
    t: "hello",
    id: ws.id,
    ips: LAN_IPS(),
    port: PORT,
    pub: process.env.PUBLIC_URL || "",
    ice: ICE,
  });
  send(ws, { t: "rooms", rooms: listFor(ws.group) });
  send(ws, { t: "online", counts: onlineCounts() });
  ws.on("message", (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m.t !== "string") return;
    switch (m.t) {
      case "list":
        send(ws, { t: "rooms", rooms: listFor(ws.group) });
        break;
      case "pres": {
        const v = SYSK.includes(m.sys) ? m.sys : "";
        if (v !== ws.sys) {
          ws.sys = v;
          pushOnline();
        }
        break;
      }
      case "room": {
        const r = rooms.get(String(m.id));
        send(ws, { t: "room", room: r && !r.locked ? pub(r) : null, locked: !!(r && r.locked) });
        break;
      }
      case "create": {
        if (ws.room) {
          send(ws, { t: "err", m: "Você já está em uma sala." });
          break;
        }
        const name = clean(m.name, 20),
          game = clean(m.game, 120),
          max = Math.round(+m.max);
        if (!name) {
          send(ws, { t: "err", m: "Dê um nome para a sala." });
          break;
        }
        if (!game) {
          send(ws, { t: "err", m: "Escolha um jogo." });
          break;
        }
        if (max !== 2) {
          send(ws, { t: "err", m: "A sala aceita 2 jogadores." });
          break;
        }
        const r = {
          id: crypto.randomBytes(4).toString("hex"),
          name,
          game,
          sys: ["ps1", "md", "atari"].includes(m.sys) ? m.sys : "ps1",
          max,
          group: ws.group,
          locked: false,
          host: ws,
          members: [{ ws, slot: 0 }],
        };
        rooms.set(r.id, r);
        ws.room = r;
        send(ws, { t: "created", room: pub(r) });
        pushRooms(ws.group);
        break;
      }
      case "join": {
        const r = rooms.get(String(m.id));
        if (ws.room) {
          send(ws, { t: "err", m: "Você já está em uma sala." });
          break;
        }
        if (!r || (r.group !== ws.group && !m.link) || r.locked) {
          send(ws, { t: "err", m: "Essa sala não está mais disponível." });
          break;
        }
        if (r.members.length >= r.max) {
          send(ws, { t: "err", m: "A sala está cheia." });
          break;
        }
        let slot = 1;
        while (r.members.some((x) => x.slot === slot)) slot++;
        r.members.push({ ws, slot });
        ws.room = r;
        send(ws, { t: "joined", room: pub(r), slot, host: r.host.id });
        send(r.host, { t: "peer", id: ws.id, slot });
        pushRooms(ws.group);
        break;
      }
      case "sig": {
        const r = ws.room;
        if (!r) break;
        const to = r.members.find((x) => x.ws.id === m.to);
        if (to) send(to.ws, { t: "sig", from: ws.id, d: m.d });
        break;
      }
      case "lock":
        if (ws.room && ws.room.host === ws) {
          ws.room.locked = true;
          pushRooms(ws.group);
        }
        break;
      case "leave":
        leave(ws);
        break;
    }
  });
  ws.on("close", () => {
    leave(ws);
    clients.delete(ws);
    pushOnline();
  });
  ws.on("error", () => {});
});
setInterval(
  () =>
    wss.clients.forEach((ws) => {
      if (!ws.alive) return ws.terminate();
      ws.alive = false;
      try {
        ws.ping();
      } catch {}
    }),
  30000,
);
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log("O PlayRom.io já está rodando na porta " + PORT + ". Abrindo no navegador...");
    openBrowser("http://localhost:" + PORT);
    setTimeout(() => process.exit(0), 800);
    return;
  }
  console.error(e);
  process.exit(1);
});
server.listen(PORT, () => {
  const ips = Object.values(require("os").networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log("PlayRom.io multiplayer rodando.");
  console.log("  Neste computador: http://localhost:" + PORT);
  ips.forEach((ip) => console.log("  Outros aparelhos na rede: http://" + ip + ":" + PORT));
  console.log("\nDeixe esta janela aberta enquanto estiver jogando. Feche-a para encerrar.");
  openBrowser("http://localhost:" + PORT);
});
