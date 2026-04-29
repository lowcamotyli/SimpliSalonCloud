// This is now a Server Component to avoid serialization issues with Lucide icons

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowUpRight, ArrowDownRight, LucideIcon } from "lucide-react"
import Link from "next/link"

interface StatCardProps {
    title: string
    value: string | number
    icon: LucideIcon
    color: string
    lightColor: string
    trend?: {
        value: number
        isPositive: boolean
    }
    description?: string
    index: number
    href?: string
}

export function StatCard({
    title,
    value,
    icon: Icon,
    trend,
    description,
    index,
    href
}: StatCardProps) {
    const cardContent = (
        <Card className="stat-card group relative h-full overflow-hidden bg-[var(--v3-surface)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--v3-border-strong)] hover:shadow-[var(--v3-shadow-card-hover)]">
            <CardHeader className="relative pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="theme-stat-card-title font-ui text-xs font-semibold uppercase tracking-normal text-[var(--v3-text-secondary)]">{title}</CardTitle>
                    <div className="theme-stat-card-icon flex h-8 w-8 items-center justify-center rounded-[var(--v3-r-md)] bg-[var(--v3-secondary-soft)] text-[var(--v3-secondary)] transition-colors duration-200 group-hover:bg-[var(--v3-gold-soft)] group-hover:text-[var(--v3-gold)]">
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="relative pt-4">
                <div className="theme-stat-card-value font-display text-[32px] font-semibold leading-none tracking-normal text-[var(--v3-text-primary)] tabular-nums">
                    {value}
                </div>
                <div className="flex items-center gap-2 mt-2">
                    {trend && (
                        <div className={`theme-stat-card-trend flex items-center gap-1 font-ui text-xs font-semibold ${trend.isPositive ? 'text-[var(--v3-success)]' : 'text-[var(--v3-error)]'}`}>
                            {trend.isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {trend.value}%
                        </div>
                    )}
                    {description && (
                        <span className="theme-stat-card-description font-ui text-xs font-medium text-[var(--v3-text-secondary)]">{description}</span>
                    )}
                </div>
            </CardContent>
        </Card>
    )

    return (
        <div
            style={{
                animationDelay: `${index * 100}ms`,
            }}
            className="animate-fade-in"
        >
            {href ? (
                <Link href={href} className="block h-full">
                    {cardContent}
                </Link>
            ) : (
                cardContent
            )}
        </div>
    )
}
