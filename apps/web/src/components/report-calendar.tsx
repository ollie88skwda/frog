import { localDateKey } from "@sbl/core";

// Read-only month grids for the reports (M10). The monthly report shows one
// numbered month with workout days filled; the year review shows a 12-month
// strip of dot grids. Both key cells off the same local YYYY-MM-DD the report
// builders emit in `workoutDays`, so a filled cell means "≥1 workout that day".

type Cell = { key: string; day: number | null };

const dayKey = (y: number, m: number, d: number) =>
  localDateKey(new Date(y, m, d).getTime());

function monthCells(year: number, month: number, firstWeekday: number): Cell[] {
  const lead = (new Date(year, month, 1).getDay() - firstWeekday + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Cell[] = [];
  for (let i = 0; i < lead; i++) {
    const d = new Date(year, month, 1 - (lead - i));
    cells.push({
      key: `pad-${dayKey(d.getFullYear(), d.getMonth(), d.getDate())}`,
      day: null,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: dayKey(year, month, d), day: d });
  }
  return cells;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Full numbered month; workout days filled accent. */
export function MonthHeatGrid({
  year,
  month,
  firstWeekday,
  workoutDays,
  testId,
}: {
  year: number;
  month: number;
  firstWeekday: number;
  workoutDays: Set<string>;
  testId?: string;
}) {
  const headers = Array.from(
    { length: 7 },
    (_, i) => WEEKDAYS[(firstWeekday + i) % 7],
  );
  const cells = monthCells(year, month, firstWeekday);
  return (
    <div data-testid={testId}>
      <div className="grid grid-cols-7">
        {headers.map((h) => (
          <div
            key={h}
            className="pb-1 text-center text-2xs font-medium text-faint"
          >
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          if (c.day == null) return <div key={c.key} />;
          const has = workoutDays.has(c.key);
          return (
            <div
              key={c.key}
              className={`flex aspect-square items-center justify-center text-xs ${
                has
                  ? "bg-accent font-semibold text-accent-fg"
                  : "bg-surface-2 text-faint"
              }`}
              data-testid={has ? `report-day-${c.key}` : undefined}
            >
              {c.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tiny dot grid for the year strip; workout days as accent squares. */
export function MonthDots({
  year,
  month,
  firstWeekday,
  workoutDays,
}: {
  year: number;
  month: number;
  firstWeekday: number;
  workoutDays: Set<string>;
}) {
  const cells = monthCells(year, month, firstWeekday);
  return (
    <div className="grid grid-cols-7 gap-px">
      {cells.map((c) => {
        if (c.day == null) return <div key={c.key} className="aspect-square" />;
        const has = workoutDays.has(c.key);
        return (
          <div
            key={c.key}
            className={`aspect-square ${has ? "bg-accent" : "bg-surface-2"}`}
          />
        );
      })}
    </div>
  );
}
