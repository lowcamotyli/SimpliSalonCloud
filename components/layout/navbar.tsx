'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

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
    <nav className="border-b bg-white">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-bold text-gray-900">{salonName}</h1>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleLogout}>
            Wyloguj
          </Button>
        </div>
      </div>
    </nav>
  )
}