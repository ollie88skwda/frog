import { toDisplayWeight } from "@sbl/core";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { useMetrics, useSession, useSessionExercises } from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import { useUnit } from "@/lib/settings";

export default function HistoryDetailScreen() {
  const { id = "" } = useParams();
  const { unit } = useUnit();
  const repo = useRepo();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { data: session } = useSession(id);
  const { data: blocks = [] } = useSessionExercises(id);
  const { data: metrics = [] } = useMetrics();

  async function deleteSession() {
    await repo.deleteSession(id);
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["findings-data"] });
    void qc.invalidateQueries({ queryKey: ["active-session"] });
    navigate("/history");
  }

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
      <div className="flex items-center justify-between">
        <Link
          to="/history"
          className="flex items-center gap-1 text-xs text-soft transition-colors duration-100 hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          History
        </Link>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirming(true)}
          data-testid="delete-session-btn"
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title="Delete this session?">
          <p className="text-xs text-soft">
            The session and its sets disappear from history and findings.
            (Soft-deleted — nothing is destroyed.)
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => void deleteSession()}
              data-testid="confirm-delete-session-btn"
            >
              Delete session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <h1 className="mt-2 text-lg font-semibold tracking-tight">
        {session?.title ?? "Session"}
      </h1>
      {session && (
        <p className="num mt-0.5 text-xs text-faint">
          {formatDateTime(session.startedAt)}
        </p>
      )}
      {conditionLines.length > 0 && (
        <p className="num mt-2 text-xs text-soft">
          {conditionLines.join(" · ")}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {blocks.map((block) => (
          <section
            key={block.id}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-2">
              <h2 className="text-sm font-medium">{block.exerciseName}</h2>
              <span className="num text-2xs text-faint">
                {block.sets.length} {block.sets.length === 1 ? "set" : "sets"}
              </span>
            </header>
            <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-x-2 px-4 py-1 text-2xs font-medium tracking-wide text-faint uppercase">
              <span>#</span>
              <span>{unit}</span>
              <span>reps</span>
              <span />
            </div>
            {block.sets.map((set) => (
              <div
                key={set.id}
                className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-x-2 border-t border-border px-4 py-2"
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
              <p className="border-t border-border px-4 py-3 text-center text-xs text-faint">
                No sets logged.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
