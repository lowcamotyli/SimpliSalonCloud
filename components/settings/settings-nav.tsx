// components/settings/settings-nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Palette, Building2, Bell, Link as LinkIcon, MessageSquare,
  LayoutDashboard
} from 'lucide-react'
import { useCurrentRole } from '@/hooks/use-current-role'
import { RBAC_ROLES } from '@/lib/rbac/role-maps'

const NAV_ITEMS = [
  { href: '', label: 'Przegląd', icon: LayoutDashboard, ownerOnly: false },
  { href: '/appearance', label: 'Wygląd', icon: Palette, ownerOnly: false },
  { href: '/business', label: 'Biznes', icon: Building2, ownerOnly: true },
  { href: '/integrations', label: 'Integracje', icon: LinkIcon, ownerOnly: true },
  { href: '/sms', label: 'SMS', icon: MessageSquare, ownerOnly: true },
  { href: '/notifications', label: 'Powiadomienia', icon: Bell, ownerOnly: false },
]

export function SettingsNav({ baseUrl }: { baseUrl: string }) {
  const pathname = usePathname()
  const { currentRole } = useCurrentRole()
  const isOwner = currentRole === RBAC_ROLES.OWNER

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.ownerOnly || isOwner
  )

  return (
    <nav className="flex space-x-2 border-b mb-6">
      {visibleItems.map(item => {
        const href = `${baseUrl}${item.href}`
        const isActive = pathname === href
        const Icon = item.icon

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-b-2 transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
