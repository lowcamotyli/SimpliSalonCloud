"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "theme-input flex h-10 w-full rounded-[var(--v3-r-sm)] border border-[var(--v3-border)] bg-white px-3 py-0 font-ui text-sm text-[var(--v3-text-primary)] outline-none transition-[border-color,box-shadow] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--v3-text-secondary)] hover:border-[var(--v3-border-strong)] focus-visible:border-[var(--v3-border-focus)] focus-visible:outline-none focus-visible:shadow-[var(--v3-shadow-focus)] disabled:cursor-not-allowed disabled:bg-[var(--v3-bg-alt)] disabled:text-[var(--v3-text-disabled)] disabled:opacity-100",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
