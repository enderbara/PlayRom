/* PlayRom.io - service worker OTIMIZADO
   Injeta COOP/COEP no formato "require-corp" exigido pelo EmulatorJS para PSP,
   garantindo acesso total ao hardware (multi-threads). */

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

  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 0) return res;

        const headers = new Headers(res.headers);
        
        // 🔥 MUDANÇA CRUCIAL: Força o padrão que o emulador de PSP precisa para rodar pesado
        headers.set("Cross-Origin-Embedder-Policy", "require-corp");
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
