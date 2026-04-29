'use client'

import { Bell, Menu } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { GlobalSearch } from '@/components/layout/global-search'
import { useMobileNav } from '@/components/layout/mobile-nav-context'
import { Button } from '@/components/ui/button'

type NavbarProps = {
  salonName: string
  salonSlug: string
}

export function Navbar({ salonName, salonSlug }: NavbarProps) {
  const router = useRouter()
  const { isOpen, setOpen } = useMobileNav()
  const salonInitials = salonName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <nav className="theme-navbar sticky top-0 z-40 px-3 py-2 sm:px-4">
      <div className="topnav theme-navbar-inner flex min-h-14 overflow-visible rounded-[var(--v3-r-md)] shadow-[var(--v3-shadow-card)]">
        <div className="topnav-left flex items-center gap-3 rounded-l-[var(--v3-r-md)] bg-[var(--v3-primary)] px-4 text-white sm:gap-[14px] sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white md:hidden"
            onClick={() => setOpen(true)}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            aria-label="Otwórz nawigację"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="theme-navbar-title flex flex-col">
            <h1 className="max-w-[180px] truncate font-[var(--v3-font-display)] text-lg font-semibold tracking-[-0.01em] text-white sm:max-w-none sm:text-xl">
              {salonName}
            </h1>
            <p className="hidden text-xs text-white/80 sm:block sm:text-sm">
              Zarzadzaj swoim salonem
            </p>
          </div>
        </div>

        <div className="topnav-right flex min-w-0 flex-1 items-center justify-end gap-2 rounded-r-[var(--v3-r-md)] bg-[var(--v3-secondary)] px-3 text-white sm:gap-4 sm:px-6">
          <div className="hidden min-w-0 flex-1 justify-end md:flex">
            <GlobalSearch slug={salonSlug} className="w-full max-w-[380px]" />
          </div>

          <div className="md:hidden">
            <GlobalSearch slug={salonSlug} className="w-[130px] sm:w-[180px]" />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="nav-icon hidden h-9 w-9 rounded-full bg-transparent text-white transition-colors hover:bg-white/15 hover:text-white sm:inline-flex"
          >
            <Bell className="h-5 w-5" />
          </Button>

          <Button
            onClick={() => router.push(`/${salonSlug}/settings`)}
            variant="ghost"
            size="icon"
            className="avatar h-9 w-9 rounded-full border-2 border-white/40 bg-[var(--v3-gold)] p-0 font-[var(--v3-font-ui)] text-[13px] font-bold text-white transition-transform hover:scale-[1.02] hover:bg-[var(--v3-gold)]"
          >
            {salonInitials || "SS"}
          </Button>
        </div>
      </div>
    </nav>
  )
}
