'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'

type CRMUsageResponse = {
  plan: string
  period: string
  usage: {
    email: { used: number; limit: number; percentage: number }
    sms: { used: number; limit: number; percentage: number }
  }
}

function formatLimit(limit: number) {
  return Number.isFinite(limit) ? limit.toLocaleString('pl-PL') : '∞'
}

function ProgressRow({
  label,
  used,
  limit,
  percentage,
}: {
  label: string
  used: number
  limit: number
  percentage: number
}) {
  const normalized = Number.isFinite(limit) ? Math.min(Math.max(percentage, 0), 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used.toLocaleString('pl-PL')} / {formatLimit(limit)}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            normalized > 80 ? 'bg-amber-500' : 'bg-primary'
          )}
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  )
}

export function CRMUsageBanner({ salonId, slug }: { salonId: string; slug: string }) {
  const usageQuery = useQuery<CRMUsageResponse>({
    queryKey: ['crm-usage-banner', salonId],
    enabled: !!salonId,
    queryFn: async () => {
      const res = await fetch(`/api/crm/usage?salonId=${salonId}`)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'Failed to fetch CRM usage')
      return payload
    },
  })

  if (!salonId || usageQuery.isLoading || usageQuery.isError || !usageQuery.data) {
    return null
  }

  const email = usageQuery.data.usage.email
  const sms = usageQuery.data.usage.sms
  const showUpgradeHint = email.percentage > 80 || sms.percentage > 80

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">CRM usage ({usageQuery.data.plan})</h2>
          {showUpgradeHint ? <Badge variant="warning">Limit above 80%</Badge> : null}
        </div>

        <div className="space-y-3">
          <ProgressRow
            label="Email"
            used={email.used}
            limit={email.limit}
            percentage={email.percentage}
          />
          <ProgressRow
            label="SMS"
            used={sms.used}
            limit={sms.limit}
            percentage={sms.percentage}
          />
        </div>

        {showUpgradeHint ? (
          <p className="text-xs text-muted-foreground">
            You are close to your monthly CRM messaging limits.{' '}
            <Link href={`/${slug}/billing/upgrade`} className="underline underline-offset-2 font-medium">
              Upgrade plan
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

