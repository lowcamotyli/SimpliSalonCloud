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
  Scissors,
  BarChart3,
  CreditCard,
  Megaphone,
  Zap,
  MessageSquare,
  List,
  ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { RBAC_ROLES } from '@/lib/rbac/role-maps'

interface SubNavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  requiredPermission?: 'employees:manage' | 'finance:view' | 'reports:view' | 'settings:view'
  ownerOnly?: boolean
  subItems?: SubNavItem[]
}

export function Sidebar({ salonSlug, userName }: { salonSlug: string; userName?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { currentRole, hasPermission, isOwnerOrManager } = useCurrentRole()

  const crmSubItemsAll: (SubNavItem & { requiresManage?: boolean })[] = [
    { href: `/${salonSlug}/clients`, label: 'Lista klientów', icon: List },
    { href: `/${salonSlug}/clients/campaigns`, label: 'Kampanie', icon: Megaphone, requiresManage: true },
    { href: `/${salonSlug}/clients/templates`, label: 'Szablony', icon: FileText, requiresManage: true },
    { href: `/${salonSlug}/clients/automations`, label: 'Automatyzacje', icon: Zap, requiresManage: true },
    { href: `/${salonSlug}/clients/messages`, label: 'Historia', icon: MessageSquare, requiresManage: true },
  ]
  const crmSubItems = crmSubItemsAll.filter(
    (item) => !item.requiresManage || hasPermission('clients:manage')
  )

  const navItems: NavItem[] = [
    { href: `/${salonSlug}/dashboard`, label: 'Dashboard', icon: LayoutDashboard },
    { href: `/${salonSlug}/calendar`, label: 'Kalendarz', icon: Calendar },
    { href: `/${salonSlug}/bookings`, label: 'Rezerwacje', icon: FileText },
    { href: `/${salonSlug}/services`, label: 'Usługi', icon: Scissors },
    { href: `/${salonSlug}/employees`, label: 'Pracownicy', icon: Users, requiredPermission: 'employees:manage' },
    { href: `/${salonSlug}/clients`, label: 'Klienci', icon: UserCircle, subItems: crmSubItems },
    { href: `/${salonSlug}/payroll`, label: 'Wynagrodzenia', icon: DollarSign, requiredPermission: 'finance:view' },
    { href: `/${salonSlug}/reports`, label: 'Raporty', icon: BarChart3, requiredPermission: 'reports:view' },
    { href: `/${salonSlug}/billing`, label: 'Subskrypcja', icon: CreditCard, ownerOnly: true },
    { href: `/${salonSlug}/settings`, label: 'Ustawienia', icon: Settings, requiredPermission: 'settings:view' },
  ]

  const roleLabel = (() => {
    if (currentRole === RBAC_ROLES.OWNER) return 'Właściciel'
    if (currentRole === RBAC_ROLES.MANAGER) return 'Manager'
    if (currentRole === RBAC_ROLES.EMPLOYEE) return 'Pracownik'
    return 'Użytkownik'
  })()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Wylogowano pomyślnie')
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-64 bg-background/95 backdrop-blur-xl border-r border-border flex flex-col shadow-2xl">
      {/* Logo Section */}
      <div className="p-6 border-b border-border/10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-primary">SimpliSalon</h2>
        </div>
        <p className="text-xs text-muted-foreground ml-12">Premium Salon Manager</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navItems
          .filter((item) => {
            if (item.ownerOnly) return currentRole === RBAC_ROLES.OWNER
            if (!item.requiredPermission) return true
            if (item.requiredPermission === 'employees:manage') {
              return isOwnerOrManager()
            }
            return hasPermission(item.requiredPermission)
          })
          .map((item, index) => {
          const Icon = item.icon
          const isInSection = item.subItems
            ? pathname.startsWith(item.href)
            : pathname === item.href
          const isActive = pathname === item.href

          if (item.subItems && isInSection) {
            return (
              <div key={item.href}>
                <div
                  style={{ animationDelay: `${index * 50}ms` }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    'bg-primary/10 text-primary border border-primary/20'
                  )}
                >
                  <Icon className="h-5 w-5 text-primary" />
                  <span>{item.label}</span>
                  <ChevronDown className="ml-auto h-4 w-4 text-primary/60" />
                </div>
                <div className="mt-1 ml-3 pl-3 border-l border-primary/20 space-y-0.5">
                  {item.subItems.map((sub) => {
                    const SubIcon = sub.icon
                    const isSubActive = pathname === sub.href
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-200 group',
                          isSubActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground/60 hover:bg-primary/5 hover:text-foreground/90'
                        )}
                      >
                        <SubIcon className={cn('h-3.5 w-3.5', isSubActive ? 'text-primary' : 'text-foreground/40 group-hover:text-primary/70')} />
                        <span>{sub.label}</span>
                        {isSubActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                animationDelay: `${index * 50}ms`,
              }}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 group',
                isActive || isInSection
                  ? 'bg-primary/10 text-primary shadow-lg border border-primary/20'
                  : 'text-foreground/70 hover:bg-primary/5 hover:shadow-md border border-transparent'
              )}
            >
              <Icon className={cn('h-5 w-5 transition-all', isActive || isInSection ? 'text-primary' : 'text-foreground/40 group-hover:text-primary')} />
              <span>{item.label}</span>
              {(isActive || isInSection) && !item.subItems && <div className="ml-auto w-2 h-2 rounded-full bg-primary animate-glow" />}
              {item.subItems && !isInSection && <ChevronDown className="ml-auto h-4 w-4 text-foreground/30" />}
            </Link>
          )
        })}
      </nav>

      {/* User Profile Section */}
      <div className="border-t border-border p-4 space-y-3 bg-primary/5">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl glass">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary shadow-lg">
            <User className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {userName || 'Użytkownik'}
            </p>
            <p className="text-xs text-primary font-medium">{roleLabel}</p>
          </div>
        </div>

        <Button
          onClick={handleLogout}
          className="w-full justify-start bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-lg transition-all"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Wyloguj
        </Button>
      </div>
    </aside>
  )
}
