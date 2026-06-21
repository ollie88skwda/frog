// Minimal static server for the E2E web build (e2e/web). Serves the exported
// `dist-e2e` directory and the sql.js wasm at /sql-wasm.wasm. No special headers
// needed — sql.js is single-threaded and synchronous (unlike expo-sqlite's
// worker-based web driver). Playwright's webServer launches this.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../dist-e2e");
const SQL_WASM = require.resolve("sql.js/dist/sql-wasm.wasm");
const PORT = Number(process.env.E2E_PORT || 4319);

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function send(res, fp) {
  const data = fs.readFileSync(fp);
  res.setHeader("Content-Type", MIME[path.extname(fp)] || "application/octet-stream");
  res.end(data);
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);

    if (urlPath === "/sql-wasm.wasm") return send(res, SQL_WASM);

    let fp = path.join(ROOT, urlPath);
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) {
      fp = path.join(fp, "index.html");
    }
    if (fs.existsSync(fp)) return send(res, fp);

    // Expo static export emits per-route .html files; try that first.
    if (fs.existsSync(fp + ".html")) return send(res, fp + ".html");

    // SPA fallback so client-side routes (e.g. /session/<id>) resolve.
    return send(res, path.join(ROOT, "index.html"));
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[e2e] serving ${ROOT} on http://localhost:${PORT}`);
});
