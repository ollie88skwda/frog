// Import rows → set_no. A unilateral set is two rows (left + right) sharing
// one set_no; an adjacent opposite-side row closes the open pair. Dependency
// free so convex/sessions.ts (importBatch) can import it directly.

export function pairSetNos(rows: { side?: string | null }[]): number[] {
  const out: number[] = [];
  let setNo = -1;
  let open: string | null = null;
  for (const r of rows) {
    const side = r.side === "left" || r.side === "right" ? r.side : null;
    if (side && open && side !== open) open = null;
    else {
      setNo++;
      open = side;
    }
    out.push(setNo);
  }
  return out;
}

/** Physical sets in a list of import rows (an L/R pair counts once). */
export const physicalSetCount = (rows: { side?: string | null }[]) =>
  (pairSetNos(rows).at(-1) ?? -1) + 1;
