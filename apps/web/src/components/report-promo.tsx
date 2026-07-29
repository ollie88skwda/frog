import { CalendarDays, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAllSessions } from "@/lib/profile-queries";
import { useVoice } from "@/lib/voice";

// Home promo cards (M10): during the first 7 days of a month, a dismissible
// "your <last month> report is ready" nudge → /stats/monthly; every December,
// a Year-in-Review banner → /stats/year. Both are gated on the relevant period
// actually having workouts (no nudging an empty report) and dismissed via
// localStorage so they stay gone for that specific month/year.

const monthNameFmt = new Intl.DateTimeFormat(undefined, { month: "long" });

// Dismissals written before the frog rebrand used a "sbl:" prefix; read those
// too so a rename doesn't re-show a banner the user already waved off. Safe to
// drop one release after 2026-07-28.
function dismissed(key: string): boolean {
  try {
    return (
      localStorage.getItem(key) === "1" ||
      localStorage.getItem(key.replace(/^frog:/, "sbl:")) === "1"
    );
  } catch {
    return false;
  }
}

export function ReportPromo() {
  const { t } = useVoice();
  const { data: sessions = [] } = useAllSessions();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear = prev.getFullYear();
  const prevMonth = prev.getMonth();

  const monthlyKey = `frog:promo:monthly:${prevYear}-${prevMonth}`;
  const yearKey = `frog:promo:year:${now.getFullYear()}`;

  const prevFrom = new Date(prevYear, prevMonth, 1).getTime();
  const prevTo = new Date(prevYear, prevMonth + 1, 1).getTime();
  const yearFrom = new Date(now.getFullYear(), 0, 1).getTime();

  const showMonthly =
    now.getDate() <= 7 &&
    !hidden.has(monthlyKey) &&
    !dismissed(monthlyKey) &&
    sessions.some((s) => s.startedAt >= prevFrom && s.startedAt < prevTo);

  const showYear =
    now.getMonth() === 11 &&
    !hidden.has(yearKey) &&
    !dismissed(yearKey) &&
    sessions.some((s) => s.startedAt >= yearFrom);

  function dismiss(key: string) {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Private-mode / disabled storage: hide for this session anyway.
    }
    setHidden((h) => new Set(h).add(key));
  }

  if (!showMonthly && !showYear) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {showMonthly && (
        <PromoCard
          to="/stats/monthly"
          icon={<Sparkles className="size-4" />}
          label={t(
            `Your ${monthNameFmt.format(prev)} report is ready`,
            `The ${monthNameFmt.format(prev)} report is in`,
          )}
          sub={t(
            "See last month's totals, PRs, and muscle split.",
            "Totals, PRs, muscle split. Compiled by the frog.",
          )}
          onDismiss={() => dismiss(monthlyKey)}
          testId="promo-monthly"
        />
      )}
      {showYear && (
        <PromoCard
          to="/stats/year"
          icon={<CalendarDays className="size-4" />}
          label={t(
            `Your ${now.getFullYear()} in Review`,
            `Your ${now.getFullYear()}, in review`,
          )}
          sub={t(
            "A year of training, wrapped.",
            "A year of training, peer-reviewed by the frog.",
          )}
          onDismiss={() => dismiss(yearKey)}
          testId="promo-year"
        />
      )}
    </div>
  );
}

function PromoCard({
  to,
  icon,
  label,
  sub,
  onDismiss,
  testId,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  onDismiss: () => void;
  testId: string;
}) {
  return (
    <div
      className="flex items-center gap-3 border border-border bg-accent-soft p-3"
      data-testid={testId}
    >
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center bg-accent text-accent-fg">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">
            {label}
          </span>
          <span className="block truncate text-2xs text-soft">{sub}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss"
        className="flex size-8 shrink-0 items-center justify-center text-faint transition-colors duration-150 hover:text-ink"
        data-testid={`${testId}-dismiss`}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
