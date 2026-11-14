import {
  FIRST_WEEKDAY,
  type Goal,
  type TrainingStatus,
  weekStart,
} from "@frog/core";
import {
  Barbell,
  CalendarDots,
  CaretRight,
  ChartBar,
  Check,
  GearSix,
  PencilSimple,
  Ruler,
  X,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  LabelList,
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  XAxis,
  YAxis,
} from "recharts";
import { StreakCard } from "@/components/streak-card";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ChipGroup, ChipItem } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Textarea } from "@/components/ui/input";
import { rowClass } from "@/components/ui/row";
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
const weekDayFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

// Weekly workout-count bars — one accent series, tooltip + per-bar label.
const ACTIVITY_CONFIG = {
  value: { label: "Workouts", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function ProfileScreen() {
  const { t } = useVoice();
  const { name: authName, email } = useUserInfo();
  const { data: prefs } = useUserPrefs();
  const { data: sessions = [] } = useAllSessions();

  const displayName = prefs?.displayName || authName;
  const initial = (displayName[0] ?? "?").toUpperCase();

  const starts = useMemo(() => sessions.map((s) => s.startedAt), [sessions]);
  const recent = sessions.slice(0, 5);

  // Weekly workout counts over the last ~3 months, oldest → newest. The week
  // start rides as the unique category key (recharts positions category axes
  // off the value — the sparse "" month labels repeat, so they must be a
  // tickFormatter over it, never the dataKey itself).
  const activity = useMemo(() => {
    const thisWeek = weekStart(Date.now(), FIRST_WEEKDAY);
    const counts = new Map<number, number>();
    for (const t of starts) {
      const ws = weekStart(t, FIRST_WEEKDAY);
      counts.set(ws, (counts.get(ws) ?? 0) + 1);
    }
    const bars: { week: number; label: string; value: number }[] = [];
    let prevMonth = -1;
    for (let i = ACTIVITY_WEEKS - 1; i >= 0; i--) {
      // Re-normalize onto a true week boundary (DST-safe).
      const ws = weekStart(thisWeek - i * WEEK_MS + WEEK_MS / 2, FIRST_WEEKDAY);
      const d = new Date(ws);
      const label = d.getMonth() !== prevMonth ? monthFmt.format(d) : "";
      prevMonth = d.getMonth();
      bars.push({ week: ws, label, value: counts.get(ws) ?? 0 });
    }
    return bars;
  }, [starts]);

  const activityLabelOf = useMemo(
    () => new Map(activity.map((b) => [b.week, b.label])),
    [activity],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
        <Link
          to="/settings"
          title="Settings"
          className="rounded-sm flex size-10 items-center justify-center bg-surface-2 text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink md:size-8"
          data-testid="profile-settings"
        >
          <GearSix className="size-4" />
        </Link>
      </div>

      <ProfileHeader
        displayName={displayName}
        email={email}
        initial={initial}
        bio={prefs?.bio ?? null}
      />

      <GoalFields
        goal={prefs?.goal ?? null}
        status={prefs?.trainingStatus ?? null}
      />

      {/* Workout count + streak. */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-md flex flex-col justify-center bg-surface p-4">
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
      <div className="rounded-md mt-4 bg-surface p-4">
        <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
          Activity — last 3 months
        </h2>
        <div className="mt-2">
          <ChartContainer
            config={ACTIVITY_CONFIG}
            className="h-40 w-full"
            role="img"
            aria-label="Workouts per week"
            data-testid="activity-bars"
          >
            <RechartsBarChart
              data={activity}
              margin={{ top: 16, right: 4, left: 0, bottom: 0 }}
              accessibilityLayer
            >
              <XAxis
                dataKey="week"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                tickFormatter={(v) => activityLabelOf.get(Number(v)) ?? ""}
              />
              <YAxis hide width={0} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      weekDayFmt.format(new Date(payload?.[0]?.payload?.week))
                    }
                  />
                }
              />
              <RechartsBar
                dataKey="value"
                fill="var(--color-value)"
                maxBarSize={40}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v) => (Number(v) > 0 ? String(v) : "")}
                  className="num"
                  fill="var(--color-text-secondary)"
                  fontSize={10}
                />
              </RechartsBar>
            </RechartsBarChart>
          </ChartContainer>
        </div>
      </div>

      {/* Dashboard. */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <DashButton to="/library" icon={Barbell} label="Exercises" />
        <DashButton to="/stats" icon={ChartBar} label="Statistics" />
        <DashButton to="/measures" icon={Ruler} label="Measures" />
        <DashButton to="/calendar" icon={CalendarDots} label="Calendar" />
      </div>

      {/* Recent workouts. */}
      <div className="rounded-md mt-4 overflow-hidden bg-surface">
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
          <p className="px-4 py-6 text-center text-xs text-faint">
            {t(
              "No sessions yet — start one from Training.",
              "No sessions yet. The frog refuses to speculate — start one from Training.",
            )}
          </p>
        ) : (
          <ul className="[&>*+*]:mt-0.5">
            {recent.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/history/${s.id}`}
                  className={rowClass()}
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
                    <CaretRight className="size-4 text-faint" />
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

// F13: goal + training status unlock the dormant C17 body-rate flags and the
// builder's starting volume (R11). Both are optional; tapping the active chip
// clears it. Written through the §9.2 prefs patch.
const GOALS: { value: Goal; label: string }[] = [
  { value: "build", label: "Build" },
  { value: "cut", label: "Cut" },
  { value: "bulk", label: "Bulk" },
  { value: "maintain", label: "Maintain" },
];
const STATUSES: { value: TrainingStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "intermediate", label: "Intermediate" },
  { value: "experienced", label: "Experienced" },
];

function GoalFields({
  goal,
  status,
}: {
  goal: Goal | null;
  status: TrainingStatus | null;
}) {
  const update = useUpdateUserPrefs();
  return (
    <div className="rounded-md mt-4 bg-surface p-4" data-testid="goal-fields">
      <p className="text-xs font-medium">Goal</p>
      <ChipGroup
        className="mt-1.5"
        value={goal ?? ""}
        onValueChange={(v) =>
          update.mutate({ goal: (v || null) as Goal | null })
        }
        aria-label="Goal"
      >
        {GOALS.map((g) => (
          <ChipItem
            key={g.value}
            value={g.value}
            data-testid={`goal-${g.value}`}
          >
            {g.label}
          </ChipItem>
        ))}
      </ChipGroup>
      <p className="mt-3 text-xs font-medium">Training experience</p>
      <ChipGroup
        className="mt-1.5"
        value={status ?? ""}
        onValueChange={(v) =>
          update.mutate({
            trainingStatus: (v || null) as TrainingStatus | null,
          })
        }
        aria-label="Training experience"
      >
        {STATUSES.map((g) => (
          <ChipItem
            key={g.value}
            value={g.value}
            data-testid={`status-${g.value}`}
          >
            {g.label}
          </ChipItem>
        ))}
      </ChipGroup>
      <p className="mt-2 text-2xs text-faint">
        Optional. Weight-rate notes only appear when your goal is cut or bulk.
      </p>
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
    <div className="rounded-md mt-6 bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="rounded-sm flex size-12 shrink-0 items-center justify-center bg-accent text-lg font-semibold text-accent-fg">
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
                className="flex-1"
                data-testid="profile-name-input"
              />
              <Button
                variant="primary"
                size="icon"
                onClick={save}
                aria-label="Save name"
                data-testid="profile-name-save"
              >
                <Check className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(false)}
                aria-label="Cancel editing"
              >
                <X className="size-4" />
              </Button>
            </div>
            <Textarea
              aria-label="Bio"
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
              className="mt-2"
              data-testid="profile-bio-input"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <p
                className="min-w-0 truncate text-sm font-medium"
                data-testid="profile-name"
              >
                {displayName}
              </p>
              <IconButton
                title="Edit profile"
                aria-label="Edit profile"
                onClick={() => {
                  setDraft(displayName);
                  setDraftBio(bio ?? "");
                  setEditing(true);
                }}
                className="ml-auto"
                data-testid="profile-name-edit"
              >
                <PencilSimple className="size-4" />
              </IconButton>
            </div>
            <p className="mt-0.5 truncate text-2xs text-faint">{email}</p>
            {bio && (
              <p
                className="mt-0.5 whitespace-pre-line text-xs text-soft"
                data-testid="profile-bio"
              >
                {bio}
              </p>
            )}
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
  icon: typeof Barbell;
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
  const base = "flex h-14 items-center gap-3 rounded-md bg-surface px-4";
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
      className={`${base} transition-colors duration-150`}
      data-testid={`dash-${label.toLowerCase()}`}
    >
      {body}
    </Link>
  );
}
