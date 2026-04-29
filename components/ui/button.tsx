"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--v3-r-pill)] border-0 font-ui text-sm font-semibold transition-[background,box-shadow,color,border-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[var(--v3-shadow-focus)] disabled:cursor-not-allowed disabled:bg-[var(--v3-text-disabled)] disabled:text-white disabled:shadow-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--v3-primary)] text-white hover:bg-[var(--v3-primary-hover)] hover:shadow-[0_2px_8px_rgba(50,133,95,0.25)] active:bg-[#1F5A40]",
        destructive:
          "bg-[var(--v3-error)] text-white hover:bg-[#B92B3A]",
        outline:
          "border border-[var(--v3-secondary)] bg-white text-[var(--v3-secondary)] hover:bg-[var(--v3-secondary-soft)] active:bg-[#D7E5F4]",
        secondary:
          "border border-[var(--v3-secondary)] bg-white text-[var(--v3-secondary)] hover:bg-[var(--v3-secondary-soft)] active:bg-[#D7E5F4]",
        ghost:
          "border border-[var(--v3-border-strong)] bg-transparent text-[var(--v3-text-primary)] hover:border-[var(--v3-text-secondary)] hover:bg-[var(--v3-bg-alt)]",
        link:
          "h-auto bg-transparent px-1 py-0 text-[var(--v3-accent)] hover:text-[var(--v3-accent-hover)] hover:underline disabled:bg-transparent disabled:text-[var(--v3-text-disabled)]",
        gold:
          "border border-[var(--v3-gold)] bg-white text-[var(--v3-gold)] hover:bg-[var(--v3-gold-soft)]",
        info:
          "border border-[var(--v3-secondary)] bg-white text-[var(--v3-secondary)] hover:bg-[var(--v3-secondary-soft)] active:bg-[#D7E5F4]",
        neutral:
          "border border-[var(--v3-border-strong)] bg-transparent text-[var(--v3-text-primary)] hover:border-[var(--v3-text-secondary)] hover:bg-[var(--v3-bg-alt)]",
      },
      size: {
        default: "h-10 px-5 py-0",
        sm: "h-8 px-3.5 py-0 text-[13px]",
        lg: "h-12 px-6 py-0 text-[15px]",
        icon:
          "h-8 w-8 rounded-full border border-[var(--v3-border)] bg-white p-0 text-[var(--v3-text-primary)] hover:bg-[var(--v3-bg-alt)] hover:text-[var(--v3-accent)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const resolvedVariant = variant ?? "default"
    const resolvedSize = size ?? "default"
    return (
      <Comp
        className={cn("theme-button", buttonVariants({ variant, size, className }))}
        data-variant={resolvedVariant}
        data-size={resolvedSize}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
