// Import rows → dense set_no. A unilateral set is two rows (left + right)
// sharing one set_no; an adjacent opposite-side row closes the open pair, and
// when the source carries its own set number (Frog export) only rows sharing
// it pair. Dependency free so convex/sessions.ts (importBatch) can import it.

type PairRow = { side?: string | null; setNo?: number | null };

export function pairSetNos(rows: PairRow[]): number[] {
  const out: number[] = [];
  let setNo = -1;
  let open: string | null = null;
  let prevNo: number | null = null;
  for (const r of rows) {
    const side = r.side === "left" || r.side === "right" ? r.side : null;
    const no = r.setNo ?? null;
    if (side && open && side !== open && no === prevNo) open = null;
    else {
      setNo++;
      open = side;
    }
    prevNo = no;
    out.push(setNo);
  }
  return out;
}

/** Physical sets in a list of import rows (an L/R pair counts once). */
export const physicalSetCount = (rows: PairRow[]) =>
  (pairSetNos(rows).at(-1) ?? -1) + 1;
