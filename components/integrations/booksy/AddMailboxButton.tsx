"use client"

import { Button } from "@/components/ui/button"

interface AddMailboxButtonProps {
  salonSlug: string
}

export function AddMailboxButton({ salonSlug }: AddMailboxButtonProps): JSX.Element {
  void salonSlug

  const handleClick = (): void => {
    window.location.assign("/api/integrations/booksy/auth?action=connect_new_mailbox")
  }

  return (
    <Button className="w-full sm:w-auto" onClick={handleClick} type="button">
      Dodaj skrzynkę
    </Button>
  )
}
