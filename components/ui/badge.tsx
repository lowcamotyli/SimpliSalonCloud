import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils/cn"

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--v3-r-pill)] border border-transparent px-2.5 py-[3px] font-ui text-[11px] font-semibold leading-[1.4] transition-colors focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[var(--v3-shadow-focus)]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--v3-success-bg)] text-[var(--v3-success)]",
        secondary:
          "bg-[var(--v3-bg-alt)] text-[var(--v3-text-secondary)] border-[var(--v3-border)]",
        destructive:
          "bg-[var(--v3-error-bg)] text-[var(--v3-error)]",
        outline:
          "bg-[var(--v3-bg-alt)] text-[var(--v3-text-secondary)] border-[var(--v3-border)]",
        success:
          "bg-[var(--v3-success-bg)] text-[var(--v3-success)]",
        warning:
          "bg-[var(--v3-warning-bg)] text-[var(--v3-warning)]",
        info:
          "bg-[var(--v3-info-bg)] text-[var(--v3-info)]",
        neutral:
          "bg-[var(--v3-bg-alt)] text-[var(--v3-text-secondary)] border-[var(--v3-border)]",
        gold:
          "bg-[var(--v3-gold-soft)] text-[var(--v3-gold)] border-[#E9D6A8]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  const resolvedVariant = variant ?? "default"
  return (
    <div
      className={cn("theme-badge", badgeVariants({ variant }), className)}
      data-variant={resolvedVariant}
      data-size="default"
      {...props}
    />
  )
}

export { Badge, badgeVariants }
