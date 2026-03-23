"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type RadioGroupContextValue = {
  name: string
  value?: string
  onValueChange?: (value: string) => void
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null)

type RadioGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: string
  onValueChange?: (value: string) => void
  name?: string
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, name, ...props }, ref) => {
    const generatedName = React.useId()
    const contextValue = React.useMemo(
      () => ({
        name: name ?? generatedName,
        value,
        onValueChange,
      }),
      [generatedName, name, onValueChange, value]
    )

    return (
      <RadioGroupContext.Provider value={contextValue}>
        <div
          ref={ref}
          role="radiogroup"
          className={cn("grid gap-2", className)}
          {...props}
        />
      </RadioGroupContext.Provider>
    )
  }
)
RadioGroup.displayName = "RadioGroup"

type RadioGroupItemProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  value: string
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, checked, onChange, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext)
    const isChecked = context ? context.value === value : checked

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event)
      if (event.target.checked) {
        context?.onValueChange?.(value)
      }
    }

    return (
      <input
        ref={ref}
        type="radio"
        value={value}
        name={context?.name}
        checked={isChecked}
        onChange={handleChange}
        className={cn(
          "relative h-4 w-4 cursor-pointer appearance-none rounded-full border border-primary bg-background ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 checked:bg-primary",
          // The "dot" effect using a thick border on checked state
          "checked:border-[4px] checked:border-background",
          // Add a subtle shadow when checked to make it pop
          "checked:shadow-[0_0_0_1px_hsl(var(--primary))]",
          className
        )}
        {...props}
      />
    )
  }
)
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
