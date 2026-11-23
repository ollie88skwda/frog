import { Info } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Small info icon that opens the explanation as a sheet. Use it to keep a
 * screen's primary read short: the number or verdict stays visible, the "why"
 * and the basis live here. 44px touch target via the enlarged ::after.
 */
export function InfoNote({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "relative rounded-xs bg-surface-2 p-1 text-soft press duration-100 after:absolute after:-inset-2.5 hover:text-ink",
          className,
        )}
        aria-label={title}
        title={title}
      >
        <Info className="size-4" />
      </DialogTrigger>
      <DialogContent title={title} aria-describedby={undefined}>
        <div className="flex flex-col gap-2 text-xs text-ink-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
