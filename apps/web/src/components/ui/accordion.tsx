import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Radix Accordion on the frog tokens (square, 1px borders, flat surfaces).
export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border border-border bg-surface", className)}
      {...props}
    />
  );
}

/** The whole header row is the trigger in the stock component; here the row
 * carries other controls (machine chip, ⋯), so the caller composes the row and
 * hands us only the part that toggles. */
export function AccordionTrigger({
  className,
  children,
  chevron = true,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger> & { chevron?: boolean }) {
  return (
    <AccordionPrimitive.Header className="flex min-w-0 flex-1">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          className,
        )}
        {...props}
      >
        {children}
        {chevron && (
          <ChevronDown className="size-3.5 shrink-0 text-faint transition-transform duration-150 group-data-[state=open]:rotate-180" />
        )}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden"
      {...props}
    >
      <div className={className}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
