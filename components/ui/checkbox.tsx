"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
    React.ElementRef<typeof CheckboxPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
            "peer h-[18px] w-[18px] shrink-0 rounded-[var(--v3-r-sm)] border border-[var(--v3-border-strong)] bg-white text-white transition-all duration-200 focus-visible:outline-none focus-visible:shadow-[var(--v3-shadow-focus)] disabled:cursor-not-allowed disabled:bg-[var(--v3-bg-alt)] disabled:opacity-100 data-[state=checked]:border-[var(--v3-primary)] data-[state=checked]:bg-[var(--v3-primary)]",
            className
        )}
        {...props}
    >
        <CheckboxPrimitive.Indicator
            className={cn("flex items-center justify-center text-current")}
        >
            <Check className="h-3 w-3 stroke-[3px]" />
        </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
