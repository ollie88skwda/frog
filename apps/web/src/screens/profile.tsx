import { FIRST_WEEKDAY, weekStart } from "@frog/core";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Dumbbell,
  Pencil,
  Ruler,
  Settings2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { BarChart } from "@/components/charts/bars";
import { StreakCard } from "@/components/streak-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusRing } from "@/components/ui/status-ring";
import { useUserInfo } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/format";
import {
  useAllSessions,
  useUpdateUserPrefs,
  useUserPrefs,
} from "@/lib/profile-queries";
import { useVoice } from "@/lib/voice";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_WEEKS = 13; // ~3 months

const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short" });

export default function ProfileScreen() {
  const { t } = useVoice();
  const { name: authName, email } = useUserInfo();
  const { data: prefs } = useUserPrefs();
  const { data: sessions = [] } = useAllSessions();

  const displayName = prefs?.displayName || authName;
  const initial = (displayName[0] ?? "?").toUpperCase();

  const starts = useMemo(() => sessions.map((s) => s.startedAt), [sessions]);
  const recent = sessions.slice(0, 5);

  // Weekly workout counts over the last ~3 months, oldest → newest.
  const activity = useMemo(() => {
    const thisWeek = weekStart(Date.now(), FIRST_WEEKDAY);
    const counts = new Map<number, number>();
    for (const t of starts) {
      const ws = weekStart(t, FIRST_WEEKDAY);
      counts.set(ws, (counts.get(ws) ?? 0) + 1);
    }
    const bars: { label: string; value: number }[] = [];
    let prevMonth = -1;
    for (let i = ACTIVITY_WEEKS - 1; i >= 0; i--) {
      // Re-normalize onto a true week boundary (DST-safe).
      const ws = weekStart(thisWeek - i * WEEK_MS + WEEK_MS / 2, FIRST_WEEKDAY);
      const d = new Date(ws);
      const label = d.getMonth() !== prevMonth ? monthFmt.format(d) : "";
      prevMonth = d.getMonth();
      bars.push({ label, value: counts.get(ws) ?? 0 });
    }
    return bars;
  }, [starts]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
        <Link
          to="/settings"
          title="Settings"
          className="flex size-9 items-center justify-center bg-translucent text-soft shadow-(--inset-control) transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
          data-testid="profile-settings"
        >
          <Settings2 className="size-4" />
        </Link>
      </div>

      <ProfileHeader
        displayName={displayName}
        email={email}
        initial={initial}
        bio={prefs?.bio ?? null}
      />

      {/* Workout count + streak. */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex flex-col justify-center border border-border bg-surface p-4">
          <div className="text-2xs font-medium tracking-widest text-faint uppercase">
            Workouts
          </div>
          <p
            className="num mt-1 text-2xl font-semibold"
            data-testid="workout-count"
          >
            {sessions.length}
          </p>
        </div>
        <StreakCard starts={starts} />
      </div>

      {/* 3-month weekly activity. */}
      <div className="mt-4 border border-border bg-surface p-4">
        <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
          Activity — last 3 months
        </h2>
        <div className="mt-2">
          <BarChart
            bars={activity}
            formatValue={(v) => String(v)}
            ariaLabel="Workouts per week"
            testId="activity-bars"
          />
        </div>
      </div>

      {/* Dashboard. */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <DashButton to="/library" icon={Dumbbell} label="Exercises" />
        <DashButton to="/stats" icon={BarChart3} label="Statistics" />
        <DashButton to="/measures" icon={Ruler} label="Measures" />
        <DashButton to="/calendar" icon={CalendarDays} label="Calendar" />
      </div>

      {/* Recent workouts. */}
      <div className="mt-4 overflow-hidden border border-border bg-surface">
        <div className="flex items-center justify-between px-4 py-2">
          <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
            Recent workouts
          </h2>
          <Link
            to="/history"
            className="text-2xs font-medium text-soft transition-colors duration-150 hover:text-ink"
          >
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="border-t border-border px-4 py-6 text-center text-xs text-faint">
            {t(
              "No sessions yet — start one from Training.",
              "No sessions yet. The frog refuses to speculate — start one from Training.",
            )}
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {recent.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/history/${s.id}`}
                  className="flex h-11 items-center justify-between px-4 transition-colors duration-150 hover:bg-surface-hover md:h-9"
                  data-testid={`profile-recent-${s.id}`}
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
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num text-xs text-faint">
                      {formatDate(s.startedAt)} · {formatTime(s.startedAt)}
                    </span>
                    <ChevronRight className="size-4 text-faint" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Short self-description shown under the name; capped so the header stays
// compact on a phone.
const MAX_BIO_LENGTH = 160;

function ProfileHeader({
  displayName,
  email,
  initial,
  bio,
}: {
  displayName: string;
  email: string;
  initial: string;
  bio: string | null;
}) {
  const update = useUpdateUserPrefs();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [draftBio, setDraftBio] = useState(bio ?? "");

  function save() {
    const next = draft.trim();
    const nextBio = draftBio.trim();
    update.mutate({
      displayName: next || null,
      bio: nextBio || null,
    });
    setEditing(false);
  }

  return (
    <div className="mt-6 border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center bg-accent text-lg font-semibold text-accent-fg">
          {initial}
        </span>
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="h-9 flex-1"
                data-testid="profile-name-input"
              />
              <Button
                variant="primary"
                size="icon"
                onClick={save}
                data-testid="profile-name-save"
              >
                <Check className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <textarea
              value={draftBio}
              onChange={(e) => setDraftBio(e.target.value)}
              onKeyDown={(e) => {
                // Enter inserts a newline; ⌘/Ctrl+Enter saves, Escape cancels.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="Short bio — lifts, goals, noise"
              rows={2}
              maxLength={MAX_BIO_LENGTH}
              className="w-full border border-border bg-surface px-2 py-2 text-sm text-ink placeholder:text-faint"
              data-testid="profile-bio-input"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-medium"
                data-testid="profile-name"
              >
                {displayName}
              </p>
              <p className="truncate text-2xs text-faint">{email}</p>
              {bio && (
                <p
                  className="mt-0.5 whitespace-pre-line text-xs text-soft"
                  data-testid="profile-bio"
                >
                  {bio}
                </p>
              )}
            </div>
            <button
              type="button"
              title="Edit profile"
              onClick={() => {
                setDraft(displayName);
                setDraftBio(bio ?? "");
                setEditing(true);
              }}
              className="ml-auto flex size-8 shrink-0 items-center justify-center text-faint transition-colors duration-150 hover:text-ink"
              data-testid="profile-name-edit"
            >
              <Pencil className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DashButton({
  to,
  icon: Icon,
  label,
  soon,
}: {
  to?: string;
  icon: typeof Dumbbell;
  label: string;
  soon?: boolean;
}) {
  const body = (
    <>
      <Icon className="size-5 text-soft" />
      <span className="text-sm font-medium">{label}</span>
      {soon && (
        <span className="ml-auto text-2xs tracking-widest text-faint uppercase">
          Soon
        </span>
      )}
    </>
  );
  const base =
    "flex h-14 items-center gap-3 border border-border bg-surface px-4";
  if (soon || !to) {
    return (
      <div
        className={`${base} cursor-not-allowed opacity-60`}
        aria-disabled="true"
        data-testid={`dash-${label.toLowerCase()}`}
      >
        {body}
      </div>
    );
  }
  return (
    <Link
      to={to}
      className={`${base} transition-colors duration-150 hover:border-border-strong`}
      data-testid={`dash-${label.toLowerCase()}`}
    >
      {body}
    </Link>
  );
}
