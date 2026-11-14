import {
  EVIDENCE_TIER_LABELS,
  type EvidenceRule,
  evidenceRule,
} from "@frog/core";
import { EvidenceSheet, type Tier } from "@/components/data";

const tierNum = (t: string) => Number(t.slice(1)) as Tier;

/** One rule → the shared EvidenceSheet (F10). Rule ID shows only in here. */
export function RuleSheet({
  open,
  onOpenChange,
  title,
  ruleId,
  saw,
  counterView,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  ruleId: string;
  saw: string;
  counterView?: string;
}) {
  const rule: EvidenceRule | undefined = evidenceRule(ruleId);
  if (!rule) return null;
  return (
    <EvidenceSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      saw={<p className="text-sm text-ink">{saw}</p>}
      ruleId={ruleId}
      rule={rule.plain}
      tier={tierNum(rule.tier)}
      tierNote={`${EVIDENCE_TIER_LABELS[rule.tier]}. ${rule.tierNote}`}
      cites={rule.cites.map((c) => ({
        label: c.label,
        href: `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`,
      }))}
      counterView={counterView}
    />
  );
}

export const GROUPING_NOTE =
  "Joint action is the default lens. Muscle region is the other: trials of regional growth are small, so it shows as hints, never rules.";
