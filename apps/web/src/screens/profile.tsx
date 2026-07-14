import { ChevronRight, Settings2 } from "lucide-react";
import { Link } from "react-router";
import { StatusRing } from "@/components/ui/status-ring";
import { useAuth } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/format";
import { useSessionHistory } from "@/lib/queries";

export default function ProfileScreen() {
  const { session } = useAuth();
  const email = session?.user.email ?? "";
  const name =
    (session?.user.user_metadata?.name as string | undefined) ??
    email.split("@")[0] ??
    "You";
  const initial = (name[0] ?? "?").toUpperCase();

  const { data } = useSessionHistory();
  const recent = (data?.pages.flat() ?? []).slice(0, 5);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Profile</h1>

      {/* How you appear to others (public profiles are a future phase). */}
      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center bg-brand text-lg font-semibold text-accent-fg">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-2xs text-faint">{email}</p>
          </div>
        </div>
        <p className="mt-3 text-2xs text-faint">
          Roughly how you appear to others. Public profiles are coming soon.
        </p>
      </div>

      {/* History lives on Profile. */}
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between px-4 py-2">
          <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
            History
          </h2>
          <Link
            to="/history"
            className="text-2xs font-medium text-soft transition-colors duration-150 ease-(--ease-out-quad) hover:text-ink"
          >
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="border-t border-border px-4 py-6 text-center text-xs text-faint">
            No sessions yet — start one from Training.
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {recent.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/history/${s.id}`}
                  className="flex h-11 items-center justify-between px-4 transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover md:h-8"
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

      {/* Settings lives on Profile. */}
      <Link
        to="/settings"
        className="mt-4 flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors duration-150 ease-(--ease-out-quad) hover:border-border-strong"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="size-4 text-soft" />
          Settings
        </span>
        <ChevronRight className="size-4 text-faint" />
      </Link>
    </div>
  );
}
