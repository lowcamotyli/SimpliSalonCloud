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
  Wrench,
  BarChart3,
  CreditCard,
  Megaphone,
  Zap,
  MessageSquare,
  List,
  ChevronDown,
  ClipboardList,
  Inbox,
  Gift,
  Wallet,
  BookOpen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { RBAC_ROLES } from '@/lib/rbac/role-maps'
import { useMobileNav } from '@/components/layout/mobile-nav-context'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

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
  managerOnly?: boolean
  subItems?: SubNavItem[]
}

interface NavSection {
  label: string
  items: NavItem[]
}

export function Sidebar({ salonSlug, userName }: { salonSlug: string; userName?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { currentRole, hasPermission, isOwnerOrManager } = useCurrentRole()
  const { isOpen, setOpen } = useMobileNav()

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

  const formsSubItems: SubNavItem[] = [
    { href: `/${salonSlug}/forms/templates`, label: 'Szablony', icon: ClipboardList },
    { href: `/${salonSlug}/forms/submissions`, label: 'Zgłoszenia', icon: Inbox },
  ]

  const navSections: NavSection[] = [
    {
      label: 'Główne',
      items: [
        { href: `/${salonSlug}/dashboard`, label: 'Pulpit', icon: LayoutDashboard },
        { href: `/${salonSlug}/calendar`, label: 'Kalendarz', icon: Calendar },
        { href: `/${salonSlug}/bookings`, label: 'Rezerwacje', icon: FileText },
        { href: `/${salonSlug}/clients`, label: 'Klienci', icon: UserCircle, subItems: crmSubItems },
        { href: `/${salonSlug}/services`, label: 'Usługi', icon: Scissors },
        { href: `/${salonSlug}/employees`, label: 'Pracownicy', icon: Users, requiredPermission: 'employees:manage' },
      ],
    },
    {
      label: 'Analityka',
      items: [
        { href: `/${salonSlug}/reports`, label: 'Raporty', icon: BarChart3, requiredPermission: 'reports:view' },
        { href: `/${salonSlug}/payments`, label: 'Płatności', icon: Wallet, requiredPermission: 'finance:view' },
        { href: `/${salonSlug}/payroll`, label: 'Wynagrodzenia', icon: DollarSign, requiredPermission: 'finance:view' },
        { href: `/${salonSlug}/vouchers`, label: 'Vouchery', icon: Gift, requiredPermission: 'finance:view' },
      ],
    },
    {
      label: 'System',
      items: [
        { href: `/${salonSlug}/settings`, label: 'Ustawienia', icon: Settings, requiredPermission: 'settings:view' },
        { href: `/${salonSlug}/equipment`, label: 'Sprzęt', icon: Wrench, ownerOnly: true },
        { href: `/${salonSlug}/forms`, label: 'Formularze', icon: ClipboardList, managerOnly: true, subItems: formsSubItems },
        { href: `/${salonSlug}/booksy`, label: 'Booksy', icon: BookOpen, ownerOnly: true },
        { href: `/${salonSlug}/billing`, label: 'Subskrypcja', icon: CreditCard, ownerOnly: true },
      ],
    },
  ]

  const canShowItem = (item: NavItem) => {
    if (item.ownerOnly) return currentRole === RBAC_ROLES.OWNER
    if (item.managerOnly) return isOwnerOrManager()
    if (!item.requiredPermission) return true
    if (item.requiredPermission === 'employees:manage') {
      return isOwnerOrManager()
    }
    return hasPermission(item.requiredPermission)
  }

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

  const renderNavItem = (item: NavItem, index: number) => {
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
              'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
              'bg-secondary/15 text-secondary'
            )}
          >
            <Icon className="h-4.5 w-4.5 text-secondary" />
            <span>{item.label}</span>
            <ChevronDown className="ml-auto h-4 w-4 text-secondary/70" />
          </div>
          <div className="ml-3 mt-1 space-y-0.5 border-l border-border pl-3">
            {item.subItems.map((sub) => {
              const SubIcon = sub.icon
              const isSubActive = pathname === sub.href
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'group flex min-h-[44px] items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    isSubActive
                      ? 'bg-secondary/15 text-secondary'
                      : 'text-foreground/75 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <SubIcon
                    className={cn(
                      'h-3.5 w-3.5',
                      isSubActive
                        ? 'text-secondary'
                        : 'text-foreground/50 group-hover:text-secondary'
                    )}
                  />
                  <span>{sub.label}</span>
                  {isSubActive && (
                    <div className="ml-auto h-1.5 w-1.5 rounded-full bg-secondary" />
                  )}
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
        onClick={() => setOpen(false)}
        style={{
          animationDelay: `${index * 50}ms`,
        }}
        className={cn(
          'group flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          isActive || isInSection
            ? 'bg-secondary/15 text-secondary'
            : 'text-foreground/80 hover:bg-muted hover:text-foreground'
        )}
      >
        <Icon
          className={cn(
            'h-4.5 w-4.5 transition-colors',
            isActive || isInSection
              ? 'text-secondary'
              : 'text-foreground/50 group-hover:text-secondary'
          )}
        />
        <span>{item.label}</span>
        {(isActive || isInSection) && !item.subItems && (
          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-secondary" />
        )}
        {item.subItems && !isInSection && (
          <ChevronDown className="ml-auto h-4 w-4 text-foreground/35" />
        )}
      </Link>
    )
  }

  const sidebarContent = (
    <>
      <div className="theme-sidebar-brand border-b border-border px-3 py-4">
        <div className="mb-1.5 flex items-center gap-3 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/15">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">SimpliSalon</h2>
        </div>
        <p className="ml-11 text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Premium Salon Manager
        </p>
      </div>

      <nav className="theme-sidebar-nav flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {navSections.map((section) => {
          const visibleItems = section.items.filter(canShowItem)

          if (visibleItems.length === 0) return null

          return (
            <div key={section.label} className="space-y-1.5">
              <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item, index) => renderNavItem(item, index))}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="theme-sidebar-footer space-y-3 border-t border-border bg-background px-3 py-4">
        <div className="theme-sidebar-user flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <User className="h-4.5 w-4.5 text-foreground/70" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {userName || 'Użytkownik'}
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {roleLabel}
            </p>
          </div>
        </div>

        <Button
          onClick={handleLogout}
          className="h-11 min-h-[44px] w-full justify-start rounded-md border border-border bg-background text-foreground hover:bg-muted"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Wyloguj
        </Button>
      </div>
    </>
  )

  return (
    <>
      <aside className="theme-sidebar hidden w-64 flex-col border-r border-border bg-background md:flex">
        {sidebarContent}
      </aside>
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0 border-r">
          <SheetTitle className="sr-only">Nawigacja</SheetTitle>
          <div className="theme-sidebar flex h-full flex-col bg-background">
            {sidebarContent}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
