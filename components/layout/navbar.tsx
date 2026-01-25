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
    <nav className="glass border-b border-white/20 sticky top-0 z-40">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold gradient-text">{salonName}</h1>
            <p className="text-xs text-gray-500">Zarządzaj swoim salonem</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            className="hover:bg-purple-100/50 hover:text-purple-600 transition-all"
          >
            <Bell className="h-5 w-5" />
          </Button>
          <Button 
            onClick={handleLogout}
            className="gradient-button rounded-lg"
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
