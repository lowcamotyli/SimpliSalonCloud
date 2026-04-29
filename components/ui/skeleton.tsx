import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("animate-pulse rounded-[var(--v3-r-sm)] bg-[var(--v3-bg-alt)]", className)}
            {...props}
        />
    )
}

export { Skeleton }
