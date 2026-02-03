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
    color,
    lightColor,
    trend,
    description,
    index,
    href
}: StatCardProps) {
    const cardContent = (
        <Card className="stat-card overflow-hidden group border-none bg-white/50 backdrop-blur-sm h-full">
            <div className={`absolute inset-0 bg-gradient-to-br ${lightColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            <CardHeader className="relative pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color} text-white shadow-lg group-hover:shadow-xl group-hover:scale-110 transition-all duration-300`}>
                        <Icon className="h-5 w-5" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="relative pt-4">
                <div className={`text-3xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                    {value}
                </div>
                <div className="flex items-center gap-2 mt-2">
                    {trend && (
                        <div className={`flex items-center gap-0.5 text-xs font-bold ${trend.isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {trend.isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {trend.value}%
                        </div>
                    )}
                    {description && (
                        <span className="text-xs text-gray-500 font-medium">{description}</span>
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
