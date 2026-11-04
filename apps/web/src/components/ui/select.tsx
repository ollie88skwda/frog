import { CaretDown, Check } from "@phosphor-icons/react";
import * as SelectPrimitive from "@radix-ui/react-select";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Because select anatomy: trigger carries the single 1px field line; the
// listbox is a raised, shadowed surface with no line. Drop-in for the old
// Radix-Themes `Select.Root/Trigger/Content/Item` call sites.
export const Select = {
  Root: SelectPrimitive.Root,
  Group: SelectPrimitive.Group,
  Trigger({
    className,
    placeholder,
    ...props
  }: ComponentProps<typeof SelectPrimitive.Trigger> & {
    placeholder?: string;
  }) {
    return (
      <SelectPrimitive.Trigger
        className={cn(
          "inline-flex h-8 min-w-0 items-center justify-between gap-2 rounded-sm border border-field bg-sunken px-3 text-sm text-ink outline-none focus-visible:border-focus disabled:cursor-not-allowed disabled:bg-hover disabled:text-disabled",
          className,
        )}
        {...props}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <CaretDown aria-hidden="true" size={16} className="shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    );
  },
  Content({
    className,
    children,
    position = "popper",
    ...props
  }: ComponentProps<typeof SelectPrimitive.Content>) {
    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position={position}
          sideOffset={4}
          className={cn(
            "float-in relative z-[60] max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md bg-raised text-ink shadow-lg",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.Viewport className="p-1">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  },
  Item({
    className,
    children,
    ...props
  }: ComponentProps<typeof SelectPrimitive.Item>) {
    return (
      <SelectPrimitive.Item
        className={cn(
          "relative flex min-h-9 w-full cursor-default items-center rounded-sm py-1.5 pr-3 pl-8 text-sm outline-none select-none focus:bg-hover data-[disabled]:pointer-events-none data-[disabled]:text-disabled data-[state=checked]:bg-accent-selected",
          className,
        )}
        {...props}
      >
        <span
          className="absolute left-2 flex size-4 items-center justify-center"
          aria-hidden="true"
        >
          <SelectPrimitive.ItemIndicator>
            <Check size={14} />
          </SelectPrimitive.ItemIndicator>
        </span>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
    );
  },
  Separator: SelectPrimitive.Separator,
  Label({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
    return (
      <SelectPrimitive.Label
        className={cn("px-2 py-1.5 text-xs font-bold text-soft", className)}
        {...props}
      />
    );
  },
};
