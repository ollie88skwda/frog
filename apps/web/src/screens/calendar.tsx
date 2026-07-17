import { Select } from "@radix-ui/themes";
import { localDateKey, type Session } from "@sbl/core";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Grid3x3, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { StreakCard } from "@/components/streak-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StatusRing } from "@/components/ui/status-ring";
import { formatDate, formatTime } from "@/lib/format";
import {
  useAllSessions,
  useUpdateUserPrefs,
  useUserPrefs,
} from "@/lib/profile-queries";
import { useRepo } from "@/lib/repo";
import { useVoice } from "@/lib/voice";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = Array.from({ length: 12 }, (_, i) => i);
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

export default function CalendarScreen() {
  const navigate = useNavigate();
  const repo = useRepo();
  const qc = useQueryClient();
  const { data: prefs } = useUserPrefs();
  const { data: sessions = [] } = useAllSessions();
  const updatePrefs = useUpdateUserPrefs();

  const firstWeekday = prefs?.firstWeekday ?? 1;
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
  // form control is focused so the weekday <select> keeps native behavior.
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
        <div className="flex items-center gap-2 text-2xs text-faint">
          Week starts
          <Select.Root
            value={String(firstWeekday)}
            onValueChange={(v) =>
              updatePrefs.mutate({ firstWeekday: Number(v) })
            }
            size="2"
          >
            <Select.Trigger variant="surface" data-testid="cal-first-weekday" />
            <Select.Content>
              {WEEKDAY_NAMES.map((name, i) => (
                <Select.Item key={name} value={String(i)}>
                  {name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div className="mt-4">
        <StreakCard starts={starts} firstWeekday={firstWeekday} />
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
          firstWeekday={firstWeekday}
          byDay={byDay}
          todayKey={todayKey}
          onDay={setSheetDay}
        />
      ) : (
        <YearGrid
          year={viewYear}
          firstWeekday={firstWeekday}
          byDay={byDay}
          onMonth={(m) => {
            setCursor(toCursor(viewYear, m));
            setView("month");
          }}
        />
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
  firstWeekday,
  byDay,
  todayKey,
  onDay,
}: {
  year: number;
  month: number;
  firstWeekday: number;
  byDay: Map<string, Session[]>;
  todayKey: string;
  onDay: (key: string) => void;
}) {
  const headers = Array.from(
    { length: 7 },
    (_, i) => WEEKDAYS[(firstWeekday + i) % 7],
  );
  const cells = monthCells(year, month, firstWeekday);
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

// Year zoom: 12 mini-month grids, workout days as accent dots. Tapping a month
// opens it. (All-time navigation is the year pager above.)
function YearGrid({
  year,
  firstWeekday,
  byDay,
  onMonth,
}: {
  year: number;
  firstWeekday: number;
  byDay: Map<string, Session[]>;
  onMonth: (m: number) => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
      {MONTHS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onMonth(m)}
          className="border border-border bg-surface p-2 text-left transition-colors duration-150 hover:border-border-strong"
          data-testid={`cal-mini-${m}`}
        >
          <div className="mb-1 text-2xs font-medium text-soft">
            {monthShortFmt.format(new Date(year, m, 1))}
          </div>
          <MiniMonth
            year={year}
            month={m}
            firstWeekday={firstWeekday}
            byDay={byDay}
          />
        </button>
      ))}
    </div>
  );
}

function MiniMonth({
  year,
  month,
  firstWeekday,
  byDay,
}: {
  year: number;
  month: number;
  firstWeekday: number;
  byDay: Map<string, Session[]>;
}) {
  const cells = monthCells(year, month, firstWeekday);
  return (
    <div className="grid grid-cols-7 gap-px">
      {cells.map((c) => {
        if (c.day == null) return <div key={c.key} className="aspect-square" />;
        const has = (byDay.get(c.key) ?? []).length > 0;
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
