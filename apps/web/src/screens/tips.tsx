import { LESSONS, type Lesson } from "@/lib/lessons";
import { useVoice } from "@/lib/voice";

// Generic browse view over whatever's in LESSONS — no hardcoded lesson ids,
// so this screen never needs a touch when a new lesson is added.
export default function TipsScreen() {
  const { t } = useVoice();
  // Widen each value to `Lesson` (see components/lesson.tsx) so the optional
  // `citations` field type-checks below even though no entry sets it yet.
  const entries = Object.entries(LESSONS) as [string, Lesson][];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Training tips</h1>
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
        <div className="mt-4 divide-y divide-border overflow-hidden border border-border bg-surface">
          {entries.map(([id, lesson]) => (
            <div key={id} className="flex flex-col gap-2 px-4 py-3">
              <h2 className="text-sm font-medium">{lesson.title}</h2>
              {lesson.body.map((line) => (
                <p key={line} className="text-xs text-ink-2">
                  {line}
                </p>
              ))}
              {lesson.citations && lesson.citations.length > 0 && (
                <p className="text-2xs text-faint">
                  {lesson.citations.join(" · ")}
                </p>
              )}
            </div>
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
