"use client"

import { Button } from "@/components/ui/button"

interface AddMailboxButtonProps {
  salonSlug: string
}

function encodeState(state: { action: "connect_new_mailbox" }): string {
  const json = JSON.stringify(state)
  const encoded = btoa(unescape(encodeURIComponent(json)))
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function AddMailboxButton({ salonSlug }: AddMailboxButtonProps): JSX.Element {
  void salonSlug

  const handleClick = (): void => {
    const state = encodeState({ action: "connect_new_mailbox" })
    const url = `/api/integrations/gmail-send?state=${encodeURIComponent(state)}`
    window.location.assign(url)
  }

  return (
    <Button className="w-full sm:w-auto" onClick={handleClick} type="button">
      Dodaj skrzynkę
    </Button>
  )
}
