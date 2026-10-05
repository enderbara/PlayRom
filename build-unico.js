"use strict";
/*
 * Gera o "playhub-unico.html": UM arquivo só, com o CSS, os scripts e o logo dentro dele.
 * Serve para mandar por WhatsApp/pen drive/e-mail: abre em qualquer aparelho sem precisar dos
 * outros arquivos (antes, mandando só o index.html aparecia o texto sem estilo e sem funcionar).
 *
 * Uso:   node build-unico.js                                  (sem endereço do site)
 *        node build-unico.js https://meu-playhub.onrender.com (multiplayer ligado ao seu site)
 *
 * IMPORTANTE: o emulador em si (EmulatorJS) e as fontes vêm da internet, então o aparelho
 * precisa de conexão. E o multiplayer só funciona de verdade se você informar o endereço do site.
 */
const fs = require("fs"),
  path = require("path");
const dir = __dirname;
const rd = (f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n");
const site = (process.argv[2] || process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
if (site && !/^https?:\/\/[^\s"'<>]+$/i.test(site)) {
  console.error("Endereço inválido. Exemplo: https://meu-playhub.onrender.com");
  process.exit(1);
}
const logo = "data:image/png;base64," + fs.readFileSync(path.join(dir, "logo.png")).toString("base64");
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");

let html = rd("index.html");
const before = html.length;
html = html.replace('<link rel="icon" href="logo.png" />', '<link rel="icon" href="' + logo + '" />');
html = html.replace('<link rel="stylesheet" href="style.css" />', "<style>\n" + rd("style.css") + "\n</style>");
html = html.split('src="logo.png"').join('src="' + logo + '"');

const order = ["app.js", "optimizer.js", "netopt.js", "multiplayer.js"];
let first = true;
for (const f of order) {
  const tag = '<script src="' + f + '"></script>';
  if (!html.includes(tag)) {
    console.error("Não achei " + tag + " no index.html");
    process.exit(1);
  }
  const pre = first && site ? "<script>window.__PLAYHUB_SITE__=" + JSON.stringify(site) + ";</script>\n" : "";
  first = false;
  html = html.replace(tag, () => pre + "<script>\n" + safe(rd(f)) + "\n</script>");
}
// No arquivo único o service worker não existe (e em file:// o navegador não deixa registrar).
const out = path.join(dir, "playhub-unico.html");
fs.writeFileSync(out, html);
console.log("Pronto: " + out + " (" + Math.round(html.length / 1024) + " KB)");
console.log(site ? "Multiplayer ligado a: " + site : "Aviso: sem endereço do site, o multiplayer usa só servidores públicos de apoio.");
if (before === html.length) process.exit(1);
