import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { themePortalContainer } from "@/lib/theme-portal";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // The on-screen keyboard shrinks the *visual* viewport without resizing the
  // layout viewport, so a focused field near the bottom of the sheet can end
  // up hidden behind it — the user has to dismiss the keyboard and re-tap to
  // see what they're typing. Nudge whatever's focused back into view whenever
  // the visual viewport resizes (keyboard open/close/resize).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        scrollRef.current?.contains(active)
      ) {
        active.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      // Mobile's sheet is `position: fixed; bottom: 0` against the *layout*
      // viewport — iOS's on-screen keyboard overlays that instead of resizing
      // it, so the sheet (and its Discard/Save-style footer) stays pinned
      // underneath. There's no pure-CSS fix for a fixed element against a
      // viewport CSS never sees shrink, so translate it up by the keyboard's
      // own height instead. Desktop's centered card has no on-screen keyboard
      // to dodge (and already owns the transform for centering), so this is
      // mobile-only.
      if (window.innerWidth < 768 && contentRef.current) {
        const keyboardHeight = Math.max(0, window.innerHeight - vv.height);
        contentRef.current.style.transform =
          keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : "";
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return (
    // Portal into the Radix Themes root, not <body>, so the overlay inherits
    // Radix's scoped tokens (radius, --color-panel-solid). See theme-portal.ts.
    <DialogPrimitive.Portal container={themePortalContainer()}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-(--overlay)" />
      <DialogPrimitive.Content
        ref={contentRef}
        className={cn(
          "float-in fixed z-50 flex w-full flex-col border border-border bg-(--color-panel-solid) shadow-(--shadow-6)",
          // Never taller than the viewport; the body scrolls inside.
          "max-h-[90dvh]",
          // Mobile: bottom sheet, rounded top corners only (flush to the
          // screen edge below). ≥md: vertically-centered card, fully rounded.
          "rounded-t-lg max-md:inset-x-0 max-md:bottom-0 max-md:border-b-0",
          "md:top-1/2 md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg",
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
        <div
          ref={scrollRef}
          // On mobile the sheet sits flush to the screen edge (see above), so
          // its own bottom padding is the only thing between action buttons
          // and the home indicator — max-md:pb-safe-footer (theme.css) adds
          // the safe-area inset plus a comfortable minimum on top of it.
          className="min-h-0 flex-1 overflow-y-auto p-4 max-md:pb-safe-footer"
        >
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
