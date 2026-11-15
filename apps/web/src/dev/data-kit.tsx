// Dev-only gallery for the data kit (F12). Renders every component in day and
// night (tokens are scoped by [data-mode], so a nested wrapper flips them).
// Not shipped: app.tsx (J6) mounts it at /dev/data-kit inside the app router behind the same
// `import.meta.env.DEV || VITE_E2E === "1"` dead-branch as the annotate overlay.
import { useState } from "react";
import {
  CoachCard,
  ConfidenceDots,
  confidenceFrom,
  DEFAULT_SCOPES,
  DeltaChip,
  EmptyState,
  EvidenceSheet,
  MuscleMeter,
  Num,
  SaveDot,
  ScopeChips,
  SectionHeader,
  Spark,
  SparkRow,
  StatTile,
  TierBadge,
} from "@/components/data";
import { Badge } from "@/components/ui/badge";
import { Row } from "@/components/ui/row";

const E1RM = [100, 102, 101, 104, null, 106, 105, 108];

function Kit({ mode }: { mode: "day" | "night" }) {
  const [scope, setScope] = useState("all");
  const [sheet, setSheet] = useState(false);
  return (
    <div
      data-theme="green"
      data-mode={mode}
      className="bg-bg pb-6 text-ink"
      data-testid={`kit-${mode}`}
    >
      <h1 className="px-4 pt-4 text-lg font-bold">Data kit · {mode}</h1>

      <SectionHeader title="Tiles" count={2} to="/dev/data-kit" />
      <div className="grid grid-cols-2 gap-2 px-4">
        <StatTile
          label="Squat e1RM"
          value="142.5"
          unit="kg"
          basis="vs your last 12 wk"
          n={9}
          delta={
            <DeltaChip delta={7.5} noise={5} unit="kg" basis="vs last 12 wk" />
          }
          spark={<Spark points={E1RM} />}
          confidence={
            <ConfidenceDots
              confidence={confidenceFrom({ n: 9, minN: 7, tier: 2 })}
            />
          }
          onClick={() => {}}
        />
        <StatTile
          label="Bench e1RM"
          value="97.5"
          unit="kg"
          basis="vs your last 12 wk"
          n={9}
          delta={
            <DeltaChip delta={1} noise={5} unit="kg" basis="vs last 12 wk" />
          }
        />
      </div>

      <SectionHeader title="Delta chips" />
      <div className="flex flex-wrap gap-2 px-4">
        <DeltaChip delta={7.5} noise={5} unit="kg" basis="vs last" />
        <DeltaChip delta={-7.5} noise={5} unit="kg" basis="vs last" />
        <DeltaChip delta={1} noise={5} unit="kg" basis="vs last" />
        <DeltaChip delta={Number.NaN} basis="vs last" />
        <Badge tone="warn">Stalled</Badge>
        <Badge tone="danger">Error</Badge>
        <Badge tone="accent">PR</Badge>
      </div>

      <SectionHeader title="Scope" />
      <div className="px-4">
        <ScopeChips
          value={scope}
          onChange={setScope}
          options={DEFAULT_SCOPES}
        />
      </div>

      <SectionHeader title="Exercises" />
      <div className="flex flex-col">
        <SparkRow
          title="Back squat"
          sub="Top set 6 × 142.5"
          points={E1RM}
          band={[100, 106]}
          value={<Num value="142.5" unit="kg" />}
          delta={<DeltaChip delta={7.5} noise={5} basis="vs last 12 wk" />}
          onClick={() => {}}
        />
        <SparkRow
          title="Romanian deadlift"
          sub="Not enough yet (3 of 7 sessions)"
          points={[80, 82, 84]}
          confidence="low"
          value={<Num value="102.5" unit="kg" />}
          delta={<DeltaChip delta={0.5} noise={5} basis="vs last" />}
        />
        <Row dense interactive={false}>
          <span className="text-sm">Dense row (48 px)</span>
        </Row>
      </div>

      <SectionHeader title="Weekly hard sets" />
      <div className="flex flex-col">
        <MuscleMeter label="Quads" sets={17.5} onClick={() => {}} />
        <MuscleMeter label="Chest" sets={10.5} />
        <MuscleMeter label="Biceps" sets={8} />
        <MuscleMeter label="Calves" sets={4} />
        <MuscleMeter label="Delts" sets={22} />
      </div>

      <SectionHeader title="Coach" />
      <div className="flex flex-col gap-2 px-4">
        <CoachCard
          title="Add 2.5 kg next time"
          reason="Two sessions at 8 reps, 2 left in the tank."
          tier={5}
          confidence={confidenceFrom({ n: 8, minN: 6, tier: 5 })}
          onWhy={() => setSheet(true)}
          onDismiss={() => {}}
        />
        <div className="flex flex-wrap items-center gap-2">
          {([1, 2, 3, 4, 5] as const).map((t) => (
            <TierBadge key={t} tier={t} onClick={() => setSheet(true)} />
          ))}
        </div>
        <div className="flex gap-3">
          <ConfidenceDots
            confidence={confidenceFrom({ n: 3, minN: 7 })}
            showLabel
          />
        </div>
      </div>

      <SectionHeader title="Save state" />
      <div className="flex items-center gap-4 px-4">
        <SaveDot state="queued" />
        <SaveDot state="saved" />
        <SaveDot state="failed" />
        <SaveDot state="failed" onRetry={() => {}} />
      </div>

      <SectionHeader title="Empty" />
      <EmptyState
        title="Nothing to trend yet"
        need="6 sessions logged; stall check starts at 7."
      />

      <EvidenceSheet
        open={sheet}
        onOpenChange={setSheet}
        title="Why add load?"
        saw={<Spark points={E1RM} width={160} height={40} band={[100, 106]} />}
        ruleId="C2c"
        rule="Hit the top of the rep range with reps to spare: add the smallest load step."
        tier={5}
        tierNote="A practical default, not trial-tested."
        flags={["Extrapolated"]}
        wouldChange="Three more comparable sessions."
        cites={[{ label: "Frog research notes: COACH-LOGIC C2c" }]}
      />
    </div>
  );
}

export default function DataKit() {
  return (
    <div className="mx-auto max-w-[390px]">
      <Kit mode="day" />
      <Kit mode="night" />
    </div>
  );
}
