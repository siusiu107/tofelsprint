// sw.js - block direct navigation to raw data files (reading/listening)
// Note: This only works after the service worker is installed (open the main page once).
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

function isBlocked(pathname){
  return pathname.includes('/data/reading/') || pathname.includes('/data/listening/');
}

function denyHtml(){
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>잘못된 접근</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#fff;}
    .wrap{max-width:720px;margin:0 auto;padding:28px;}
    .card{border:1px solid #eee;border-radius:18px;padding:18px 18px 14px;box-shadow:0 8px 22px rgba(0,0,0,.06)}
    .title{font-weight:800;font-size:22px;margin:0}
    .muted{color:#666;margin-top:10px;line-height:1.6}
    a{display:inline-block;margin-top:14px;text-decoration:none;color:#5b2bd6;font-weight:700}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1 class="title">잘못된 접근입니다</h1>
      <div class="muted">
        이 경로는 앱 내부에서만 사용돼요. 홈으로 돌아가서 이용해줘.
      </div>
      <a href="/">홈으로</a>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if(!isBlocked(url.pathname)) return;

  // Allow app fetches (txt/mp3/json) but block direct navigation (address bar/new tab).
  if(req.mode === 'navigate'){
    event.respondWith(denyHtml());
  }
});
