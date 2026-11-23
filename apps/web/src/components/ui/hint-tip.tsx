import { Info } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/**
 * The ⓘ that holds an explanation so the screen shows only the label.
 * Same icon and sheet as `InfoTip` (lesson.tsx) but takes inline copy, for
 * hints that are a sentence rather than a lesson. 44px hit area, never visible
 * chrome beyond the 16px icon on its resting fill.
 */
export function HintTip({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-xs bg-surface-2 text-soft transition-colors duration-100 after:absolute after:-inset-3 hover:text-ink"
        aria-label={`About ${title}`}
        title={`About ${title}`}
      >
        <Info aria-hidden="true" className="size-4" />
      </DialogTrigger>
      <DialogContent title={title}>
        <div className="flex flex-col gap-2 text-xs text-ink-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
