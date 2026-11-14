import {
  EVIDENCE_RULES,
  EVIDENCE_TIER_LABELS,
  type EvidenceRule,
} from "@frog/core";
import { useEffect, useState } from "react";
import type { Tier } from "@/components/data";
import { EvidenceSheet, TierBadge } from "@/components/data";
import {
  LESSONS,
  type Lesson,
  type LessonId,
  useLessonSeen,
} from "@/lib/lessons";
import { useVoice } from "@/lib/voice";

// Generic browse view over whatever's in LESSONS — no hardcoded lesson ids,
// so this screen never needs a touch when a new lesson is added.
export default function TipsScreen() {
  const { t } = useVoice();
  // Widen each value to `Lesson` (see components/lesson.tsx) so the optional
  // `citations` field type-checks below even though no entry sets it yet.
  const entries = Object.entries(LESSONS) as [LessonId, Lesson][];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Training tips</h1>
      <RuleLibrary />
      <p className="mt-1 text-xs text-faint">
        The short lessons behind the ⓘ icons throughout the app, all in one
        place.
      </p>

      {entries.length === 0 ? (
        <p className="mt-6 px-4 py-6 text-center text-xs text-faint">
          {t(
            "No tips yet — check back soon.",
            "No tips yet. The frog is still studying.",
          )}
        </p>
      ) : (
        <div className="rounded-md mt-4 [&>*+*]:mt-0.5 overflow-hidden bg-surface">
          {entries.map(([id, lesson]) => (
            <LessonCard key={id} id={id} lesson={lesson} />
          ))}
        </div>
      )}

      {entries.length > 0 && entries.length < 5 && (
        <p className="mt-3 text-2xs text-faint">
          {t("More tips are on the way.", "The frog has more tips queued up.")}
        </p>
      )}
    </div>
  );
}

// F10 rule library: every R/C rule the UI can cite, tier badge opens the
// EvidenceSheet (What I saw → Rule → Strength → Sources). Copy comes from
// evidence/rules.ts, which is lint-checked against the §12 anti-claims.
function RuleLibrary() {
  const [open, setOpen] = useState<EvidenceRule | null>(null);
  return (
    <section className="mt-4" data-testid="rule-library">
      <h2 className="text-xs font-semibold text-soft">How Frog decides</h2>
      <p className="mt-1 text-xs text-faint">
        Every suggestion follows a numbered rule. Tap a tier to see the evidence
        and sources.
      </p>
      <ul className="rounded-md mt-2 [&>*+*]:mt-0.5 overflow-hidden bg-surface">
        {EVIDENCE_RULES.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <span className="num w-10 shrink-0 text-xs font-semibold text-soft">
              {r.id}
            </span>
            <p className="min-w-0 flex-1 text-xs text-ink-2">{r.plain}</p>
            <TierBadge
              tier={Number(r.tier.slice(1)) as Tier}
              onClick={() => setOpen(r)}
            />
          </li>
        ))}
      </ul>
      {open && (
        <EvidenceSheet
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={`Rule ${open.id}`}
          saw={<p className="text-sm text-soft">Rule library entry.</p>}
          ruleId={open.id}
          rule={open.plain}
          tier={Number(open.tier.slice(1)) as Tier}
          tierNote={`${EVIDENCE_TIER_LABELS[open.tier]}. ${open.tierNote}`}
          cites={open.cites.map((c) => ({
            label: c.label,
            href: `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`,
          }))}
        />
      )}
    </section>
  );
}

// Browsing here counts as reading the lesson — marks it seen so its InfoTip
// dot elsewhere in the app clears too, same as opening the InfoTip dialog.
function LessonCard({ id, lesson }: { id: LessonId; lesson: Lesson }) {
  const { markSeen } = useLessonSeen(id);
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <h2 className="text-sm font-medium">{lesson.title}</h2>
      {lesson.body.map((line) => (
        <p key={line} className="text-xs text-ink-2">
          {line}
        </p>
      ))}
      {lesson.citations && lesson.citations.length > 0 && (
        <p className="text-2xs text-faint">{lesson.citations.join(" · ")}</p>
      )}
    </div>
  );
}
