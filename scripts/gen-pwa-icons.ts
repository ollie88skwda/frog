// Generates the PWA/app PNG icons + the inline brand-mark asset from the
// frog character reference photo (docs/brand/assets/frog-logo-reference.jpg)
// — no external raster deps: background removal (white-key -> alpha) and all
// compositing happens in a headless Chromium <canvas>, the same tool already
// used for e2e (Playwright is a devDependency either way).
// Re-run after the source artwork changes:
//   bun scripts/gen-pwa-icons.ts
// Emits into apps/web/public/: icon-192.png, icon-512.png,
// icon-maskable-512.png (safe-zone padded), apple-touch-icon.png (180, opaque),
// favicon-32.png, favicon-16.png.
// Emits into apps/web/src/assets/: frog-mark.png — a transparent, tightly
// cropped cutout (no background square) for inline use next to the wordmark
// in the shell sidebar and auth screen.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BG = "#101211"; // Radix sage-1 (dark app background)
const SOURCE = new URL(
  "../docs/brand/assets/frog-logo-reference.jpg",
  import.meta.url,
);
const PUBLIC_DIR = new URL("../apps/web/public/", import.meta.url);
const ASSETS_DIR = new URL("../apps/web/src/assets/", import.meta.url);

const squareTargets = [
  { file: "icon-192.png", size: 192, radius: 36, pad: 0 },
  { file: "icon-512.png", size: 512, radius: 96, pad: 0 },
  // Maskable: keep the mark inside the ~80% safe zone (platforms crop edges).
  { file: "icon-maskable-512.png", size: 512, radius: 0, pad: 0.14 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, pad: 0 },
  { file: "favicon-32.png", size: 32, radius: 6, pad: 0 },
  { file: "favicon-16.png", size: 16, radius: 3, pad: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(
  "<!doctype html><html><body style='margin:0'></body></html>",
);

const sourceDataUrl = `data:image/jpeg;base64,${readFileSync(SOURCE).toString("base64")}`;

// Key the source's flat white background out to alpha (distance-from-white
// threshold, smoothed over a small band so anti-aliased edges stay soft),
// then trim to the opaque content's bounding box + a small margin.
const cutout: { dataUrl: string; width: number; height: number } =
  await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    const lo = 8;
    const hi = 45;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const dist = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
      const alpha = Math.max(0, Math.min(1, (dist - lo) / (hi - lo)));
      d[i + 3] = Math.round(alpha * 255);
      if (alpha > 0.02) {
        const x = (i / 4) % canvas.width;
        const y = Math.floor(i / 4 / canvas.width);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    const padX = Math.round((maxX - minX) * 0.04);
    const padY = Math.round((maxY - minY) * 0.04);
    const bx = Math.max(0, minX - padX);
    const by = Math.max(0, minY - padY);
    const bw = Math.min(canvas.width, maxX + padX) - bx;
    const bh = Math.min(canvas.height, maxY + padY) - by;
    const trimmed = document.createElement("canvas");
    trimmed.width = bw;
    trimmed.height = bh;
    trimmed.getContext("2d")!.drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
    return { dataUrl: trimmed.toDataURL("image/png"), width: bw, height: bh };
  }, sourceDataUrl);

// Square app icon: bg-filled rounded square with the cutout centered inside
// a (1 - 2*pad) safe box, preserving aspect ratio.
async function composeSquare(
  size: number,
  radius: number,
  pad: number,
): Promise<Buffer> {
  const dataUrl: string = await page.evaluate(
    async ({ cutoutUrl, cw, ch, size, radius, pad, bg }) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const r = radius;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(size, 0, size, size, r);
      ctx.arcTo(size, size, 0, size, r);
      ctx.arcTo(0, size, 0, 0, r);
      ctx.arcTo(0, 0, size, 0, r);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      const img = new Image();
      img.src = cutoutUrl;
      await img.decode();
      const box = size * (1 - pad * 2);
      const scale = Math.min(box / cw, box / ch);
      const dw = cw * scale;
      const dh = ch * scale;
      ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
      return canvas.toDataURL("image/png");
    },
    {
      cutoutUrl: cutout.dataUrl,
      cw: cutout.width,
      ch: cutout.height,
      size,
      radius,
      pad,
      bg: BG,
    },
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

// Inline brand-mark asset: the transparent cutout alone, no bg square,
// scaled to a modest max dimension (crisp at @3x for a ~24px inline mark).
async function composeTrimmed(maxDim: number): Promise<Buffer> {
  const dataUrl: string = await page.evaluate(
    async ({ cutoutUrl, cw, ch, maxDim }) => {
      const scale = maxDim / Math.max(cw, ch);
      const w = Math.round(cw * scale);
      const h = Math.round(ch * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      img.src = cutoutUrl;
      await img.decode();
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/png");
    },
    { cutoutUrl: cutout.dataUrl, cw: cutout.width, ch: cutout.height, maxDim },
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

for (const t of squareTargets) {
  const buf = await composeSquare(t.size, t.radius, t.pad);
  writeFileSync(new URL(t.file, PUBLIC_DIR), buf);
  console.log(`wrote apps/web/public/${t.file} (${t.size}px)`);
}

mkdirSync(ASSETS_DIR, { recursive: true });
const markBuf = await composeTrimmed(384);
writeFileSync(new URL("frog-mark.png", ASSETS_DIR), markBuf);
console.log("wrote apps/web/src/assets/frog-mark.png");

await browser.close();
