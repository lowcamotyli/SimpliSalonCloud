// components/settings/settings-nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { 
  Palette, Building2, Bell, Link as LinkIcon, 
  LayoutDashboard 
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '', label: 'Przegląd', icon: LayoutDashboard },
  { href: '/appearance', label: 'Wygląd', icon: Palette },
  { href: '/business', label: 'Biznes', icon: Building2 },
  { href: '/integrations', label: 'Integracje', icon: LinkIcon },
  { href: '/notifications', label: 'Powiadomienia', icon: Bell },
]

export function SettingsNav({ baseUrl }: { baseUrl: string }) {
  const pathname = usePathname()
  
  return (
    <nav className="flex space-x-2 border-b mb-6">
      {NAV_ITEMS.map(item => {
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