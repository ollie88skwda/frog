import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Toggle = round by convention (Because §3.2 rule 3: pills only for toggles).
export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-hover p-0.5 transition-colors duration-150 data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-raised shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}
