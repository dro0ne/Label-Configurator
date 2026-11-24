/* При открытии страницы получаем актуальные файлы, обходя HTTP-кэш браузера.
   Область действия ограничена папкой этого сайта; пользовательские данные
   и хранилище браузера не изменяются. */
'use strict';

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  var request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(request, { cache: 'no-store' }).then(async function (response) {
    /* Убираем длительное кэширование и у ответа: иначе браузер может
       повторно использовать файл из памяти, не обращаясь к worker. */
    var headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.delete('Content-Length'); headers.delete('Content-Encoding');
    var body = response.body;
    if (request.mode === 'navigate' && response.ok && /text\/html/i.test(headers.get('Content-Type') || '')) {
      var fresh = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      body = (await response.text()).replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=)(["'])([^"']+)\2/gi, function (match, prefix, quote, value) {
        var asset = new URL(value, request.url);
        if (asset.origin !== self.location.origin || !asset.href.startsWith(self.registration.scope)) return match;
        /* Новый адрес исключает и старые копии в памяти, появившиеся
           ещё до установки автообновления. Внешние библиотеки не меняем. */
        asset.searchParams.set('__lc_fresh', fresh);
        return prefix + quote + asset.pathname + asset.search + asset.hash + quote;
      });
    }
    return new Response(body, { status: response.status, statusText: response.statusText, headers: headers });
  }).catch(function () {
    /* Если сеть недоступна, браузер ещё может открыть сохранённую копию. */
    return fetch(request, { cache: 'force-cache' });
  }));
});
