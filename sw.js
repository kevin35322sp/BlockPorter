self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (key) { return caches.delete(key); }));
  }).then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  event.respondWith(fetch(event.request, { cache: "no-store" }).then(function (response) {
    if (response.status === 404 && /\/order\d{17}$/.test(url.pathname)) {
      return response.text().then(function (body) {
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      });
    }
    return response;
  }).catch(function () {
    return fetch(event.request);
  }));
});
