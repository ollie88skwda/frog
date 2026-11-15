// Progress tab (F6): scope chips, six tiles, one segmented single-scroll body.
// Merges the old stats/findings/calendar/measures views; those routes redirect
// here via J6's app.tsx (see PR body). Section is the `?s=` search param.
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { ScopeChips, SectionHeader } from "@/components/data";
import {
  PROGRESS_SCOPES,
  type ProgressScope,
} from "@/components/progress/derive";
import {
  BodySection,
  CoachSection,
  EffortSection,
  LabSection,
  OverviewTiles,
  StrengthSection,
  VolumeSection,
} from "@/components/progress/sections";
import { useProgressData } from "@/components/progress/use-progress";
import { ChipGroup, ChipItem } from "@/components/ui/chip";
import { QueryState } from "@/components/ui/query-state";

const SECTIONS = [
  ["coach", "Coach"],
  ["volume", "Volume"],
  ["strength", "Strength"],
  ["effort", "Effort"],
  ["body", "Body"],
  ["lab", "Lab"],
] as const;
type SectionKey = (typeof SECTIONS)[number][0];

export default function ProgressScreen() {
  const [params, setParams] = useSearchParams();
  const d = useProgressData();
  const section: SectionKey =
    SECTIONS.find(([k]) => k === params.get("s"))?.[0] ?? "strength";
  const scope = (PROGRESS_SCOPES.find((s) => s.value === params.get("scope"))
    ?.value ?? "all") as ProgressScope;
  const now = useMemo(() => Date.now(), []);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <div
      className="mx-auto max-w-2xl pb-24 md:pb-6"
      data-testid="progress-screen"
    >
      <div className="sticky top-0 z-10 bg-page px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold tracking-tight">Progress</h1>
        <ScopeChips
          className="mt-2 flex-nowrap overflow-x-auto"
          value={scope}
          onChange={(v) => set("scope", v)}
          options={PROGRESS_SCOPES}
        />
      </div>
      <QueryState
        isLoading={d.isLoading}
        isError={d.isError}
        error={d.error}
        onRetry={d.refetch}
      >
        <OverviewTiles d={d} scope={scope} now={now} go={(s) => set("s", s)} />
        <div className="px-4 pt-4">
          <ChipGroup
            value={section}
            onValueChange={(v) => v && set("s", v)}
            aria-label="Progress section"
            className="flex-nowrap overflow-x-auto"
          >
            {SECTIONS.map(([k, label]) => (
              <ChipItem key={k} value={k} data-testid={`progress-seg-${k}`}>
                {label}
              </ChipItem>
            ))}
          </ChipGroup>
        </div>
        <SectionHeader
          title={SECTIONS.find(([k]) => k === section)?.[1] ?? ""}
        />
        {section === "coach" && <CoachSection />}
        {section === "volume" && <VolumeSection d={d} now={now} />}
        {section === "strength" && (
          <StrengthSection d={d} scope={scope} now={now} />
        )}
        {section === "effort" && (
          <EffortSection d={d} scope={scope} now={now} />
        )}
        {section === "body" && <BodySection d={d} now={now} />}
        {section === "lab" && <LabSection />}
      </QueryState>
    </div>
  );
}
