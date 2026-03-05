'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type SmsMessage = {
  id: string
  direction: 'outbound' | 'inbound'
  body: string
  status: string
  created_at: string
}

export function SmsChat({ clientId }: { clientId: string }) {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/sms/history/${clientId}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || 'Failed to fetch SMS history')
    setMessages(payload.messages || [])
  }, [clientId])

  const loadWallet = useCallback(async () => {
    const response = await fetch('/api/billing/sms-wallet')
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || 'Failed to fetch SMS wallet')
    setBalance(Number(payload.balance || 0))
  }, [])

  useEffect(() => {
    loadHistory().catch((error) => toast.error(error.message))
    loadWallet().catch(() => setBalance(null))
  }, [loadHistory, loadWallet])

  useEffect(() => {
    const channel = supabase
      .channel(`sms-client-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sms_messages',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const next = payload.new as SmsMessage
          setMessages((prev) => [...prev, next])
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [clientId, supabase])

  const sendMessage = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, body: text.trim() }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'SMS send failed')
      setText('')
      await loadHistory()
      await loadWallet()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'SMS send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Czat SMS</CardTitle>
        <Badge variant="outline">Saldo: {balance ?? '-'} SMS</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[340px] overflow-y-auto rounded-md border bg-muted/20 p-3 space-y-2">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wiadomości.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  message.direction === 'outbound'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'mr-auto bg-white border'
                }`}
              >
                <p>{message.body}</p>
                <p className="mt-1 text-[11px] opacity-70">
                  {new Date(message.created_at).toLocaleString('pl-PL')}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Napisz wiadomość SMS..."
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (!sending) void sendMessage()
              }
            }}
          />
          <Button onClick={() => void sendMessage()} disabled={sending || !text.trim()}>
            {sending ? 'Wysyłanie...' : 'Wyślij'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
