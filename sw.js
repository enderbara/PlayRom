/* PlayRom.io - Service Worker Limpo */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Evita erros de cache em requisições de outras origens
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 0) return res;

        const headers = new Headers(res.headers);
        
        // Configuração amigável que libera o emulador e NÃO bloqueia ícones ou CDNs externos
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        headers.set("Cross-Origin-Embedder-Policy", "credentialless");

        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      })
      .catch((err) => {
        console.error("[sw] Erro de rede:", err);
        return Response.error();
      })
  );
});
