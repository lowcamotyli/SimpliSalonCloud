'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Users,
  UserCircle,
  DollarSign,
  Settings,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export function Sidebar({ salonSlug }: { salonSlug: string }) {
  const pathname = usePathname()

  const navItems: NavItem[] = [
    { href: `/${salonSlug}/dashboard`, label: 'Dashboard', icon: LayoutDashboard },
    { href: `/${salonSlug}/calendar`, label: 'Kalendarz', icon: Calendar },
    { href: `/${salonSlug}/bookings`, label: 'Rezerwacje', icon: FileText },
    { href: `/${salonSlug}/employees`, label: 'Pracownicy', icon: Users },
    { href: `/${salonSlug}/clients`, label: 'Klienci', icon: UserCircle },
    { href: `/${salonSlug}/payroll`, label: 'Wynagrodzenia', icon: DollarSign },
    { href: `/${salonSlug}/settings`, label: 'Ustawienia', icon: Settings },
  ]

  return (
    <aside className="w-64 border-r bg-white">
      <div className="flex h-full flex-col">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-blue-600">SimpliSalon</h2>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}