import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium select-none " +
    "transition-[background-color,border-color,color,box-shadow] duration-150 ease-(--ease-out-quad) " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-brand text-accent-fg hover:bg-accent-hover",
        // Linear's signature secondary control: translucent fill + inset hairlines.
        outline:
          "bg-translucent text-ink shadow-(--inset-control) hover:bg-surface-hover",
        // Even the lightest control keeps a visible surface — no bare
        // text-only buttons (AGENTS.md: every button has a background).
        ghost: "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
        danger:
          "text-neg bg-translucent shadow-(--inset-control) hover:bg-neg/10",
      },
      size: {
        sm: "h-8 px-2 text-xs",
        md: "h-8 px-3 text-sm",
        lg: "h-10 px-4 text-sm",
        icon: "size-8 text-soft",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
