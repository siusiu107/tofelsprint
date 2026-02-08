// Cloudflare Pages Function: block direct navigation to /data/*
// Allows in-app fetch/audio loads via context.next()

const BLOCK_HTML = `<!doctype html><meta charset="utf-8">
<title>잘못된 접근</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;line-height:1.5}
  .card{max-width:720px;border:1px solid #e5e7eb;border-radius:16px;padding:24px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  h2{margin:0 0 8px}
  p{margin:8px 0}
  a{color:#6d28d9}
</style>
<div class="card">
  <h2>잘못된 접근입니다</h2>
  <p>문제/오디오는 앱 화면에서만 접근할 수 있어요.</p>
  <p><a href="/">홈으로 이동</a></p>
</div>`;

export async function onRequest(context) {
  const req = context.request;
  const mode = req.headers.get("Sec-Fetch-Mode") || "";
  const dest = req.headers.get("Sec-Fetch-Dest") || "";
  const accept = req.headers.get("Accept") || "";

  // Address bar / refresh / open-in-new-tab => document navigation
  const isDocumentNav =
    mode === "navigate" ||
    dest === "document" ||
    accept.includes("text/html");

  if (isDocumentNav) {
    return new Response(BLOCK_HTML, {
      status: 403,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  // Let fetch/audio/XHR pass through to static asset
  return context.next();
}
