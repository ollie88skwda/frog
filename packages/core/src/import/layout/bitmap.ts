// Pure RGBA bitmap helpers for re-reading a small region of a screenshot:
// crop, upscale, grayscale, Otsu binarise, invert. Platform-neutral (no DOM,
// no Node): the browser feeds it canvas ImageData, node scripts feed it pngjs.
// Binarising matters: tesseract drops digits ("115" -> "15") on the
// anti-aliased grey text of a phone screenshot but reads them off a hard 1-bit crop.

export type Bitmap = { width: number; height: number; data: Uint8ClampedArray };
export type Rect = { x0: number; y0: number; x1: number; y1: number };

export type PrepOptions = {
  /** Integer upscale applied after cropping. */
  scale?: number;
  binarize?: boolean;
  /** Force light-on-dark -> dark-on-light. "auto" inverts when the crop's background is dark. */
  invert?: boolean | "auto";
  /** White border in output px (tesseract wants breathing room). */
  pad?: number;
};

export function grayAt(b: Bitmap, x: number, y: number): number {
  const i = (y * b.width + x) * 4;
  return (b.data[i] * 299 + b.data[i + 1] * 587 + b.data[i + 2] * 114) / 1000;
}

/** Otsu threshold over a gray histogram. */
export function otsu(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

export function prepRegion(
  src: Bitmap,
  rect: Rect,
  opts: PrepOptions = {},
): Bitmap {
  const scale = opts.scale ?? 3;
  const pad = opts.pad ?? 12;
  const x0 = Math.max(0, Math.floor(rect.x0));
  const y0 = Math.max(0, Math.floor(rect.y0));
  const x1 = Math.min(src.width, Math.ceil(rect.x1));
  const y1 = Math.min(src.height, Math.ceil(rect.y1));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const gray = new Float32Array(w * h);
  const hist = new Array<number>(256).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const g = grayAt(src, x0 + x, y0 + y);
      gray[y * w + x] = g;
      hist[Math.round(g)]++;
    }
  const thr = otsu(hist, w * h);
  // Background = the more common side of the threshold.
  let dark = 0;
  for (let i = 0; i <= thr; i++) dark += hist[i];
  const darkBg = dark > (w * h) / 2;
  const invert = opts.invert === "auto" ? darkBg : (opts.invert ?? false);
  const ow = w * scale + pad * 2;
  const oh = h * scale + pad * 2;
  const out = new Uint8ClampedArray(ow * oh * 4).fill(255);
  for (let y = 0; y < h * scale; y++)
    for (let x = 0; x < w * scale; x++) {
      // bilinear sample of the gray crop
      const fx = Math.min(w - 1, x / scale);
      const fy = Math.min(h - 1, y / scale);
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const jx = Math.min(w - 1, ix + 1);
      const jy = Math.min(h - 1, iy + 1);
      const ax = fx - ix;
      const ay = fy - iy;
      let g =
        gray[iy * w + ix] * (1 - ax) * (1 - ay) +
        gray[iy * w + jx] * ax * (1 - ay) +
        gray[jy * w + ix] * (1 - ax) * ay +
        gray[jy * w + jx] * ax * ay;
      if (invert) g = 255 - g;
      if (opts.binarize) g = g > (invert ? 255 - thr : thr) ? 255 : 0;
      const o = ((y + pad) * ow + x + pad) * 4;
      out[o] = out[o + 1] = out[o + 2] = g;
      out[o + 3] = 255;
    }
  return { width: ow, height: oh, data: out };
}
