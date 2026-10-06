/* PlayRom.io - service worker
   1) Notificações: foca/abre o app ao clicar na notificação.
   2) PSP: injeta os cabeçalhos COOP/COEP nas respostas, para o navegador
      liberar SharedArrayBuffer (crossOriginIsolated) em hospedagens que não
      deixam configurar cabeçalhos, como o GitHub Pages.
      Usa COEP "credentialless", que não quebra o CDN do EmulatorJS, o Font
      Awesome nem o Google Fonts. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => {
      for (const c of l) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow("./");
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Evita um erro conhecido do Chrome com "only-if-cached" fora da mesma origem.
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;

  // Com COEP credentialless, pedidos cross-origin "no-cors" vão sem cookies.
  const request =
    req.mode === "no-cors" ? new Request(req, { credentials: "omit" }) : req;

  event.respondWith(
    fetch(request)
      .then((res) => {
        // Resposta opaca (status 0) não pode ser reescrita: devolve como veio.
        if (res.status === 0) return res;

        const headers = new Headers(res.headers);
        headers.set("Cross-Origin-Embedder-Policy", "credentialless");
        headers.set("Cross-Origin-Opener-Policy", "same-origin");

        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      })
      .catch((err) => {
        console.error("[sw] falha no fetch:", err);
        return Response.error();
      }),
  );
});
