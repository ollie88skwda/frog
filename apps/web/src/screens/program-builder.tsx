import {
  type BuilderAnswers,
  buildSavedConfig,
  DEFAULT_ANSWERS,
  type Exercise,
  fitToMinutes,
  generateProgram,
  type Philosophy,
  PROGRAM_RULES,
  PROGRAM_TEMPLATES,
  type ProgramFinding,
  type ProgramTemplate,
  recommendTemplate,
  resolveTemplate,
  type SlotOverride,
  type SwapCandidate,
  sessionsPerWeek,
  templateById,
  validateProgram,
  viewOf,
} from "@frog/core";
import { DotsThree, Flame } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import {
  answersFromPrefs,
  applyPatch,
  type Grouping,
  groupBy,
  groupLabel,
  prefsFromAnswers,
  prescriptionText,
  scheduleLabel,
  slotChoices,
  toGeneratorConfig,
  upsertOverride,
  withPinnedCredits,
} from "@/components/builder/logic";
import {
  FindingsList,
  SessionStrip,
  WeeklyMeter,
} from "@/components/builder/review";
import { EditSlotSheet, SwapSheet } from "@/components/builder/slot-sheets";
import {
  GROUPING_NOTE,
  METHOD_NOTE,
  RuleSheet,
} from "@/components/builder/why-sheet";
import { WIZARD_STEPS, WizardStep } from "@/components/builder/wizard";
import { SectionHeader, StatTile } from "@/components/data";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { ChipGroup, ChipItem } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import {
  useResolvedUserPrefs,
  useUpdateUserPrefs,
} from "@/lib/profile-queries";
import {
  builderLibraryKey,
  useActiveBuilderConfig,
  useMaterializeProgram,
  useRegenerateProgram,
} from "@/lib/program-queries";
import { useExercisePrefs, useExercises } from "@/lib/queries";
import { useRecordsData } from "@/lib/records-queries";
import { userFacingRepoError } from "@/lib/repo-error";
import { selectableFrom, startingWeightsFrom } from "@/lib/trainer";
import { useVoice } from "@/lib/voice";

