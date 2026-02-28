'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Shield,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Database } from '@/types/supabase'

type SalonRow = Database['public']['Tables']['salons']['Row']

export default function Przelewy24SettingsPage() {
  const params = useParams()
  const slug = params?.slug as string

  const { data: salon } = useQuery<SalonRow | null>({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('salons')
        .select('*')
        .eq('slug', slug)
        .single()
      if (error) throw error
      return data
    },
  })

  const salonId = salon?.id ?? ''
  const { data: settings, isLoading } = useSettings(salonId)
  const updateSettings = useUpdateSettings(salonId)

  const [merchantId, setMerchantId] = useState('')
  const [posId, setPosId] = useState('')
  const [crc, setCrc] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('https://secure.przelewy24.pl')
  const [sandboxMode, setSandboxMode] = useState(false)

  useEffect(() => {
    if (!settings) return
    setMerchantId(settings.p24_merchant_id || '')
    setPosId(settings.p24_pos_id || '')
    setCrc('')   // klucze zawsze puste przy ładowaniu (bezpieczeństwo)
    setApiKey('')
    setApiUrl(settings.p24_api_url || 'https://secure.przelewy24.pl')
    setSandboxMode(!!settings.p24_sandbox_mode)
  }, [settings])

  const handleSave = () => {
    updateSettings.mutate(
      {
        p24_merchant_id: merchantId,
        p24_pos_id: posId,
        p24_crc: crc || '__UNCHANGED__',
        p24_api_key: apiKey || '__UNCHANGED__',
        p24_api_url: apiUrl,
        p24_sandbox_mode: sandboxMode,
      },
      {
        onSuccess: () => toast.success('Ustawienia Przelewy24 zostały zapisane'),
        onError: () => toast.error('Błąd podczas zapisywania ustawień'),
      }
    )
  }

  const isConfigured = !!settings?.has_p24_crc

  if (!salon && !isLoading) return <div className="p-6">Ładowanie...</div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Link
          href={`/${slug}/settings/integrations`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Powrót do integracji
        </Link>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-md">
              <span className="text-white font-black text-base">P</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Przelewy24</h1>
              <p className="text-sm text-muted-foreground">Bramka płatności online</p>
            </div>
          </div>

          {isConfigured ? (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
              <CheckCircle className="h-3 w-3" /> Skonfigurowane
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <AlertCircle className="h-3 w-3" /> Nieskonfigurowane
            </Badge>
          )}

          {sandboxMode && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold uppercase">
              Sandbox
            </Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Config form */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h2 className="text-base font-semibold">Parametry połączenia</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Dane z panelu administracyjnego Przelewy24
              </p>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="merchant-id">Merchant ID</Label>
                  <Input
                    id="merchant-id"
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                    placeholder="np. 123456"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pos-id">POS ID</Label>
                  <Input
                    id="pos-id"
                    value={posId}
                    onChange={(e) => setPosId(e.target.value)}
                    placeholder="np. 123456 (zwykle taki sam jak Merchant ID)"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="crc">
                  Klucz CRC
                  <span className="ml-2 text-xs text-muted-foreground font-normal">(do podpisów SHA384)</span>
                </Label>
                <Input
                  id="crc"
                  type="password"
                  value={crc}
                  onChange={(e) => setCrc(e.target.value)}
                  placeholder={settings?.has_p24_crc ? '•••••••• (pozostaw puste aby nie zmieniać)' : 'Klucz CRC z panelu P24'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">
                  Klucz API REST
                  <span className="ml-2 text-xs text-muted-foreground font-normal">(opcjonalny — do HTTP Basic Auth)</span>
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    settings?.has_p24_api_key
                      ? '•••••••• (pozostaw puste aby nie zmieniać)'
                      : 'Pozostaw puste jeśli taki sam jak CRC (starsze konta)'
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-end">
                <div className="space-y-2">
                  <Label>Środowisko</Label>
                  <Select
                    value={apiUrl}
                    onValueChange={(val) => {
                      setApiUrl(val)
                      setSandboxMode(val.includes('sandbox'))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https://secure.przelewy24.pl">
                        🟢 Produkcyjne (secure.przelewy24.pl)
                      </SelectItem>
                      <SelectItem value="https://sandbox.przelewy24.pl">
                        🟡 Testowe — Sandbox (sandbox.przelewy24.pl)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3 pb-1">
                  <Switch
                    id="sandbox"
                    checked={sandboxMode}
                    onCheckedChange={(v) => {
                      setSandboxMode(v)
                      setApiUrl(v ? 'https://sandbox.przelewy24.pl' : 'https://secure.przelewy24.pl')
                    }}
                  />
                  <Label htmlFor="sandbox" className="cursor-pointer text-sm">
                    Tryb testowy (Sandbox)
                  </Label>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-border">
                <Button
                  onClick={handleSave}
                  disabled={updateSettings.isPending || !salonId}
                  className="min-w-[140px]"
                >
                  {updateSettings.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zapisywanie...</>
                  ) : (
                    'Zapisz ustawienia'
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Gdzie znaleźć dane */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              Gdzie znajdę te dane?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Zaloguj się do{' '}
              <Link
                href="https://panel.przelewy24.pl"
                target="_blank"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                panel.przelewy24.pl <ExternalLink className="h-3 w-3" />
              </Link>
              , przejdź do <strong>Moje konto → Ustawienia → Dostęp do API</strong>.
              Znajdziesz tam Merchant ID, POS ID, Klucz CRC oraz Klucz API REST.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {[
                { label: 'Merchant ID', desc: 'Moje konto → Dane firmy' },
                { label: 'POS ID', desc: 'Zwykle taki sam jak Merchant ID' },
                { label: 'Klucz CRC', desc: 'Ustawienia → Klucz CRC' },
                { label: 'Klucz API REST', desc: 'Ustawienia → Dostęp do API REST' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2">
                  <div className="text-xs font-semibold text-foreground">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Security note */}
          <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 flex items-start gap-3">
            <Lock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground/80">Bezpieczeństwo: </strong>
              Klucze CRC i API REST są szyfrowane algorytmem <strong>AES-256-GCM</strong> przed
              zapisem w bazie danych. Nikt poza Twoim salonem nie ma dostępu do tych kluczy.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
