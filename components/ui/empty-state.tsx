import { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

interface EmptyStateProps {
    icon: LucideIcon
    title: string
    description: string
    actionLabel?: string
    onAction?: () => void
    className?: string
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    className
}: EmptyStateProps) {
    return (
        <div className={cn(
            "flex flex-col items-center justify-center p-12 text-center glass animate-in fade-in zoom-in duration-500",
            className
        )}>
            <div className="relative mb-6">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                <div className="relative h-20 w-20 bg-primary/10 rounded-2xl flex items-center justify-center text-primary animate-float">
                    <Icon className="h-10 w-10" />
                </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-500 max-w-sm mb-8">
                {description}
            </p>
            {actionLabel && onAction && (
                <Button
                    onClick={onAction}
                    className="gradient-button px-8 h-12 rounded-xl text-lg font-bold"
                >
                    {actionLabel}
                </Button>
            )}
        </div>
    )
}