// F8 + F11 + F14: the guided program builder. /programs/new is the five-step
// wizard (one question a screen, defaults preselected); the review step shows
// the template's per-muscle weekly meter, per-session strip, slot rows, block
// plan and findings before anything is saved. Every check is advisory.
// /programs/edit re-opens an existing builder program on the same review.
export default function ProgramBuilderScreen() {
  const { pathname } = useLocation();
  const editing = pathname.endsWith("/edit");
  const nav = useNavigate();
  const { t } = useVoice();
  const exercisesQ = useExercises();
  const { data: ePrefs = [] } = useExercisePrefs();
  const prefs = useResolvedUserPrefs();
  const updatePrefs = useUpdateUserPrefs();
  const active = useActiveBuilderConfig();
  const records = useRecordsData();
  const materialize = useMaterializeProgram();
  const rebuild = useRegenerateProgram();

  const [answers, setAnswers] = useState<BuilderAnswers | null>(null);
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [philosophy, setPhilosophy] = useState<Philosophy | null>(null);
  const [overrides, setOverrides] = useState<SlotOverride[]>([]);
  const [everyWeeks, setEveryWeeks] = useState<number | null>(null);
  const [undo, setUndo] = useState<SlotOverride[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [params] = useSearchParams();

  // Seed once: a fresh wizard starts from saved goal/status (D7); edit mode
  // re-opens the stored config on the review step.
  const seeded = answers !== null;
  useEffect(() => {
    if (seeded) return;
    if (editing) {
      if (active.isPending) return;
      if (active.config) {
        setAnswers(active.config.answers);
        setTemplateId(active.config.templateId);
        setPhilosophy(active.config.philosophy);
        setOverrides(active.config.overrides);
        setEveryWeeks(active.config.block.everyWeeks);
        setStep(WIZARD_STEPS.length);
        return;
      }
    }
    const tpl = params.get("template");
    const base = answersFromPrefs(DEFAULT_ANSWERS, prefs);
    setAnswers(base);
    if (tpl && templateById(tpl)) {
      setTemplateId(tpl);
      setStep(WIZARD_STEPS.length);
    }
  }, [seeded, editing, active.isPending, active.config, prefs, params]);

  const library = useMemo(
    () => selectableFrom(exercisesQ.data ?? []),
    [exercisesQ.data],
  );
  const byId = useMemo(
    () => new Map((exercisesQ.data ?? []).map((e) => [e.id, e])),
    [exercisesQ.data],
  );

  const rec = answers ? recommendTemplate(answers) : null;
  const template: ProgramTemplate | null = useMemo(() => {
    if (templateId) return templateById(templateId) ?? null;
    return rec?.kind === "template" ? rec.template : null;
  }, [templateId, rec]);

  if (!answers) {
    return (
      <Shell title="Build my program" onBack={() => nav("/programs")}>
        <p role="status" className="py-10 text-center text-sm text-soft">
          Loading…
        </p>
      </Shell>
    );
  }

  const onReview = step >= WIZARD_STEPS.length;

  if (!onReview) {
    const last = step === WIZARD_STEPS.length - 1;
    return (
      <Shell
        title="Build my program"
        onBack={() => (step === 0 ? nav("/programs") : setStep(step - 1))}
        footer={
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            data-testid="wizard-next"
            onClick={() =>
              last ? setStep(WIZARD_STEPS.length) : setStep(step + 1)
            }
          >
            {last ? "See my program" : "Next"}
          </Button>
        }
      >
        <ol
          className="flex gap-1"
          aria-label={`Step ${step + 1} of ${WIZARD_STEPS.length}: ${WIZARD_STEPS[step]}`}
        >
          {WIZARD_STEPS.map((s, i) => (
            <li
              key={s}
              aria-hidden="true"
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-chart-mark" : "bg-hover"}`}
            />
          ))}
        </ol>
        <p className="num text-xs text-soft">
          {step + 1} of {WIZARD_STEPS.length}
        </p>
        <WizardStep step={step} answers={answers} onChange={setAnswers} />
        <p className="text-xs text-soft">
          Defaults are preselected; change only what differs.
        </p>
      </Shell>
    );
  }

  if (!template) {
    return (
      <LegacyHand
        answers={answers}
        onBack={() => setStep(WIZARD_STEPS.length - 1)}
      />
    );
  }

  const philo = philosophy ?? template.philosophy;
  return (
    <Review
      key={template.id}
      template={template}
      answers={answers}
      philosophy={philo}
      setPhilosophy={setPhilosophy}
      overrides={overrides}
      setOverrides={setOverrides}
      everyWeeks={everyWeeks ?? template.block.deload.everyWeeks}
      setEveryWeeks={setEveryWeeks}
      undo={undo}
      setUndo={setUndo}
      library={library}
      exercises={exercisesQ.data ?? []}
      byId={byId}
      excludedIds={
        new Set(
          ePrefs.filter((p) => p.generatorExcluded).map((p) => p.exerciseId),
        )
      }
      startingKg={
        records.data ? startingWeightsFrom(records.data.records) : undefined
      }
      onBack={() => setStep(WIZARD_STEPS.length - 1)}
      onPickTemplate={(id) => {
        setTemplateId(id);
        setPhilosophy(null);
        setOverrides([]);
        setEveryWeeks(null);
      }}
      saving={materialize.isPending || rebuild.isPending}
      error={error}
      loading={exercisesQ.isPending}
      editing={editing && active.config != null}
      startedAt={active.config?.block.startedAt ?? null}
      onSave={async (program, config, extras) => {
        setError(null);
        try {
          if (editing && active.config) {
            setConfirmRebuild(true);
            return;
          }
          await materialize.mutateAsync({
            program,
            source: "library",
            libraryKey: builderLibraryKey(config.templateId),
            config,
            name: extras.name,
          });
          const p = prefsFromAnswers(answers, prefs);
          if (Object.keys(p).length) updatePrefs.mutate(p);
          nav("/routines");
        } catch (e) {
          setError(userFacingRepoError(e));
        }
      }}
      confirmRebuild={confirmRebuild}
      setConfirmRebuild={setConfirmRebuild}
      onRebuild={async (program, config) => {
        if (!active.program || !active.config) return;
        try {
          await rebuild.mutateAsync({
            programId: active.program.id,
            folderId: active.program.folderId,
            program,
            config,
          });
          nav("/routines");
        } catch (e) {
          setError(userFacingRepoError(e));
        }
      }}
      t={t}
    />
  );
}

function Shell({
  title,
  onBack,
  footer,
  children,
}: {
  title: string;
  onBack: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 pb-44 md:pb-6">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} label="Back" />
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>
      {children}
      {footer && (
        <div className="fixed inset-x-0 bottom-20 z-30 bg-bg px-4 py-2 md:static md:p-0">
          <div className="mx-auto max-w-2xl">{footer}</div>
        </div>
      )}
    </div>
  );
}

function LegacyHand({
  answers,
  onBack,
}: {
  answers: BuilderAnswers;
  onBack: () => void;
}) {
  const nav = useNavigate();
  const materialize = useMaterializeProgram();
  const { data: exercises = [] } = useExercises();
  const { data: ePrefs = [] } = useExercisePrefs();
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell title="Your answers" onBack={onBack}>
      <p className="text-sm text-soft">
        {scheduleLabel(answers.schedule)} is outside the research templates. The
        older split generator can build an upper/lower or push/pull/legs plan
        for it. It has no weekly set meter.
      </p>
      <Button
        variant="primary"
        size="lg"
        disabled={materialize.isPending || exercises.length === 0}
        onClick={async () => {
          try {
            const config = toGeneratorConfig(answers);
            const program = generateProgram(config, selectableFrom(exercises), {
              excludedIds: new Set(
                ePrefs
                  .filter((p) => p.generatorExcluded)
                  .map((p) => p.exerciseId),
              ),
            });
            await materialize.mutateAsync({
              program,
              source: "generated",
              config,
            });
            nav("/routines");
          } catch (e) {
            setErr(userFacingRepoError(e));
          }
        }}
      >
        Build with the split generator
      </Button>
      {err && <p className="text-xs text-neg">{err}</p>}
      <Link to="/programs" className="text-xs text-soft underline">
        Or browse templates
      </Link>
    </Shell>
  );
}

