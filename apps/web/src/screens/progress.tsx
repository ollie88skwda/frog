// Progress tab (F6): scope chips, six tiles, one segmented single-scroll body.
// Merges the old stats/findings/calendar/measures views; those routes redirect
// here via J6's app.tsx (see PR body). Section is the `?s=` search param.
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { InfoNote, ScopeChips, SectionHeader } from "@/components/data";
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

// Explanations live behind the info icon so each section opens on its data.
const SECTION_INFO: Partial<Record<SectionKey, string[]>> = {
  strength: [
    "e1RM = Brzycki with RIR, sets of 10 or fewer total reps.",
    "A change under 10% reads as normal swing.",
    "Every verdict is a best guess with a confidence percentage that rises as you log more sessions of the lift. Tap a lift for what would raise it.",
  ],
  volume: [
    "Fractional hard sets: direct 1, indirect 0.5. The 10-20 band is a starting range, not a target.",
    "Tap a muscle for its own confidence number and the lifts behind it.",
  ],
  effort: [
    "RIR is an estimate, about ±1 rep.",
    'Each lift shows the last set\'s RIR per session, oldest to newest. "–" = not logged.',
  ],
  lab: [
    "Correlation, not causation: each finding compares your top sets on high and low days of a condition.",
    "n = sessions on high days / low days.",
  ],
};

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
    <div className="mx-auto max-w-2xl pb-6" data-testid="progress-screen">
      <div className="sticky top-0 z-10 bg-bg px-4 pt-4 pb-2">
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
          action={
            SECTION_INFO[section] && (
              <InfoNote title={`About ${section}`}>
                {SECTION_INFO[section]?.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </InfoNote>
            )
          }
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
