import { CaretRight, Plus } from "@phosphor-icons/react";
import { Suspense } from "react";
import { useNavigate } from "react-router";
import { SegmentBar, useSegment } from "@/components/segments";
import { Button } from "@/components/ui/button";
import { lazyRoute } from "@/lib/lazy-route";
import { useActiveProgram } from "@/lib/program-queries";
import { useRoutineFolders, useRoutines } from "@/lib/routine-queries";

// Plan tab (redesign §7/§8.3): the active program on top, then Program ·
// Routines · Library segments. The segments embed the existing screens as-is
// (J9 owns routines/programs, J10 owns library); their own headings stay until
// those jobs restyle them.
const RoutinesScreen = lazyRoute(() => import("@/screens/routines"));
const ProgramsScreen = lazyRoute(() => import("@/screens/programs"));
const LibraryScreen = lazyRoute(() => import("@/screens/library"));

const SEGMENTS = ["program", "routines", "library"] as const;

function ActiveProgramCard() {
  const navigate = useNavigate();
  const { data: program } = useActiveProgram();
  const { data: folders = [] } = useRoutineFolders();
  const { data: routines = [] } = useRoutines();
  const folder = program
    ? folders.find((f) => f.id === program.folderId)
    : null;
  const inRotation = program
    ? routines.filter((r) => r.folderId === program.folderId).length
    : 0;
  return (
    <section
      className="mx-4 mt-4 rounded-md bg-surface p-4"
      data-testid="plan-program-card"
    >
      {program ? (
        <>
          <p className="text-2xs font-medium tracking-widest text-faint uppercase">
            Active program
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">
            {folder?.name ?? "Your program"}
          </h2>
          <p className="num mt-0.5 text-xs text-soft">
            {inRotation} routine{inRotation === 1 ? "" : "s"} in rotation
          </p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => navigate("/plan/build")}
          >
            Rebuild <CaretRight className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold tracking-tight">
            Pick how you train
          </h2>
          <p className="mt-1 text-sm text-soft">Takes a minute.</p>
          <Button
            variant="primary"
            className="mt-3"
            onClick={() => navigate("/plan/build")}
            data-testid="plan-build-btn"
          >
            <Plus className="size-4" /> Build my program
          </Button>
        </>
      )}
    </section>
  );
}

export default function PlanScreen() {
  const [segment, setSegment] = useSegment(SEGMENTS, "program");
  return (
    <div className="mx-auto max-w-2xl pb-20 md:pb-6">
      <h1 className="px-4 pt-6 text-lg font-semibold tracking-tight">Plan</h1>
      <ActiveProgramCard />
      <SegmentBar
        value={segment}
        onChange={(v) => setSegment(v as (typeof SEGMENTS)[number])}
        options={[
          { value: "program", label: "Program" },
          { value: "routines", label: "Routines" },
          { value: "library", label: "Library" },
        ]}
      />
      <Suspense fallback={null}>
        {segment === "program" && <ProgramsScreen />}
        {segment === "routines" && <RoutinesScreen />}
        {segment === "library" && <LibraryScreen />}
      </Suspense>
    </div>
  );
}
