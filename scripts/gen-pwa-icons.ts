// Generates the PWA/app PNG icons from a monogram — no external assets, no
// runtime dep (Playwright is already a devDependency). Re-run after a rebrand:
//   bun scripts/gen-pwa-icons.ts
// Emits into apps/web/public/: icon-192.png, icon-512.png,
// icon-maskable-512.png (safe-zone padded), apple-touch-icon.png (180, opaque).
import { chromium } from "playwright";
import { APP_NAME } from "../packages/core/src/config";

const BG = "#111113"; // Radix slate-1 (dark app background)
const FG = "#e8eaed";
const ACCENT = "#5b5bd6"; // Radix indigo-9

const monogram = APP_NAME.slice(0, 3).toUpperCase();

// One icon as an HTML page rendered at `size`; `pad` is the maskable safe-zone
// inset (fraction of the canvas kept clear of the monogram on every side).
function page(size: number, opts: { radius: number; pad: number }): string {
  const inner = Math.round(size * (1 - opts.pad * 2));
  const fontSize = Math.round(inner * (monogram.length >= 3 ? 0.32 : 0.46));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${size}px;height:${size}px}
    .icon{width:${size}px;height:${size}px;background:${BG};
      border-radius:${opts.radius}px;display:flex;align-items:center;
      justify-content:center;position:relative;overflow:hidden}
    .ring{position:absolute;inset:${Math.round(size * 0.06)}px;
      border:${Math.max(2, Math.round(size * 0.016))}px solid ${ACCENT};
      border-radius:${Math.round(opts.radius * 0.85)}px;opacity:.4}
    .mono{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
      font-weight:650;letter-spacing:-.04em;color:${FG};
      font-size:${fontSize}px;line-height:1}
  </style></head><body>
    <div class="icon"><div class="ring"></div><div class="mono">${monogram}</div></div>
  </body></html>`;
}

const targets = [
  { file: "icon-192.png", size: 192, radius: 36, pad: 0 },
  { file: "icon-512.png", size: 512, radius: 96, pad: 0 },
  // Maskable: keep the monogram inside the ~80% safe zone (platforms crop edges).
  { file: "icon-maskable-512.png", size: 512, radius: 0, pad: 0.14 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, pad: 0 },
];

const browser = await chromium.launch();
const outDir = new URL("../apps/web/public/", import.meta.url);
for (const t of targets) {
  const p = await browser.newPage({
    viewport: { width: t.size, height: t.size },
  });
  await p.setContent(page(t.size, { radius: t.radius, pad: t.pad }));
  const el = await p.$(".icon");
  await el?.screenshot({ path: new URL(t.file, outDir).pathname });
  await p.close();
  console.log(`wrote apps/web/public/${t.file} (${t.size}px)`);
}
await browser.close();
