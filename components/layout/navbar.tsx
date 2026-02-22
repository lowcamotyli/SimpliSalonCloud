'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { LogOut, Bell } from 'lucide-react'

export function Navbar({ salonName }: { salonName: string }) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Wylogowano pomyślnie')
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-40">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-foreground">{salonName}</h1>
            <p className="text-xs text-muted-foreground">Zarządzaj swoim salonem</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-primary/10 hover:text-primary transition-all"
          >
            <Bell className="h-5 w-5" />
          </Button>
          <Button
            onClick={handleLogout}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-md transition-all"
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
