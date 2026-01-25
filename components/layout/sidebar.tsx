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
  LogOut,
  User,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export function Sidebar({ salonSlug, userName }: { salonSlug: string; userName?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const navItems: NavItem[] = [
    { href: `/${salonSlug}/dashboard`, label: 'Dashboard', icon: LayoutDashboard },
    { href: `/${salonSlug}/calendar`, label: 'Kalendarz', icon: Calendar },
    { href: `/${salonSlug}/bookings`, label: 'Rezerwacje', icon: FileText },
    { href: `/${salonSlug}/employees`, label: 'Pracownicy', icon: Users },
    { href: `/${salonSlug}/clients`, label: 'Klienci', icon: UserCircle },
    { href: `/${salonSlug}/payroll`, label: 'Wynagrodzenia', icon: DollarSign },
    { href: `/${salonSlug}/settings`, label: 'Ustawienia', icon: Settings },
  ]

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Wylogowano pomyślnie')
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-64 border-r bg-gradient-to-b from-white to-purple-50 flex flex-col">
      <div className="p-6 border-b">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          SimpliSalon
        </h2>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-purple-100 text-purple-700 shadow-sm'
                  : 'text-gray-700 hover:bg-purple-50'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User Profile Section */}
      <div className="border-t p-4 space-y-3">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-purple-50">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {userName || 'Użytkownik'}
            </p>
            <p className="text-xs text-gray-500">Właściciel</p>
          </div>
        </div>

        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-gray-700 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Wyloguj
        </Button>
      </div>
    </aside>
  )
}
