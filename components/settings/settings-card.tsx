// components/settings/settings-card.tsx
import { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SettingsCardProps {
  title: string
  description?: string
  children: ReactNode
  action?: ReactNode
  className?: string
  headerClassName?: string
  contentClassName?: string
}

export function SettingsCard({
  title,
  description,
  children,
  action,
  className,
  headerClassName,
  contentClassName,
}: SettingsCardProps) {
  return (
    <Card className={`overflow-hidden border-border/80 bg-card shadow-sm ${className ?? ''}`}>
      <CardHeader className={`border-b border-border/70 bg-gradient-to-b from-background to-muted/20 p-5 sm:p-6 ${headerClassName ?? ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground/90">{title}</CardTitle>
            {description && <CardDescription className="mt-2 text-sm text-muted-foreground">{description}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className={`p-5 sm:p-6 ${contentClassName ?? ''}`}>{children}</CardContent>
    </Card>
  )
}
