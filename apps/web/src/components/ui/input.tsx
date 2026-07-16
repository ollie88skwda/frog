import { TextField } from "@radix-ui/themes";
import type { ComponentProps } from "react";

// TextField.Root puts `className` on its wrapper <div> and spreads every other
// prop onto the inner <input> (whose own class list is fixed). That split is
// what makes this a drop-in:
//   - data-testid, value/onChange/onKeyDown, inputMode, autoFocus -> the input,
//     so every e2e selector and the logging keyboard path are unaffected;
//   - call-site sizing (h-8, w-16, flex-1) -> the wrapper, which is
//     display:flex/align-items:stretch, so the input still fills it;
//   - call-site text classes (num, text-xs, text-soft) -> the wrapper, and
//     inherit down into the input. `num` beats Radix's own font-family because
//     Tailwind utilities sit in a later cascade layer than radix (theme.css).
type InputProps = Omit<
  ComponentProps<typeof TextField.Root>,
  "size" | "variant" | "color"
>;

export function Input({ className, ...props }: InputProps) {
  return (
    <TextField.Root
      // 2 = 32px, holding the previous h-8 default so no layout shifts.
      size="2"
      // Filled + bordered, so it still reads as tappable/editable on touch
      // rather than blending into the row surface (mobile-first).
      variant="surface"
      className={className}
      {...props}
    />
  );
}
