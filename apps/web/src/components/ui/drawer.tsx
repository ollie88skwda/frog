import type { ComponentProps } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { themePortalContainer } from "@/lib/theme-portal";
import { cn } from "@/lib/utils";

// Vaul bottom drawer, re-skinned onto the frog tokens (square corners, 1px
// low-contrast borders, flat surfaces — docs/brand). shadcn's stock file was
// the starting point; the direction-matrix classes are dropped because every
// drawer in this app opens from the bottom.
export const Drawer = DrawerPrimitive.Root;
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerTitle = DrawerPrimitive.Title;
export const DrawerDescription = DrawerPrimitive.Description;

export function DrawerOverlay({
  className,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-30 bg-(--overlay)", className)}
      {...props}
    />
  );
}

/** The drag handle Vaul's own gesture targets — also the visual affordance
 * ("pull me up") in the E1/E2 mockups. */
export function DrawerHandle({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center py-2", className)}>
      <span className="h-1 w-11 rounded-full bg-border-strong" />
    </div>
  );
}

export function DrawerContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    // Portal into the Radix Themes root, not <body>, so the panel inherits the
    // scoped tokens (see theme-portal.ts) exactly like Dialog does.
    <DrawerPrimitive.Portal container={themePortalContainer()}>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          // Full viewport height is a Vaul snap-point requirement: its offsets
          // are computed against window.innerHeight, so a shorter element gets
          // translated clean off the screen. Only the top `snapPoint` px of
          // this element is ever on screen.
          "fixed inset-x-0 bottom-0 z-40 flex h-full flex-col outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}
