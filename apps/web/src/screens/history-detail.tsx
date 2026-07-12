import { toDisplayWeight } from "@sbl/core";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { formatDateTime } from "@/lib/format";
import { useMetrics, useSession, useSessionExercises } from "@/lib/queries";
import { useUnit } from "@/lib/settings";

export default function HistoryDetailScreen() {
  const { id = "" } = useParams();
  const { unit } = useUnit();
  const { data: session } = useSession(id);
  const { data: blocks = [] } = useSessionExercises(id);
  const { data: metrics = [] } = useMetrics();

  const conditions = session?.conditionValues ?? {};
  const conditionLines = metrics
    .filter(
      (m) =>
        m.scope === "session" &&
        conditions[m.id] != null &&
        conditions[m.id] !== "",
    )
    .map((m) => `${m.name}: ${conditions[m.id]}`);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <Link
        to="/history"
        className="flex items-center gap-1 text-xs text-soft transition-colors duration-100 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        History
      </Link>
      <h1 className="mt-2 text-lg font-semibold tracking-tight">
        {session?.title ?? "Session"}
      </h1>
      {session && (
        <p className="num mt-0.5 text-xs text-faint">
          {formatDateTime(session.startedAt)}
        </p>
      )}
      {conditionLines.length > 0 && (
        <p className="num mt-1.5 text-xs text-soft">
          {conditionLines.join(" · ")}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {blocks.map((block) => (
          <section
            key={block.id}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            <header className="flex items-center justify-between border-b border-border px-3.5 py-2">
              <h2 className="text-sm font-medium">{block.exerciseName}</h2>
              <span className="num text-2xs text-faint">
                {block.sets.length} {block.sets.length === 1 ? "set" : "sets"}
              </span>
            </header>
            <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-x-2 px-3.5 py-1.5 text-2xs font-medium tracking-wide text-faint uppercase">
              <span>#</span>
              <span>{unit}</span>
              <span>reps</span>
              <span />
            </div>
            {block.sets.map((set) => (
              <div
                key={set.id}
                className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-x-2 border-t border-border px-3.5 py-2"
              >
                <span className="num text-xs text-faint">{set.setNo + 1}</span>
                <span className="num text-sm">
                  {set.weightKg != null
                    ? toDisplayWeight(set.weightKg, unit)
                    : "—"}
                </span>
                <span className="num text-sm">{set.reps ?? "—"}</span>
                <span className="num text-2xs text-faint">
                  {set.rir != null ? `@${set.rir}` : ""}
                </span>
              </div>
            ))}
            {block.sets.length === 0 && (
              <p className="border-t border-border px-3.5 py-3 text-center text-xs text-faint">
                No sets logged.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
