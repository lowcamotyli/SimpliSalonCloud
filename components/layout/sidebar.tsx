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
  Sparkles,
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
    <aside className="w-64 bg-gradient-to-b from-white/95 to-purple-50/95 backdrop-blur-xl border-r border-white/20 flex flex-col shadow-2xl">
      {/* Logo Section */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold gradient-text">SimpliSalon</h2>
        </div>
        <p className="text-xs text-gray-500 ml-12">Premium Salon Manager</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navItems.map((item, index) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                animationDelay: `${index * 50}ms`,
              }}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 group',
                isActive
                  ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-700 shadow-lg border border-purple-200/50'
                  : 'text-gray-700 hover:bg-white/50 hover:shadow-md border border-transparent'
              )}
            >
              <Icon className={cn('h-5 w-5 transition-all', isActive ? 'text-purple-600' : 'text-gray-400 group-hover:text-purple-600')} />
              <span>{item.label}</span>
              {isActive && <div className="ml-auto w-2 h-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 animate-glow" />}
            </Link>
          )
        })}
      </nav>

      {/* User Profile Section */}
      <div className="border-t border-white/10 p-4 space-y-3 bg-gradient-to-t from-purple-100/30 to-transparent">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl glass">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {userName || 'Użytkownik'}
            </p>
            <p className="text-xs text-purple-600 font-medium">Właściciel</p>
          </div>
        </div>

        <Button
          onClick={handleLogout}
          className="w-full justify-start gradient-button rounded-xl"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Wyloguj
        </Button>
      </div>
    </aside>
  )
}
