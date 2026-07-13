import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { TrainFindingsCard } from "@/components/train-findings-card";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { useActiveSession } from "@/lib/queries";
import { useRepo } from "@/lib/repo";

export default function TrainScreen() {
  const repo = useRepo();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: active } = useActiveSession();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const session = await repo.startSession();
      void qc.invalidateQueries({ queryKey: ["active-session"] });
      navigate(`/session/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Train</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-soft">Every session is an experiment.</p>
        <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
          {active && (
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => navigate(`/session/${active.id}`)}
              data-testid="resume-session-btn"
            >
              <Play className="size-4" />
              Resume session
            </Button>
          )}
          <Button
            variant={active ? "outline" : "primary"}
            size="lg"
            className="w-full sm:w-auto"
            disabled={starting}
            onClick={() => void start()}
            data-testid="start-session-btn"
          >
            {!active && <Play className="size-4" />}
            {starting
              ? "Starting…"
              : active
                ? "Start new session"
                : "Start session"}
          </Button>
        </div>
        {active && (
          <p className="num mt-2 text-2xs text-faint">
            started {formatTime(active.startedAt)}
          </p>
        )}
        {error && <p className="mt-3 text-xs text-neg">{error}</p>}
        <p className="mt-3 flex items-center justify-center gap-2 text-2xs text-faint">
          press <kbd className="keycap">S</kbd> to start
        </p>
      </div>

      <TrainFindingsCard />
    </div>
  );
}
