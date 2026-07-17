// Generates the PWA/app PNG icons from the frog-eye mark — no external assets,
// no runtime dep (Playwright is already a devDependency). Re-run after a rebrand:
//   bun scripts/gen-pwa-icons.ts
// Emits into apps/web/public/: icon-192.png, icon-512.png,
// icon-maskable-512.png (safe-zone padded), apple-touch-icon.png (180, opaque).
import { chromium } from "playwright";

const BG = "#101211"; // Radix sage-1 (dark app background)
const FG = "#eceeed"; // Radix sage-12
const ACCENT = "#46a758"; // Radix grass-9 (the app's --brand)

// The frog-eye mark (docs/brand/frog-brand-identity.html): heavy-lidded eye,
// grass pupil — the brand's one permitted circle. Mirrors public/icon.svg.
function eye(inner: number): string {
  const stroke = Math.max(2, Math.round(inner * 0.043));
  return `<svg width="${inner}" height="${inner}" viewBox="0 0 512 512" fill="none">
    <circle cx="256" cy="256" r="150" stroke="${FG}" stroke-width="${Math.round((stroke / inner) * 512)}"/>
    <path d="M128 213 Q256 149 384 213" stroke="${FG}" stroke-width="${Math.round((stroke / inner) * 512)}"/>
    <circle cx="256" cy="267" r="43" fill="${ACCENT}"/>
  </svg>`;
}

// One icon as an HTML page rendered at `size`; `pad` is the maskable safe-zone
// inset (fraction of the canvas kept clear of the mark on every side).
function page(size: number, opts: { radius: number; pad: number }): string {
  const inner = Math.round(size * (1 - opts.pad * 2));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${size}px;height:${size}px}
    .icon{width:${size}px;height:${size}px;background:${BG};
      border-radius:${opts.radius}px;display:flex;align-items:center;
      justify-content:center;position:relative;overflow:hidden}
    svg{display:block}
  </style></head><body>
    <div class="icon">${eye(inner)}</div>
  </body></html>`;
}

const targets = [
  { file: "icon-192.png", size: 192, radius: 36, pad: 0 },
  { file: "icon-512.png", size: 512, radius: 96, pad: 0 },
  // Maskable: keep the mark inside the ~80% safe zone (platforms crop edges).
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
