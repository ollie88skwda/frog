import { Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/lib/repo";

export default function TrainScreen() {
  const repo = useRepo();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const session = await repo.startSession();
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
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          disabled={starting}
          onClick={() => void start()}
          data-testid="start-session-btn"
        >
          <Play className="size-4" />
          {starting ? "Starting…" : "Start session"}
        </Button>
        {error && <p className="mt-3 text-xs text-neg">{error}</p>}
      </div>
    </div>
  );
}
