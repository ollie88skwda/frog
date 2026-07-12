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
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-[20%] left-1/2 z-50 w-full max-w-md -translate-x-1/2",
          "rounded-lg border border-border bg-surface shadow-xl shadow-black/20",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <DialogPrimitive.Title className="text-sm font-medium">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="rounded-sm p-0.5 text-soft hover:bg-surface-hover hover:text-ink">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
