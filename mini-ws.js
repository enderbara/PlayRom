"use strict";
/*
 * Servidor WebSocket mínimo (RFC 6455), sem nenhuma dependência.
 * Existe para o PlayRom.io funcionar SEM "npm install" / node_modules.
 * Só implementa o que o PlayRom.io usa: texto, ping/pong, close e mensagens fragmentadas.
 * Se o pacote "ws" estiver instalado, o server.js usa ele no lugar deste.
 */
const crypto = require("crypto");
const { EventEmitter } = require("events");
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_BUFFERED = 4 * 1024 * 1024; // cliente que não lê (lento/travado) é derrubado

class Socket extends EventEmitter {
  constructor(sock, max) {
    super();
    this.sock = sock;
    this.max = max;
    this.readyState = 1;
    this.buf = Buffer.alloc(0);
    this.frag = null;
    this._ct = null;
    sock.setNoDelay(true);
    sock.on("data", (d) => this._data(d));
    sock.on("close", () => this._closed());
    sock.on("error", () => this._closed());
  }
  get bufferedAmount() {
    return this.sock.writableLength || 0;
  }
  _closed() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    clearTimeout(this._ct);
    this.buf = Buffer.alloc(0);
    this.frag = null;
    this.emit("close");
  }
  _write(op, payload) {
    if (this.readyState === 3) return;
    if (this.readyState !== 1 && op !== 8) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.sock.write(Buffer.concat([head, payload]));
    } catch {}
    if (this.bufferedAmount > MAX_BUFFERED) this.terminate();
  }
  send(data) {
    this._write(1, Buffer.from(String(data)));
  }
  ping() {
    this._write(9, Buffer.alloc(0));
  }
  close() {
    if (this.readyState !== 1) return;
    this.readyState = 2;
    this._write(8, Buffer.alloc(0));
    this._ct = setTimeout(() => this.terminate(), 1000);
    if (this._ct.unref) this._ct.unref();
  }
  terminate() {
    // CORREÇÃO: antes marcava readyState = 3 aqui, e _closed() saía na 1ª linha
    // sem emitir "close" (o servidor nunca soube que o cliente caiu).
    try {
      this.sock.destroy();
    } catch {}
    this._closed();
  }
  _data(d) {
    if (this.readyState === 3) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = !!(b[0] & 0x80),
        op = b[0] & 0x0f,
        masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f,
        off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(this.max)) return this.terminate();
        len = Number(big);
        off = 10;
      }
      if (len > this.max || !masked) return this.terminate(); // clientes sempre mascaram
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const p = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 8) {
        // o cliente pediu para fechar: responde, encerra o socket e avisa na hora
        this._write(8, Buffer.alloc(0));
        try {
          this.sock.end();
        } catch {}
        this._closed();
        return;
      }
      if (op === 9) this._write(10, p);
      else if (op === 10) this.emit("pong");
      else if (op === 1 || op === 2 || op === 0) {
        if (op !== 0) this.frag = { parts: [], size: 0 };
        if (!this.frag) continue;
        // CORREÇÃO: o limite agora vale para a mensagem inteira, não só por fragmento
        this.frag.size += p.length;
        if (this.frag.size > this.max) return this.terminate();
        this.frag.parts.push(p);
        if (fin) {
          const all = Buffer.concat(this.frag.parts);
          this.frag = null;
          this.emit("message", all.toString("utf8"));
        }
      }
    }
  }
}

class WebSocketServer extends EventEmitter {
  constructor({ server, maxPayload = 64 * 1024 }) {
    super();
    this.clients = new Set();
    server.on("upgrade", (req, sock, head) => {
      const key = req.headers["sec-websocket-key"];
      if (!key || String(req.headers.upgrade).toLowerCase() !== "websocket") {
        sock.destroy();
        return;
      }
      const acc = crypto.createHash("sha1").update(key + GUID).digest("base64");
      sock.write(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
          "Sec-WebSocket-Accept: " +
          acc +
          "\r\n\r\n",
      );
      const ws = new Socket(sock, maxPayload);
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      this.emit("connection", ws, req);
      // CORREÇÃO: bytes que chegaram junto com o handshake (antes eram perdidos)
      if (head && head.length) ws._data(head);
    });
  }
}
module.exports = { WebSocketServer };
