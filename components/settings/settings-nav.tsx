'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Palette, Building2, Bell, Link as LinkIcon, MessageSquare,
  ShieldAlert, Star, Database, FlaskConical, ScrollText, Clock
} from 'lucide-react'
import { useCurrentRole } from '@/hooks/use-current-role'
import { RBAC_ROLES } from '@/lib/rbac/role-maps'
import { buttonVariants } from '@/components/ui/button'

const NAV_ITEMS = [
  { href: '/appearance', label: 'Wygląd', icon: Palette, ownerOnly: false },
  { href: '/business', label: 'Biznes', icon: Building2, ownerOnly: true },
  { href: '/integrations', label: 'Integracje', icon: LinkIcon, ownerOnly: true },
  { href: '/sms', label: 'SMS', icon: MessageSquare, ownerOnly: true },
  { href: '/crm', label: 'CRM', icon: ShieldAlert, ownerOnly: false },
  { href: '/surveys', label: 'Ankiety', icon: Star, ownerOnly: false },
  { href: '/protocols', label: 'Protokoły', icon: FlaskConical, ownerOnly: true },
  { href: '/import', label: 'Import danych', icon: Database, ownerOnly: true },
  { href: '/notifications', label: 'Powiadomienia', icon: Bell, ownerOnly: false },
  { href: '/premium-hours', label: 'Godziny premium', icon: Clock, ownerOnly: true },
  { href: '/audit-log', label: 'Audit Trail', icon: ScrollText, ownerOnly: true },
]

export function SettingsNav({ baseUrl }: { baseUrl: string }) {
  const pathname = usePathname()
  const { currentRole } = useCurrentRole()
  const isOwner = currentRole === RBAC_ROLES.OWNER

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.ownerOnly || isOwner
  )

  return (
    <nav className="flex overflow-x-auto gap-1 pb-2 border-b border-border">
      {visibleItems.map(item => {
        const href = `${baseUrl}${item.href}`
        // Match exact or startsWith depending on routing, but exact is safer here for settings.
        const isActive = pathname === href || (item.href === '' && pathname === baseUrl)
        const Icon = item.icon

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
              'justify-start whitespace-nowrap shrink-0 gap-2 text-sm h-10 px-4 transition-colors'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={cn(isActive ? "font-medium" : "font-normal")}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
