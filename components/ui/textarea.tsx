import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn(
                    "flex min-h-[88px] w-full rounded-[var(--v3-r-sm)] border border-[var(--v3-border)] bg-white px-3 py-2.5 font-ui text-sm leading-6 text-[var(--v3-text-primary)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--v3-text-secondary)] hover:border-[var(--v3-border-strong)] focus-visible:border-[var(--v3-border-focus)] focus-visible:outline-none focus-visible:shadow-[var(--v3-shadow-focus)] disabled:cursor-not-allowed disabled:bg-[var(--v3-bg-alt)] disabled:text-[var(--v3-text-disabled)] disabled:opacity-100",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = "Textarea"

export { Textarea }
