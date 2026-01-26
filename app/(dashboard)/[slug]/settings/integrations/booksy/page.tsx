'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Mail, CheckCircle, XCircle } from 'lucide-react'

export default function BooksySettingsPage() {
  const [isConnected, setIsConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)

  const handleConnectGmail = async () => {
    // TODO: Implement Gmail OAuth2 flow
    // 1. Redirect to Google OAuth consent screen
    // 2. Get authorization code
    // 3. Exchange for access token + refresh token
    // 4. Save to salon settings
    
    toast.info('Gmail OAuth flow - to be implemented')
    
    // Placeholder
    setIsConnected(true)
    setGmailEmail('salon@example.com')
  }

  const handleDisconnect = async () => {
    if (confirm('Czy na pewno chcesz odłączyć integrację Booksy?')) {
      // TODO: Remove tokens from settings
      setIsConnected(false)
      setGmailEmail('')
      toast.success('Integracja Booksy odłączona')
    }
  }

  const handleTestSync = async () => {
    try {
      const response = await fetch('/api/webhooks/booksy/test', {
        method: 'POST',
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`Synchronizacja pomyślna: ${data.processed} wiadomości`)
        setLastSync(new Date().toISOString())
      } else {
        toast.error('Błąd synchronizacji: ' + data.error)
      }
    } catch (error: any) {
      toast.error('Błąd: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Integracja Booksy</h1>
        <p className="mt-2 text-gray-600">
          Automatyczna synchronizacja rezerwacji z Booksy przez Gmail
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Status połączenia
            </div>
            <Badge variant={isConnected ? 'success' : 'secondary'}>
              {isConnected ? (
                <><CheckCircle className="mr-1 h-3 w-3" /> Połączono</>
              ) : (
                <><XCircle className="mr-1 h-3 w-3" /> Nie połączono</>
              )}
            </Badge>
          </CardTitle>
          {isConnected && (
            <CardDescription>
              Konto Gmail: {gmailEmail}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <>
              <p className="text-sm text-gray-600">
                Połącz konto Gmail, aby automatycznie synchronizować rezerwacje z Booksy.
              </p>
              <Button onClick={handleConnectGmail}>
                <Mail className="mr-2 h-4 w-4" />
                Połącz z Gmail
              </Button>
            </>
          ) : (
            <div className="flex gap-2">
              <Button onClick={handleTestSync}>
                Testuj synchronizację
              </Button>
              <Button variant="destructive" onClick={handleDisconnect}>
                Odłącz
              </Button>
            </div>
          )}

          {lastSync && (
            <p className="text-sm text-gray-600">
              Ostatnia synchronizacja:{' '}
              <span className="font-medium">
                {new Date(lastSync).toLocaleString('pl-PL')}
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle>Jak to działa?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">1. Połącz Gmail</h4>
            <p>
              System uzyskuje dostęp do Twojej skrzynki Gmail, gdzie Booksy wysyła 
              powiadomienia o rezerwacjach.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">2. Automatyczna synchronizacja</h4>
            <p>
              Co 15 minut system sprawdza nowe emaile z Booksy i automatycznie 
              tworzy rezerwacje w kalendarzu.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">3. Obsługiwane akcje</h4>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Nowa rezerwacja - tworzy wizytę w kalendarzu</li>
              <li>Zmiana terminu - aktualizuje istniejącą wizytę</li>
              <li>Anulowanie - oznacza wizytę jako anulowaną</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">4. Dopasowanie danych</h4>
            <p>
              System automatycznie dopasowuje:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Klientów po numerze telefonu (tworzy nowych jeśli trzeba)</li>
              <li>Pracowników po imieniu</li>
              <li>Usługi po nazwie</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Email examples */}
      <Card>
        <CardHeader>
          <CardTitle>Przykładowe formaty emaili</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Badge variant="secondary" className="mb-2">Nowa rezerwacja</Badge>
            <code className="block bg-gray-100 p-3 rounded text-xs">
              Temat: Anna Kowalska: nowa rezerwacja<br/>
              <br/>
              Anna Kowalska<br/>
              123 456 789<br/>
              <br/>
              Strzyżenie damskie<br/>
              150,00 zł<br/>
              <br/>
              27 października 2024, 10:00 — 11:00<br/>
              <br/>
              Pracownik: Kasia
            </code>
          </div>

          <div>
            <Badge variant="secondary" className="mb-2">Zmiana terminu</Badge>
            <code className="block bg-gray-100 p-3 rounded text-xs">
              Temat: Jan Nowak: zmienił rezerwację<br/>
              <br/>
              z dnia 27 października 2024 10:00<br/>
              na 28 października 2024, 14:00 — 15:00
            </code>
          </div>

          <div>
            <Badge variant="secondary" className="mb-2">Anulowanie</Badge>
            <code className="block bg-gray-100 p-3 rounded text-xs">
              Temat: Maria Wiśniewska: odwołała wizytę<br/>
              <br/>
              27 października 2024, 16:00 — 17:00
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}