type ReviewProps = {
  template: ProgramTemplate;
  answers: BuilderAnswers;
  philosophy: Philosophy;
  setPhilosophy: (p: Philosophy) => void;
  overrides: SlotOverride[];
  setOverrides: (o: SlotOverride[]) => void;
  everyWeeks: number;
  setEveryWeeks: (n: number) => void;
  undo: SlotOverride[] | null;
  setUndo: (o: SlotOverride[] | null) => void;
  library: ReturnType<typeof selectableFrom>;
  exercises: Exercise[];
  byId: Map<string, Exercise>;
  excludedIds: ReadonlySet<string>;
  startingKg?: Map<string, number>;
  onBack: () => void;
  onPickTemplate: (id: string) => void;
  saving: boolean;
  error: string | null;
  loading: boolean;
  editing: boolean;
  startedAt: number | null;
  onSave: (
    program: ReturnType<typeof resolveTemplate>["program"],
    config: ReturnType<typeof buildSavedConfig>,
    extras: { name: string },
  ) => Promise<void>;
  confirmRebuild: boolean;
  setConfirmRebuild: (b: boolean) => void;
  onRebuild: (
    program: ReturnType<typeof resolveTemplate>["program"],
    config: ReturnType<typeof buildSavedConfig>,
  ) => Promise<void>;
  t: (human: string, frog?: string) => string;
};

