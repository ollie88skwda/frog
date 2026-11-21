// What did the user drop? Sniff by magic bytes first (names and MIME types lie,
// especially for files shared from a phone), then extension, so one drop zone
// can route any file. Pure and synchronous: callers pass the first bytes.

export type InputKind =
  | "image"
  | "pdf"
  | "xlsx"
  | "json"
  | "csv"
  | "text"
  | "unsupported";

export type InputInfo = {
  kind: InputKind;
  /** Short reason for the unsupported message ("a Word document"). */
  what?: string;
  /** HEIC/HEIF needs a decoder the browser may lack. */
  heic?: boolean;
};

const starts = (b: Uint8Array, ...sig: number[]) =>
  sig.every((v, i) => b[i] === v);
const ascii = (b: Uint8Array, at: number, s: string) =>
  [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

export function detectInputKind(
  name: string,
  mime: string,
  head: Uint8Array,
): InputInfo {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  if (starts(head, 0x89, 0x50, 0x4e, 0x47) || starts(head, 0xff, 0xd8, 0xff))
    return { kind: "image" };
  if (starts(head, 0x47, 0x49, 0x46, 0x38)) return { kind: "image" };
  if (ascii(head, 0, "RIFF") && ascii(head, 8, "WEBP"))
    return { kind: "image" };
  if (ascii(head, 4, "ftyp")) {
    const brand = String.fromCharCode(...head.slice(8, 12)).toLowerCase();
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(brand))
      return { kind: "image", heic: true };
    if (/^(avif|avis)/.test(brand)) return { kind: "image" };
    return { kind: "unsupported", what: "a video" };
  }
  if (ascii(head, 0, "%PDF")) return { kind: "pdf" };
  if (starts(head, 0x50, 0x4b, 0x03, 0x04)) {
    if (ext === "xlsx" || /spreadsheetml/.test(mime)) return { kind: "xlsx" };
    if (ext === "docx") return { kind: "unsupported", what: "a Word document" };
    if (ext === "pptx") return { kind: "unsupported", what: "a presentation" };
    if (ext === "zip" || mime === "application/zip")
      return { kind: "unsupported", what: "a zip archive; unzip it first" };
    return { kind: "xlsx" }; // unknown zip: try as a workbook, fail clearly
  }
  if (starts(head, 0xd0, 0xcf, 0x11, 0xe0))
    return {
      kind: "unsupported",
      what: "an old .xls or .doc file; save it as .xlsx or CSV",
    };
  if (/^(heic|heif)$/.test(ext)) return { kind: "image", heic: true };
  if (/^(png|jpe?g|gif|webp|bmp)$/.test(ext) || mime.startsWith("image/"))
    return { kind: "image" };
  if (ext === "pdf" || mime === "application/pdf") return { kind: "pdf" };
  if (ext === "xlsx") return { kind: "xlsx" };
  if (
    [
      "doc",
      "docx",
      "pages",
      "numbers",
      "key",
      "ppt",
      "pptx",
      "xls",
      "mp4",
      "mov",
    ].includes(ext)
  )
    return {
      kind: "unsupported",
      what: `a .${ext} file; export it as PDF, CSV or a screenshot`,
    };
  // Text: refuse binary (NUL bytes) outright.
  if (head.some((v) => v === 0))
    return { kind: "unsupported", what: "a binary file Frog can't read" };
  const text = new TextDecoder()
    .decode(head)
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (ext === "json" || mime === "application/json" || /^[[{]/.test(text))
    return { kind: "json" };
  if (ext === "csv" || ext === "tsv" || mime === "text/csv")
    return { kind: "csv" };
  return { kind: "text" };
}

export function unsupportedMessage(name: string, info: InputInfo): string {
  return `${name} is ${info.what ?? "a type Frog can't read"}. Frog reads screenshots and photos (PNG, JPG, HEIC), PDF, CSV, JSON, XLSX and plain text.`;
}
