import { FIRST_WEEKDAY, localDateKey, type Session } from "@frog/core";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Grid3x3, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { StreakCard } from "@/components/streak-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StatusRing } from "@/components/ui/status-ring";
import { formatDate, formatTime } from "@/lib/format";
import { useAllSessions } from "@/lib/profile-queries";
import { useRepo } from "@/lib/repo";
import { useVoice } from "@/lib/voice";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const monthYearFmt = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: "short" });

// Local midnight ms for a Y/M/D (calendar cells are local dates, never UTC).
const dayMs = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
const dayKey = (y: number, m: number, d: number) =>
  localDateKey(dayMs(y, m, d));

// The month view's cursor is a single absolute month index (year*12 + month) so
// paging never has to coordinate two pieces of state — which keeps the arrow-key
// effect's deps clean.
const toCursor = (y: number, m: number) => y * 12 + m;
const cursorYear = (c: number) => Math.floor(c / 12);
const cursorMonth = (c: number) => c - cursorYear(c) * 12;

// A calendar cell: a real day (1..N) or a leading blank. Blanks key off the
// previous month's date they visually sit on, so keys never derive from an
// array index.
type Cell = { key: string; day: number | null };

function monthCells(year: number, month: number): Cell[] {
  const lead = (new Date(year, month, 1).getDay() - FIRST_WEEKDAY + 7) % 7;
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

// A single day in the year-zoom contribution graph: `date` is null for the
// leading/trailing pad days that round the year out to full Sunday-start
// weeks (never rendered as a cell, just keeps the grid rectangular).
type YearCell = { key: string; date: Date | null };

// Sunday-start weeks spanning Jan 1..Dec 31 of `year`, padded at both ends to
// full 7-day weeks — the same column-per-week shape GitHub's contribution
// graph uses.
function yearWeeks(year: number): YearCell[][] {
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(year, 11, 31);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const weeks: YearCell[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: YearCell[] = [];
    for (let i = 0; i < 7; i++) {
      const inYear = cursor.getFullYear() === year;
      week.push({
        key: dayKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
        date: inYear ? new Date(cursor) : null,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// Sessions-logged intensity, GitHub-commit-graph style: 0 = no session that
// day, 1 = a normal training day, 2 = a heavier day (2 sessions), 3 = a peak
// day (3+) — see docs/DECISIONS.md 2026-07-30 for why session count (not
// volume) is the signal.
function intensityLevel(sessionCount: number): 0 | 1 | 2 | 3 {
  if (sessionCount <= 0) return 0;
  if (sessionCount === 1) return 1;
  if (sessionCount === 2) return 2;
  return 3;
}

const INTENSITY_BG = [
  "bg-surface-2",
  "bg-accent/35",
  "bg-accent/65",
  "bg-accent",
];
const YEAR_CELL = 11; // px
const YEAR_GAP = 3; // px
// Sunday-start row labels — only Mon/Wed/Fri text shown (GitHub's own
// convention): a label on every row reads as clutter at 11px row height.
const YEAR_ROW_LABELS = ["", "M", "", "W", "", "F", ""];

export default function CalendarScreen() {
  const navigate = useNavigate();
  const repo = useRepo();
  const qc = useQueryClient();
  const { data: sessions = [] } = useAllSessions();

  const now = new Date();
  const [view, setView] = useState<"month" | "year">("month");
  const [cursor, setCursor] = useState(() =>
    toCursor(now.getFullYear(), now.getMonth()),
  );
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const year = cursorYear(cursor);
  const month = cursorMonth(cursor);

  const starts = useMemo(() => sessions.map((s) => s.startedAt), [sessions]);

  // Sessions keyed by their local day, so a cell knows its (possibly multiple)
  // workouts in O(1).
  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const key = localDateKey(s.startedAt);
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values())
      list.sort((a, b) => a.startedAt - b.startedAt);
    return map;
  }, [sessions]);

  const [sheetDay, setSheetDay] = useState<string | null>(null);

  // Arrow keys page months (month view) or years (year view). Ignore when a
  // form control is focused so it keeps native keyboard behavior.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const delta = e.key === "ArrowRight" ? 1 : -1;
      if (view === "year") setViewYear((y) => y + delta);
      else setCursor((c) => c + delta);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  async function retroLog(key: string) {
    // Backdate to noon so the session lands squarely on the chosen local day,
    // then open the live editor (Hevy retro-log = a normal session you finish).
    const [y, m, d] = key.split("-").map(Number);
    const at = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
    const session = await repo.startSession();
    await repo.updateSessionStartedAt(session.id, at);
    void qc.invalidateQueries({ queryKey: ["active-session"] });
    void qc.invalidateQueries({ queryKey: ["sessions-all"] });
    navigate(`/session/${session.id}`);
  }

  const todayKey = localDateKey(Date.now());

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>
      </div>

      <div className="mt-4">
        <StreakCard starts={starts} />
      </div>

      {/* Pager + zoom. */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            view === "year"
              ? setViewYear((y) => y - 1)
              : setCursor((c) => c - 1)
          }
          className="flex size-9 items-center justify-center bg-translucent text-soft shadow-(--inset-control) transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
          data-testid="cal-prev"
          title="Previous"
        >
          <ChevronLeft className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (view === "month") {
              setViewYear(year);
              setView("year");
            } else {
              setView("month");
            }
          }}
          className="flex items-center gap-2 px-3 text-sm font-medium transition-colors duration-150 hover:text-soft"
          data-testid="cal-zoom"
          title={view === "month" ? "Zoom to year" : "Back to month"}
        >
          <Grid3x3 className="size-4 text-faint" />
          <span className="num" data-testid="cal-title">
            {view === "month"
              ? monthYearFmt.format(new Date(year, month, 1))
              : String(viewYear)}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            view === "year"
              ? setViewYear((y) => y + 1)
              : setCursor((c) => c + 1)
          }
          className="flex size-9 items-center justify-center bg-translucent text-soft shadow-(--inset-control) transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
          data-testid="cal-next"
          title="Next"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {view === "month" ? (
        <MonthGrid
          year={year}
          month={month}
          byDay={byDay}
          todayKey={todayKey}
          onDay={setSheetDay}
        />
      ) : (
        <YearGrid year={viewYear} byDay={byDay} />
      )}

      <Dialog
        open={sheetDay != null}
        onOpenChange={(o) => !o && setSheetDay(null)}
      >
        {sheetDay && (
          <DaySheet
            dayKey={sheetDay}
            sessions={byDay.get(sheetDay) ?? []}
            onLog={() => retroLog(sheetDay)}
            onClose={() => setSheetDay(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function MonthGrid({
  year,
  month,
  byDay,
  todayKey,
  onDay,
}: {
  year: number;
  month: number;
  byDay: Map<string, Session[]>;
  todayKey: string;
  onDay: (key: string) => void;
}) {
  const headers = Array.from(
    { length: 7 },
    (_, i) => WEEKDAYS[(FIRST_WEEKDAY + i) % 7],
  );
  const cells = monthCells(year, month);
  const todayMs = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  return (
    <div className="mt-4">
      <div className="grid grid-cols-7">
        {headers.map((h, i) => (
          <div
            key={h}
            className="pb-1 text-center text-2xs font-medium text-faint"
            data-testid={`cal-weekday-${i}`}
          >
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          if (c.day == null) return <div key={c.key} />;
          const d = c.day;
          const key = c.key;
          const list = byDay.get(key) ?? [];
          const has = list.length > 0;
          const isFuture = dayMs(year, month, d) > todayMs;
          const isToday = key === todayKey;

          if (isFuture && !has) {
            return (
              <div
                key={key}
                className="flex aspect-square items-center justify-center text-2xs text-faint opacity-40"
              >
                {d}
              </div>
            );
          }

          return (
            <button
              key={key}
              type="button"
              onClick={() => onDay(key)}
              className={`relative flex aspect-square items-center justify-center text-xs transition-colors duration-150 ${
                has
                  ? "bg-accent font-semibold text-accent-fg"
                  : "bg-surface-2 text-soft hover:bg-surface-hover"
              } ${isToday ? "shadow-[inset_0_0_0_1px_var(--ring)]" : ""}`}
              data-testid={`cal-day-${key}`}
              title={
                has
                  ? `${list.length} workout${list.length > 1 ? "s" : ""}`
                  : "Log a workout"
              }
            >
              <span data-testid={has ? `cal-filled-${key}` : undefined}>
                {d}
              </span>
              {list.length > 1 && (
                <span
                  className="num absolute right-0.5 bottom-0.5 flex min-w-3 items-center justify-center bg-surface px-0.5 text-[9px] leading-none text-accent"
                  data-testid={`cal-count-${key}`}
                >
                  {list.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Year zoom: a GitHub-contribution-graph — one column per Sunday-start week,
// one row per weekday, cell intensity = sessions logged that day (see
// docs/DECISIONS.md 2026-07-30). Glanceable data density over the old
// 12-mini-month grid; a full year of days doesn't fit a 390px viewport at any
// readable cell size, so the graph scrolls horizontally like GitHub's own
// mobile view. Cells are a data display, not tap targets (they're far under
// the 40px logging-path minimum by design, matching real GitHub) — the
// per-day interactions (retro-log, view sessions) stay in month view.
function YearGrid({
  year,
  byDay,
}: {
  year: number;
  byDay: Map<string, Session[]>;
}) {
  const weeks = useMemo(() => yearWeeks(year), [year]);
  const todayMs = Date.now();

  const total = useMemo(() => {
    let n = 0;
    for (const week of weeks)
      for (const c of week) if (c.date) n += (byDay.get(c.key) ?? []).length;
    return n;
  }, [weeks, byDay]);

  return (
    <div className="mt-4">
      <p className="text-2xs text-faint">
        <span className="num">{total}</span>{" "}
        {total === 1 ? "workout" : "workouts"} in {year}
      </p>
      <div className="mt-2 overflow-x-auto pb-1">
        <div className="inline-flex" style={{ gap: YEAR_GAP }}>
          <div className="flex shrink-0 flex-col" style={{ gap: YEAR_GAP }}>
            <div style={{ height: YEAR_CELL }} />
            {YEAR_ROW_LABELS.map((label, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-row weekday labels, never reordered
                key={i}
                className="flex items-center justify-end text-[9px] leading-none text-faint"
                style={{ height: YEAR_CELL, width: 10 }}
              >
                {label}
              </div>
            ))}
          </div>
          {weeks.map((week) => {
            const firstOfMonth = week.find((c) => c.date?.getDate() === 1);
            const label = firstOfMonth
              ? monthShortFmt.format(firstOfMonth.date as Date)
              : "";
            return (
              <div
                key={week[0].key}
                className="flex shrink-0 flex-col"
                style={{ gap: YEAR_GAP }}
              >
                <div
                  className="text-[9px] leading-none text-faint"
                  style={{ height: YEAR_CELL, width: YEAR_CELL * 2 }}
                >
                  {label}
                </div>
                {week.map((c) => {
                  if (!c.date)
                    return (
                      <div
                        key={c.key}
                        style={{ width: YEAR_CELL, height: YEAR_CELL }}
                      />
                    );
                  const list = byDay.get(c.key) ?? [];
                  const level = intensityLevel(list.length);
                  const isFuture = c.date.getTime() > todayMs;
                  return (
                    <div
                      key={c.key}
                      className={`relative ${INTENSITY_BG[level]} ${
                        isFuture && level === 0 ? "opacity-40" : ""
                      }`}
                      style={{ width: YEAR_CELL, height: YEAR_CELL }}
                      title={`${formatDate(c.date.getTime())}: ${list.length} workout${list.length === 1 ? "" : "s"}`}
                    >
                      {list.length > 0 && (
                        <span
                          className="absolute inset-0"
                          data-testid={`cal-filled-${c.key}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-2xs text-faint">
        Less
        {INTENSITY_BG.map((bg) => (
          <span
            key={bg}
            className={bg}
            style={{ width: YEAR_CELL, height: YEAR_CELL }}
          />
        ))}
        More
      </div>
    </div>
  );
}

function DaySheet({
  dayKey: key,
  sessions,
  onLog,
  onClose,
}: {
  dayKey: string;
  sessions: Session[];
  onLog: () => void;
  onClose: () => void;
}) {
  const { t } = useVoice();
  const [y, m, d] = key.split("-").map(Number);
  const label = formatDate(new Date(y, m - 1, d).getTime());
  return (
    <DialogContent title={label}>
      <div className="flex flex-col gap-3">
        {sessions.length === 0 ? (
          <p className="text-xs text-faint">
            {t(
              "No workouts logged this day.",
              "Nothing logged this day. The frog refuses to speculate.",
            )}
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/history/${s.id}`}
                  onClick={onClose}
                  className="flex h-11 items-center justify-between px-3 transition-colors duration-150 hover:bg-surface-hover"
                  data-testid={`cal-session-${s.id}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusRing
                      state={s.endedAt != null ? "done" : "partial"}
                      progress={0.5}
                    />
                    <span className="truncate text-sm">
                      {s.title ?? formatDate(s.startedAt)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-faint">
                    {formatTime(s.startedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          size="lg"
          onClick={onLog}
          data-testid="cal-log-workout"
        >
          <Plus className="size-4" />
          {sessions.length > 0 ? "Log another workout" : "Log a workout"}
        </Button>
      </div>
    </DialogContent>
  );
}