function Review(p: ReviewProps) {
  const { template, answers, philosophy, overrides } = p;
  const [why, setWhy] = useState<{
    rule: string;
    title: string;
    saw: string;
  } | null>(null);
  const [editSlot, setEditSlot] = useState<{
    session: string;
    slot: string;
  } | null>(null);
  const [swapSlot, setSwapSlot] = useState<{
    session: string;
    slot: string;
  } | null>(null);
  const [grouping, setGrouping] = useState<Grouping>(philosophy.grouping);

  const baseView = useMemo(
    () => viewOf(template, { philosophy, answers, overrides }),
    [template, philosophy, answers, overrides],
  );
  const resolved = useMemo(
    () =>
      resolveTemplate(template, p.library, {
        philosophy,
        answers,
        overrides,
        excludedIds: p.excludedIds,
        startingWeightsKg: p.startingKg,
      }),
    [
      template,
      p.library,
      philosophy,
      answers,
      overrides,
      p.excludedIds,
      p.startingKg,
    ],
  );
  const choices = useMemo(
    () => slotChoices(baseView, resolved, p.byId),
    [baseView, resolved, p.byId],
  );
  const creditById = useMemo(
    () => new Map(p.exercises.map((e) => [e.id, e])),
    [p.exercises],
  );
  const view = useMemo(
    () => ({
      ...withPinnedCredits(baseView, overrides, creditById as never),
      block: {
        ...template.block,
        deload: { ...template.block.deload, everyWeeks: p.everyWeeks },
      },
    }),
    [baseView, overrides, creditById, template.block, p.everyWeeks],
  );
  const validation = useMemo(() => validateProgram(view), [view]);
  const perWeek =
    sessionsPerWeek(view.schedule) / Math.max(1, view.sessions.length);
  const maxMin = Math.max(0, ...validation.minutes.map((m) => m.max));
  const minMin = Math.max(0, ...validation.minutes.map((m) => m.min));
  const totalSets = view.sessions.reduce(
    (a, s) => a + s.slots.reduce((b, x) => b + x.rx.sets, 0),
    0,
  );

  function apply(next: SlotOverride[]) {
    p.setUndo(overrides);
    p.setOverrides(next);
  }

  const editing = editSlot
    ? view.sessions
        .find((s) => s.id === editSlot.session)
        ?.slots.find((s) => s.slot === editSlot.slot)
    : undefined;
  const swapping = swapSlot
    ? view.sessions
        .find((s) => s.id === swapSlot.session)
        ?.slots.find((s) => s.slot === swapSlot.slot)
    : undefined;
  const swapChoice = swapSlot
    ? choices.get(`${swapSlot.session}|${swapSlot.slot}`)
    : undefined;
  const swapCurrent = swapChoice
    ? creditById.get(swapChoice.exerciseId)
    : undefined;

  const regionByExercise = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of template.sessions)
      for (const slot of s.slots)
        for (const e of slot.menu) {
          const hit = p.library.find(
            (x) =>
              !x.isCustom && x.name.toLowerCase() === e.matchKey.toLowerCase(),
          );
          if (hit) m.set(hit.id, slot.region);
        }
    return m;
  }, [template, p.library]);

  const sessionCount = view.sessions.length;
  const fixed = template.block.kind === "fixed" ? template.block.fixed : null;
  const unresolved = resolved.unresolved.length;
  const fitPatch =
    answers.minutes && maxMin > answers.minutes
      ? fitToMinutes(view, answers.minutes)
      : [];

  return (
    <Shell
      title={template.name}
      onBack={p.onBack}
      footer={
        <div className="flex flex-col gap-2">
          {p.error && (
            <p role="alert" className="text-xs text-neg">
              {p.error}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={
              p.saving ||
              p.loading ||
              resolved.program.routines.every((r) => r.exercises.length === 0)
            }
            data-testid="builder-save"
            onClick={() => {
              const config = buildSavedConfig(template, answers, {
                philosophy,
                overrides,
                startedAt: Date.now(),
                everyWeeks: p.everyWeeks,
              });
              void p.onSave(resolved.program, config, { name: template.name });
            }}
          >
            {p.saving ? "Saving…" : p.editing ? "Save changes" : "Save program"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm text-soft">{template.summary}</p>
      </div>

      {p.undo && (
        <div
          className="flex items-center justify-between gap-2 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-ink"
          role="status"
        >
          Change applied.
          <Button
            size="sm"
            variant="outline"
            data-testid="undo"
            onClick={() => {
              p.setOverrides(p.undo ?? []);
              p.setUndo(null);
            }}
          >
            Undo
          </Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Schedule"
          value={scheduleLabel(view.schedule).split(" · ")[1]}
          basis={scheduleLabel(view.schedule).split(" · ")[0]}
        />
        <StatTile
          label="Per session"
          value={minMin === maxMin ? `${maxMin}` : `${minMin}-${maxMin}`}
          unit="min"
          basis="estimate"
        />
        <StatTile
          label="Sets"
          value={String(totalSets)}
          basis={sessionCount > 1 ? `${sessionCount} sessions` : "per session"}
        />
      </div>

      <section>
        <SectionHeader title="Template" />
        <ChipGroup
          className="flex-nowrap overflow-x-auto px-4 pb-1"
          value={template.id}
          onValueChange={(v) => v && p.onPickTemplate(v)}
          aria-label="Template"
        >
          {PROGRAM_TEMPLATES.map((tp) => (
            <ChipItem key={tp.id} value={tp.id}>
              {tp.id === "frog-default"
                ? "Frog default"
                : tp.name.replace("Research ", "R").split(":")[0]}
            </ChipItem>
          ))}
        </ChipGroup>
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3">
          <label htmlFor="sw-top" className="flex items-center gap-2 text-sm">
            <Switch
              id="sw-top"
              checked={philosophy.firstSet !== "off"}
              onCheckedChange={(on) =>
                p.setPhilosophy({ ...philosophy, firstSet: on ? "top" : "off" })
              }
              aria-label="Top set first"
            />
            Top set first
          </label>
          <label htmlFor="sw-rep" className="flex items-center gap-2 text-sm">
            <Switch
              id="sw-rep"
              checked={philosophy.repBias === "heavy"}
              onCheckedChange={(on) =>
                p.setPhilosophy({
                  ...philosophy,
                  repBias: on ? "heavy" : "research",
                })
              }
              aria-label="4-8 reps on isolation"
            />
            4-8 reps on isolation
          </label>
        </div>
        <p className="px-4 pt-1 text-xs text-soft">
          Top set first is a method, not a research rule. Isolation can grow at
          4-8 or 10-15 (R8).
        </p>
      </section>

      <section>
        <SectionHeader title="Weekly sets per muscle" />
        <WeeklyMeter
          validation={validation}
          onMuscle={(m) =>
            setWhy({
              rule: "R6",
              title: "Weekly sets",
              saw: `${m.replace(/-/g, " ")}: ${(Math.round((validation.weekly[m]?.total ?? 0) * 10) / 10).toString()} fractional sets a week.`,
            })
          }
        />
      </section>

      <section>
        <SectionHeader title="Per session" />
        <SessionStrip sessions={validation.perSession} />
      </section>

      {view.sessions.map((s) => {
        const groups = groupBy(s.slots, (x) => {
          const tslot = template.sessions
            .find((y) => y.id === s.id)
            ?.slots.find((y) => y.slot === x.slot);
          return tslot ? groupLabel(tslot, grouping) : "Other";
        });
        return (
          <section key={s.id} data-testid={`session-${s.id}`}>
            <SectionHeader
              title={s.name}
              action={
                <ChipGroup
                  value={grouping}
                  onValueChange={(v) => v && setGrouping(v as Grouping)}
                  aria-label="Group exercises by"
                >
                  <ChipItem value="joint_action">Joint action</ChipItem>
                  <ChipItem value="region">Region</ChipItem>
                </ChipGroup>
              }
            />
            {groups.map((g) => (
              <div key={g.label}>
                <p className="px-4 pt-2 pb-1 text-xs font-semibold text-soft">
                  {g.label}
                </p>
                <ul className="flex flex-col gap-1 px-2">
                  {g.items.map((slot) => {
                    const c = choices.get(`${s.id}|${slot.slot}`);
                    return (
                      <li
                        key={slot.slot}
                        className="flex items-center gap-2 rounded-md bg-surface-2 py-2 pr-1 pl-3"
                        data-testid={`slot-${slot.slot}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">
                            {c?.name ?? "No exercise matches your equipment"}
                          </p>
                          <p className="num text-xs text-soft">
                            {prescriptionText(slot.rx)}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              title="Slot options"
                              data-testid={`slot-menu-${slot.slot}`}
                            >
                              <DotsThree weight="bold" className="size-4" />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onSelect={() =>
                                setSwapSlot({ session: s.id, slot: slot.slot })
                              }
                            >
                              Swap
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                setEditSlot({ session: s.id, slot: slot.slot })
                              }
                            >
                              Sets, reps, RIR
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                setWhy({
                                  rule: slot.rules?.[0] ?? "R8b",
                                  title: c?.name ?? slot.slot,
                                  saw: c?.why ?? prescriptionText(slot.rx),
                                })
                              }
                            >
                              Why?
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              danger
                              onSelect={() =>
                                apply(
                                  upsertOverride(overrides, {
                                    slot: slot.slot,
                                    session:
                                      view.sessions.length > 1
                                        ? s.id
                                        : undefined,
                                    remove: true,
                                  }),
                                )
                              }
                            >
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
      <p className="px-4 text-xs text-soft">{GROUPING_NOTE}</p>
      {unresolved > 0 && (
        <p className="px-4 text-xs text-attn" role="status">
          {unresolved} slot{unresolved === 1 ? "" : "s"} had no exercise for
          your equipment and were left out.
        </p>
      )}

      <section>
        <SectionHeader title="Deload plan" />
        <div className="flex flex-col gap-3 px-4">
          {fixed ? (
            <p className="text-sm text-ink">
              {fixed.trainingWeeks} training weeks, deload in week{" "}
              {fixed.deloadWeek}
              {fixed.retestWeek ? ", retest the week after" : ""}.
            </p>
          ) : (
            <>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Deload every{" "}
                  <span
                    className="num font-semibold"
                    data-testid="deload-weeks"
                  >
                    {p.everyWeeks}
                  </span>{" "}
                  weeks
                </span>
                <input
                  type="range"
                  min={PROGRAM_RULES.deloadIntervalWeeks[0]}
                  max={PROGRAM_RULES.deloadIntervalWeeks[1]}
                  step={1}
                  value={p.everyWeeks}
                  onChange={(e) => p.setEveryWeeks(Number(e.target.value))}
                  aria-label="Weeks between deloads"
                  className="h-10 w-40 accent-[var(--chart-mark)]"
                />
              </label>
            </>
          )}
          <p className="text-xs text-soft">
            Half the sets, same loads, 3-4 RIR. A deload is for fatigue and
            recovery; its effect on size is unknown. Frog also proposes one if
            strength drops two weeks running.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() =>
              setWhy({
                rule: "R17",
                title: "Deload",
                saw: `Planned every ${p.everyWeeks} weeks.`,
              })
            }
          >
            <Flame className="size-4" /> Why?
          </Button>
        </div>
      </section>

      <section>
        <SectionHeader title="Heads-ups" count={validation.findings.length} />
        <FindingsList
          findings={validation.findings}
          onWhy={(f) =>
            setWhy({
              rule: f.rule,
              title: f.code.replace(/_/g, " ").toLowerCase(),
              saw: f.message,
            })
          }
          onFix={(f) => f.fix && apply(applyPatch(overrides, f.fix.patch))}
        />
        {fitPatch.length > 0 &&
          !validation.findings.some((f) => f.fix && f.code === "TIME_OVER") && (
            <div className="px-4 pt-2">
              <Button
                size="sm"
                variant="accent"
                onClick={() => apply(applyPatch(overrides, fitPatch))}
              >
                Trim to {answers.minutes} min
              </Button>
            </div>
          )}
      </section>

      {why && (
        <RuleSheet
          open
          onOpenChange={(o) => !o && setWhy(null)}
          ruleId={why.rule}
          title={why.title}
          saw={why.saw}
          counterView={
            template.author === "frog-default"
              ? "Method beyond the evidence: top set first and 4-8 reps on every lift are Oliver's method (tier T5). Research programs use flat RIR and 10-15 on isolation."
              : undefined
          }
        />
      )}
      {editing && editSlot && (
        <EditSlotSheet
          open
          onOpenChange={(o) => !o && setEditSlot(null)}
          title={
            choices.get(`${editSlot.session}|${editSlot.slot}`)?.name ??
            "Exercise"
          }
          slot={editing}
          sessionId={view.sessions.length > 1 ? editSlot.session : undefined}
          onApply={(o) => apply(upsertOverride(overrides, o))}
        />
      )}
      {swapping && swapSlot && swapCurrent && (
        <SwapSheet
          open
          onOpenChange={(o) => !o && setSwapSlot(null)}
          current={swapCurrent as unknown as SwapCandidate}
          library={p.exercises as unknown as SwapCandidate[]}
          slot={swapping}
          currentRegion={
            template.sessions
              .find((x) => x.id === swapSlot.session)
              ?.slots.find((x) => x.slot === swapSlot.slot)?.region ?? null
          }
          regionOf={(id) => regionByExercise.get(id) ?? null}
          perWeek={perWeek}
          excludeIds={
            new Set(
              choices.size
                ? [...choices.values()].map((c) => c.exerciseId)
                : [],
            )
          }
          onPick={(e) =>
            apply(
              upsertOverride(overrides, {
                slot: swapSlot.slot,
                session:
                  view.sessions.length > 1 ? swapSlot.session : undefined,
                exerciseId: e.id,
              }),
            )
          }
        />
      )}
      <ConfirmDialog
        open={p.confirmRebuild}
        onOpenChange={p.setConfirmRebuild}
        title="Rebuild your routines?"
        description="Your program's routines are replaced with this plan. Logged sessions stay in history, but detach from the old routines."
        confirmLabel="Rebuild"
        onConfirm={() => {
          const config = buildSavedConfig(template, answers, {
            philosophy,
            overrides,
            startedAt: p.startedAt ?? Date.now(),
            everyWeeks: p.everyWeeks,
          });
          void p.onRebuild(resolved.program, config);
        }}
      />
    </Shell>
  );
}
