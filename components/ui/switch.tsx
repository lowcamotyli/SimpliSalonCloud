"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
        className={cn(
            "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[var(--v3-r-pill)] border border-transparent bg-[var(--v3-border-strong)] transition-colors duration-200 focus-visible:outline-none focus-visible:shadow-[var(--v3-shadow-focus)] disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-[var(--v3-primary)] data-[state=unchecked]:bg-[var(--v3-border-strong)]",
            className
        )}
        {...props}
        ref={ref}
    >
        <SwitchPrimitives.Thumb
            className={cn(
                "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] ring-0 transition-transform duration-200 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
            )}
        />
    </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
