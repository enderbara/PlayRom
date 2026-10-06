/* PlayRom.io - Service Worker Corrigido */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 0) return res;

        const headers = new Headers(res.headers);
        
        // Ativa o isolamento de hardware de maneira amigável a CDNs externos
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        headers.set("Cross-Origin-Embedder-Policy", "credentialless");

        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      })
      .catch((err) => {
        console.error("[sw] Falha no fetch:", err);
        return Response.error();
      })
  );
});
