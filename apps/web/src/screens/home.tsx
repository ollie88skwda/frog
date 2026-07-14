import { LibraryBig, Play, Users } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { TrainFindingsCard } from "@/components/train-findings-card";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { useActiveSession } from "@/lib/queries";
import { useStartSession } from "@/lib/start-session";

export default function HomeScreen() {
  const navigate = useNavigate();
  const { data: active } = useActiveSession();
  const { start, starting } = useStartSession();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Home</h1>

      {/* Quick start — the lightweight entry; the full hub is Training. */}
      <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {active ? "Session in progress" : "Ready to train?"}
          </p>
          <p className="num mt-0.5 text-2xs text-faint">
            {active
              ? `started ${formatTime(active.startedAt)}`
              : "Quick-start here, or open Training."}
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          className="shrink-0"
          disabled={starting}
          onClick={() =>
            active ? navigate(`/session/${active.id}`) : void start()
          }
          data-testid="home-start-btn"
        >
          <Play className="size-4" />
          {starting ? "Starting…" : active ? "Resume" : "Start"}
        </Button>
      </div>

      <TrainFindingsCard />

      {/* Library lives on Home. */}
      <Link
        to="/library"
        className="mt-4 block rounded-lg border border-border bg-surface p-4 transition-colors duration-150 ease-(--ease-out-quad) hover:border-border-strong"
      >
        <div className="flex items-center gap-2 text-2xs font-medium tracking-widest text-faint uppercase">
          <LibraryBig className="size-4" />
          Library
        </div>
        <p className="mt-2 text-sm text-soft">
          Browse exercises, machines, and tier ratings.
        </p>
      </Link>

      {/* Social + graphs are a future phase — labeled, not faked. */}
      <div className="mt-4 rounded-lg border border-dashed border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-2xs font-medium tracking-widest text-faint uppercase">
          <Users className="size-4" />
          Feed &amp; graphs
        </div>
        <p className="mt-2 text-sm text-faint">
          Coming soon — a training feed and progress charts.
        </p>
      </div>
    </div>
  );
}
