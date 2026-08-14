import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ElementType,
} from "react";
import { cn } from "@/lib/utils";

type IconButtonVariants = {
  /** Accent "on" glow — a running rest stopwatch, a live state. */
  active?: boolean;
  /** Red hover — destructive actions (remove exercise). */
  danger?: boolean;
};

/**
 * The app's one square icon button treatment: 40px on touch, 32px on desktop,
 * a single border + surface-fill so an icon control is always the same size
 * and style rather than a per-screen copy. Shared by `IconButton` (button
 * elements) and `IconLink` (navigation elements) so a bare, backgroundless
 * icon-only `<Link>` never stands in for it.
 */
export function iconButtonClass({
  active = false,
  danger = false,
  className,
}: IconButtonVariants & { className?: string } = {}) {
  return cn(
    "flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-ink disabled:opacity-40 disabled:hover:bg-surface-2 disabled:hover:text-faint md:size-8",
    active &&
      "border-accent bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
    danger && "hover:text-neg",
    className,
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  IconButtonVariants;

/**
 * Header toolbars, in-row ⋯ cells and standalone icon controls are built on
 * this, so an icon button is always the same size and style rather than a
 * per-screen copy.
 */
export function IconButton({
  active,
  danger,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={iconButtonClass({ active, danger, className })}
      {...props}
    />
  );
}

type IconLinkProps<T extends ElementType> = IconButtonVariants & {
  // Accepts react-router's <Link>/<NavLink> as the rendered element so the
  // icon-button treatment applies to navigation, not just onClick actions.
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof IconButtonVariants | "as">;

/**
 * The `IconButton` treatment for a navigation control (a back arrow, an
 * icon-only row link) — same size/border/surface, rendered as `as` (defaults
 * to a plain `<a>`; pass react-router's `Link` for in-app navigation).
 */
export function IconLink<T extends ElementType = "a">({
  active,
  danger,
  className,
  as,
  ...props
}: IconLinkProps<T>) {
  const As = (as ?? "a") as ElementType;
  return (
    <As className={iconButtonClass({ active, danger, className })} {...props} />
  );
}
