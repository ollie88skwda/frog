// Any files -> ImportDraft, on this device. Lazy chunk (the import screen
// loads it only when something is dropped). Images (PNG/JPG/WebP, HEIC via a
// decoder loaded only for HEIC) are OCR'd with geometry; PDFs use their text
// layer when they have one, otherwise their pages are rendered and OCR'd; text,
// CSV, JSON and XLSX go through the existing parsers. Nothing is uploaded.
import {
  type Bitmap,
  detectInputKind,
  type FileParseResult,
  type ImageRead,
  type ImportDraft,
  type InputInfo,
  type PageLine,
  parseImportFile,
  parseWorkoutText,
  readScan,
  readsToDraft,
  scanBitmap,
  unsupportedMessage,
  type WeightUnit,
  xlsxToCsv,
} from "@frog/core";
import {
  createUniversalEngine,
  type UniversalEngine,
} from "./tesseract-regions";

export type Progress = { label: string; fraction: number };

export type UniversalResult = {
  draft: ImportDraft;
  /** Present when exactly one CSV-like file needs its columns mapped. */
  file: FileParseResult | null;
  /** Everything the OCR / text layer read, for the manual fallback box. */
  rawText: string;
  /** Per-file problems (unsupported type, unreadable) that did not stop the rest. */
  problems: string[];
};

const MAX_SIDE = 3200;

async function toBitmap(src: Blob | ImageBitmap): Promise<Bitmap> {
  const bmp = src instanceof Blob ? await createImageBitmap(src) : src;
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't read image pixels.");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const d = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

async function decodeImage(f: File, info: InputInfo): Promise<Bitmap> {
  try {
    return await toBitmap(f);
  } catch (e) {
    if (!info.heic)
      throw new Error(`${f.name} could not be opened as an image.`, {
        cause: e,
      });
  }
  // Chrome/Firefox can't decode HEIC; the decoder (WASM) loads only now.
  const { heicTo } = await import("heic-to");
  const jpeg = await heicTo({ blob: f, type: "image/jpeg", quality: 0.95 });
  return toBitmap(jpeg);
}

async function pdfPages(
  f: File,
  onProgress: (p: Progress) => void,
): Promise<{ text: string; images: Bitmap[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await f.arrayBuffer()),
  }).promise;
  const pages = Math.min(doc.numPages, 12);
  let text = "";
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Rebuild lines from item positions (y changes = new line).
    let lastY: number | null = null;
    for (const it of content.items as {
      str?: string;
      transform?: number[];
    }[]) {
      if (it.str == null || !it.transform) continue;
      const y = Math.round(it.transform[5]);
      if (lastY != null && Math.abs(y - lastY) > 3) text += "\n";
      else if (lastY != null) text += " ";
      text += it.str;
      lastY = y;
    }
    text += "\n";
  }
  if (text.replace(/\s/g, "").length > 40) return { text, images: [] };
  const images: Bitmap[] = [];
  for (let i = 1; i <= pages; i++) {
    onProgress({ label: `Rendering PDF page ${i}`, fraction: i / pages });
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2.2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvas, viewport: vp }).promise;
    images.push(await toBitmap(await createImageBitmap(canvas)));
  }
  return { text: "", images };
}

function mergeDrafts(
  drafts: ImportDraft[],
  unit: WeightUnit,
  problems: string[],
): ImportDraft {
  if (drafts.length === 1) return drafts[0];
  const first = drafts[0];
  const out: ImportDraft = {
    ...first,
    sessions: [],
    routines: [],
    unparsed: [],
    notes: [],
  };
  out.unit = unit;
  for (const d of drafts) {
    if (d.unit !== out.unit) {
      const n = d.sessions.length + d.routines.length;
      problems.push(
        `${n} workout${n === 1 ? "" : "s"} in ${d.unit} were left out; import them separately.`,
      );
      continue;
    }
    out.sessions.push(...d.sessions);
    out.routines.push(...d.routines);
    out.unparsed.push(...d.unparsed);
    out.notes.push(...d.notes.filter((n) => !out.notes.includes(n)));
  }
  return out;
}

export async function filesToImportResult(
  files: File[],
  unit: WeightUnit,
  onProgress: (p: Progress) => void,
): Promise<UniversalResult> {
  const problems: string[] = [];
  const drafts: ImportDraft[] = [];
  const reads: ImageRead[] = [];
  let rawText = "";
  let file: FileParseResult | null = null;
  const textFiles: { name: string; body: string; info: InputInfo }[] = [];
  const bitmaps: { name: string; bm: Bitmap }[] = [];

  for (const f of files) {
    const head = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
    const info = detectInputKind(f.name, f.type, head);
    try {
      switch (info.kind) {
        case "unsupported":
          problems.push(unsupportedMessage(f.name, info));
          break;
        case "image":
          bitmaps.push({ name: f.name, bm: await decodeImage(f, info) });
          break;
        case "pdf": {
          const { text, images } = await pdfPages(f, onProgress);
          if (text)
            textFiles.push({
              name: f.name,
              body: text,
              info: { kind: "text" },
            });
          for (const bm of images) bitmaps.push({ name: f.name, bm });
          break;
        }
        case "xlsx":
          textFiles.push({
            name: f.name,
            body: await xlsxToCsv(new Uint8Array(await f.arrayBuffer())),
            info: { kind: "csv" },
          });
          break;
        default:
          textFiles.push({ name: f.name, body: await f.text(), info });
      }
    } catch (e) {
      problems.push(
        `${f.name}: ${e instanceof Error ? e.message : "could not be read."}`,
      );
    }
  }

  const csvLike = textFiles.filter(
    (t) => t.info.kind === "csv" || t.info.kind === "json",
  );
  for (const t of textFiles) {
    rawText += `${t.body}\n`;
    if (t.info.kind === "text") {
      drafts.push(parseWorkoutText(t.body, { defaultUnit: unit }));
    } else {
      const r = parseImportFile(t.body, { defaultUnit: unit });
      if (
        r.rows &&
        r.mapping &&
        csvLike.length === 1 &&
        r.draft.sessions.length === 0
      )
        file = r;
      else if (r.draft.sessions.length === 0 && r.format !== "generic-csv")
        problems.push(
          `${t.name}: no sessions found. Is this the right export?`,
        );
      else if (r.draft.sessions.length === 0)
        problems.push(`${t.name}: no workouts found in that file's columns.`);
      if (r.draft.sessions.length > 0 || file === r) {
        if (csvLike.length === 1) file = r.rows ? r : null;
        drafts.push(r.draft);
      }
    }
  }

  if (bitmaps.length > 0) {
    let engine: UniversalEngine | null = null;
    try {
      onProgress({ label: "Loading the reader", fraction: 0 });
      engine = await createUniversalEngine();
      for (const [i, b] of bitmaps.entries()) {
        onProgress({
          label: `Reading image ${i + 1} of ${bitmaps.length}`,
          fraction: i / bitmaps.length,
        });
        const scan = await scanBitmap(b.bm, engine.engine);
        const read = await readScan(scan);
        reads.push(read);
        rawText += `${scan.lines.map((l: PageLine) => l.text).join("\n")}\n`;
      }
    } finally {
      await engine?.dispose();
    }
    drafts.push(readsToDraft(reads, { defaultUnit: unit }));
  }

  const usable = drafts.filter(
    (d) => d.sessions.length + d.routines.length > 0,
  );
  const draft = usable.length
    ? mergeDrafts(usable, usable[0].unit, problems)
    : (drafts[0] ?? readsToDraft([], { defaultUnit: unit }));
  return { draft, file, rawText: rawText.trim(), problems };
}
