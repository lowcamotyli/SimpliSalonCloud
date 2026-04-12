'use client'

import { createContext, useContext, useState } from 'react'

type MobileNavContextValue = {
  isOpen: boolean
  setOpen: (open: boolean) => void
}

const MobileNavContext = createContext<MobileNavContextValue | undefined>(undefined)

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false)

  return <MobileNavContext.Provider value={{ isOpen, setOpen }}>{children}</MobileNavContext.Provider>
}

export function useMobileNav() {
  const context = useContext(MobileNavContext)
  if (!context) throw new Error('useMobileNav must be used within a MobileNavProvider')
  return context
}