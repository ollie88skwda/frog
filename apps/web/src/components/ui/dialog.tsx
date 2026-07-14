import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-(--overlay)" />
      <DialogPrimitive.Content
        className={cn(
          "float-in floating fixed z-50 flex w-full flex-col",
          // Never taller than the viewport; the body scrolls inside.
          "max-h-[90dvh]",
          // Mobile: bottom sheet. ≥md: vertically-centered card (so it never
          // runs off the bottom, at any browser zoom — the body scrolls).
          "max-md:inset-x-0 max-md:bottom-0 max-md:border-b-0",
          "md:top-1/2 md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2",
          className,
        )}
        {...props}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <DialogPrimitive.Title className="text-sm font-medium">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="rounded-sm p-0.5 text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
