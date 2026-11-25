import { X } from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  FADE_IN,
  FADE_OUT,
  m,
  SLIDE,
  useMotionReady,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

// The open state, mirrored so DialogContent can stay mounted (forceMount)
// through its exit animation instead of Radix unmounting it on the spot.
const OpenContext = createContext(false);

/** Radix Dialog root that also tracks uncontrolled open state for the exit animation. */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof DialogPrimitive.Root>) {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const isOpen = open ?? inner;
  return (
    <OpenContext.Provider value={isOpen}>
      <DialogPrimitive.Root
        open={isOpen}
        onOpenChange={(next) => {
          setInner(next);
          onOpenChange?.(next);
        }}
        {...props}
      />
    </OpenContext.Provider>
  );
}
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  onPointerDownOutside,
  onFocusOutside,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: ReactNode }) {
  const open = useContext(OpenContext);
  const motionReady = useMotionReady();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // The content stays mounted through its exit, so Radix's outside-tap and
  // outside-focus listeners are still live. On touch, Radix fires the outside
  // tap on the *click*, after React has handled it: the very tap that reopens
  // this dialog would close it again. Ignore any outside event that began
  // before the dialog last opened.
  const openedAt = useRef(0);
  useLayoutEffect(() => {
    if (open) openedAt.current = performance.now();
  }, [open]);
  const stale = (e: { detail: { originalEvent: Event } }) =>
    e.detail.originalEvent.timeStamp < openedAt.current;

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
        // `translate`, not `transform`: motion owns the sheet's transform
        // for its spring in/out, and the two properties compose.
        contentRef.current.style.translate =
          keyboardHeight > 0 ? `0 -${keyboardHeight}px` : "";
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Mobile: the bottom sheet springs up from the screen edge. Desktop: the
  // centred card fades in with a slight scale. Reduced motion keeps the fade.
  const sheet =
    typeof window !== "undefined" &&
    window.matchMedia?.("(max-width: 767px)").matches;
  const hidden = sheet ? { y: "100%" } : { opacity: 0, scale: 0.97 };

  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal forceMount key="dialog">
          <DialogPrimitive.Overlay forceMount asChild>
            <m.div
              // Closing: let taps through while the scrim fades out, so the
              // exit animation never delays input (`!` beats Radix's inline
              // pointer-events: auto).
              className="fixed inset-0 z-50 bg-scrim data-[state=closed]:pointer-events-none!"
              initial={motionReady ? { opacity: 0 } : false}
              animate={{ opacity: 1, transition: FADE_IN }}
              exit={{ opacity: 0, transition: FADE_OUT }}
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content
            forceMount
            asChild
            onPointerDownOutside={(e) => {
              if (stale(e)) e.preventDefault();
              else onPointerDownOutside?.(e);
            }}
            onFocusOutside={(e) => {
              if (stale(e)) e.preventDefault();
              else onFocusOutside?.(e);
            }}
            {...props}
          >
            <m.div
              ref={contentRef}
              initial={motionReady ? hidden : false}
              animate={{ y: 0, opacity: 1, scale: 1, transition: SLIDE }}
              exit={{
                ...hidden,
                transition: FADE_OUT,
              }}
              className={cn(
                "fixed z-50 flex w-full flex-col bg-raised shadow-lg data-[state=closed]:pointer-events-none",
                // Never taller than the viewport; the body scrolls inside.
                "max-h-[90dvh]",
                // Mobile: bottom sheet, rounded top corners only (flush to the
                // screen edge below). ≥md: vertically-centered card, fully rounded.
                "rounded-t-md max-md:inset-x-0 max-md:bottom-0",
                "md:top-1/2 md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-md",
                className,
              )}
            >
              <div className="flex shrink-0 items-center justify-between px-4 py-2">
                <DialogPrimitive.Title className="text-sm font-medium">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="relative flex size-11 items-center justify-center rounded-sm bg-surface-2 text-soft press duration-150 after:absolute after:-inset-0.5 hover:bg-surface-hover hover:text-ink md:size-8"
                >
                  <X aria-hidden="true" className="size-4" />
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
            </m.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}
