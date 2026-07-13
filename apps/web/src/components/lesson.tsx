import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { LESSONS, type LessonId, useLessonSeen } from "@/lib/lessons";

// Tiny info affordance that opens a quick lesson. Unseen lessons show an
// accent square dot; opening marks them seen (localStorage).
export function InfoTip({ lessonId }: { lessonId: LessonId }) {
  const lesson = LESSONS[lessonId];
  const { seen, markSeen } = useLessonSeen(lessonId);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) markSeen();
      }}
    >
      <DialogTrigger
        className="relative justify-self-center p-1 text-faint transition-colors duration-100 hover:text-ink"
        title={lesson.title}
        data-testid={`infotip-${lessonId}`}
      >
        <Info className="size-4" />
        {!seen && <span className="absolute top-0 right-0 size-1 bg-accent" />}
      </DialogTrigger>
      <DialogContent title={lesson.title}>
        <div className="flex flex-col gap-2">
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
      </DialogContent>
    </Dialog>
  );
}
