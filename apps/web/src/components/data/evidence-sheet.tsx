import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TIER_WORD, type Tier } from "./logic";
import { TierBadge } from "./tier-badge";

export type EvidenceCite = { label: string; href?: string };

/**
 * Bottom sheet (F10): What I saw → Rule → Strength of evidence → Sources.
 * Evidence never shows inline: callers show a TierBadge that opens this.
 * Copy must obey the anti-claims (12): no "optimal volume", "MRV", "required".
 */
export function EvidenceSheet({
  open,
  onOpenChange,
  title,
  saw,
  ruleId,
  rule,
  tier,
  tierNote,
  flags,
  cites,
  counterView,
  wouldChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Your numbers: small table, text, or a Spark. */
  saw: ReactNode;
  /** Rule id such as "C2c" or "R6"; shown here only, never on the card. */
  ruleId: string;
  rule: string;
  tier: Tier;
  tierNote: string;
  /** "Mixed evidence" / "Extrapolated" chips. */
  flags?: string[];
  cites?: EvidenceCite[];
  counterView?: string;
  wouldChange?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} aria-describedby={undefined}>
        <div className="flex flex-col gap-5">
          <Section title="What I saw">{saw}</Section>
          <Section title="Rule">
            <p className="text-sm text-ink">{rule}</p>
            <p className="text-xs text-soft">
              Rule <span className="num">{ruleId}</span>
            </p>
          </Section>
          <Section title="Strength of evidence">
            <div className="flex flex-wrap items-center gap-2">
              <TierBadge tier={tier} />
              <span className="text-xs text-soft">{TIER_WORD[tier]}</span>
              {flags?.map((f) => (
                <span
                  key={f}
                  className="inline-flex h-5 items-center rounded-xs bg-attn-soft px-1.5 text-2xs font-semibold text-attn"
                >
                  {f}
                </span>
              ))}
            </div>
            <p className="text-sm text-ink">{tierNote}</p>
          </Section>
          {counterView && (
            <Section title="Other view">
              <p className="text-sm text-ink">{counterView}</p>
            </Section>
          )}
          {wouldChange && (
            <Section title="What would change this">
              <p className="text-sm text-ink">{wouldChange}</p>
            </Section>
          )}
          {cites && cites.length > 0 && (
            <Section title="Sources">
              <ul className="flex flex-col gap-1">
                {cites.map((c) => (
                  <li key={c.label} className="text-xs text-soft">
                    {c.href ? (
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {c.label}
                      </a>
                    ) : (
                      c.label
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-soft">{title}</h3>
      {children}
    </section>
  );
}
