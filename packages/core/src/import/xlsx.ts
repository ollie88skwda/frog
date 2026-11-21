// Minimal .xlsx reader -> CSV text, so a spreadsheet takes exactly the same
// route as a CSV export (format sniffing, column mapping, review). An .xlsx is
// a zip of XML; this reads the zip directory, inflates the first worksheet and
// the shared-strings table with the platform's DecompressionStream, and emits
// rows. No dependency; formulas read as their cached values; dates stay as
// Excel serial numbers unless the cell style is a date format (converted to ISO).

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

type Entry = { name: string; method: number; csize: number; offset: number };

function zipEntries(b: Uint8Array): Entry[] {
  let e = b.length - 22;
  while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Not a valid .xlsx file (no zip directory).");
  const n = u16(b, e + 10);
  let p = u32(b, e + 16);
  const out: Entry[] = [];
  for (let i = 0; i < n; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error("Corrupt .xlsx file.");
    const nameLen = u16(b, p + 28);
    out.push({
      method: u16(b, p + 10),
      csize: u32(b, p + 20),
      offset: u32(b, p + 42),
      name: new TextDecoder().decode(b.slice(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + u16(b, p + 30) + u16(b, p + 32);
  }
  return out;
}

async function read(b: Uint8Array, en: Entry): Promise<string> {
  const o = en.offset;
  const start = o + 30 + u16(b, o + 26) + u16(b, o + 28);
  const raw = b.slice(start, start + en.csize);
  if (en.method === 0) return new TextDecoder().decode(raw);
  if (en.method !== 8) throw new Error("Unsupported zip compression in .xlsx.");
  const stream = new Blob([raw as unknown as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

const colIndex = (ref: string) => {
  let n = 0;
  for (const c of /^[A-Z]+/.exec(ref)?.[0] ?? "")
    n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
};

const csvCell = (v: string) =>
  /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export async function xlsxToCsv(bytes: Uint8Array): Promise<string> {
  const entries = zipEntries(bytes);
  const by = (n: string) => entries.find((x) => x.name === n);
  const sheetName =
    by("xl/worksheets/sheet1.xml")?.name ??
    entries
      .filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x.name))
      .sort((a, c) => a.name.localeCompare(c.name))[0]?.name;
  if (!sheetName) throw new Error("No worksheet found in that .xlsx file.");
  const strings: string[] = [];
  const ss = by("xl/sharedStrings.xml");
  if (ss)
    for (const m of (await read(bytes, ss)).matchAll(
      /<si[^>]*>([\s\S]*?)<\/si>/g,
    ))
      strings.push(
        unxml(
          [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((t) => t[1])
            .join(""),
        ),
      );
  // Date styles: cellXfs whose numFmtId is a date/time format.
  const dateXf = new Set<number>();
  const st = by("xl/styles.xml");
  if (st) {
    const xml = await read(bytes, st);
    const custom = new Set<number>();
    for (const m of xml.matchAll(
      /<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g,
    ))
      if (/[ymdh]/i.test(m[2].replace(/"[^"]*"|\[[^\]]*\]/g, "")))
        custom.add(Number(m[1]));
    const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
    [...xfs.matchAll(/<xf\b[^>]*>/g)].forEach((m, i) => {
      const id = Number(/\bnumFmtId="(\d+)"/.exec(m[0])?.[1] ?? 0);
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || custom.has(id))
        dateXf.add(i);
    });
  }
  const sheet = await read(bytes, by(sheetName) as Entry);
  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "";
      const t = /\bt="(\w+)"/.exec(attrs)?.[1];
      const s = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const body = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = "";
      if (t === "s" && v != null) val = strings[Number(v)] ?? "";
      else if (t === "inlineStr")
        val = unxml(
          [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((x) => x[1])
            .join(""),
        );
      else if (v != null) {
        val = unxml(v);
        if (t !== "str" && t !== "b" && dateXf.has(s) && Number(val) > 59) {
          const ms = Math.round((Number(val) - 25569) * 86400_000);
          const d = new Date(ms);
          val =
            Number(val) % 1
              ? d.toISOString().slice(0, 19).replace("T", " ")
              : d.toISOString().slice(0, 10);
        }
      }
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(Array.from(row, (c) => c ?? ""));
  }
  if (rows.length === 0) throw new Error("That .xlsx file has no rows.");
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
