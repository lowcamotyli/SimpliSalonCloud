'use client'

import { Bell, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export function Navbar({ salonName }: { salonName: string }) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Wylogowano pomyslnie')
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="theme-navbar sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="theme-navbar-inner flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="theme-navbar-title flex flex-col">
            <h1 className="text-xl font-bold text-foreground">{salonName}</h1>
            <p className="text-sm text-muted-foreground">Zarzadzaj swoim salonem</p>
          </div>
        </div>

        <div className="theme-navbar-actions flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-primary/10 hover:text-primary transition-all"
          >
            <Bell className="h-5 w-5" />
          </Button>
          <Button
            onClick={handleLogout}
            className="rounded-lg bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90"
            size="sm"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Wyloguj
          </Button>
        </div>
      </div>
    </nav>
  )
}
