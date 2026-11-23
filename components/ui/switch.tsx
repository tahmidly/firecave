"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex h-4 w-6 shrink-0 items-center rounded-[4px] p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring data-checked:bg-primary data-checked:shadow-[var(--elev-switch-on)] data-unchecked:bg-layer-4 data-unchecked:shadow-[var(--elev-switch-off)] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3 rounded-[2px] bg-white shadow-[0_0.5px_0.5px_#00000066] transition-transform data-checked:translate-x-2 data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
