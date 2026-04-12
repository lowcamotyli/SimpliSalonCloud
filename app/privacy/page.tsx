import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Polityka Prywatnosci | SimpliSalonCloud",
  description: "Polityka prywatnosci aplikacji SimpliSalonCloud.",
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">SimpliSalonCloud</p>
          <h1 className="text-3xl font-bold tracking-tight">Polityka prywatnosci</h1>
          <p className="text-sm text-slate-600">Data ostatniej aktualizacji: 12.04.2026</p>
        </header>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">1. Jakie dane przetwarzamy</h2>
          <p>
            Przetwarzamy dane niezbedne do logowania i obslugi konta w aplikacji, w tym dane
            podane podczas autoryzacji Google (np. adres e-mail, podstawowe dane profilu) oraz dane
            zwiazane z korzystaniem z funkcji systemu.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">2. Cel i podstawa przetwarzania</h2>
          <p>
            Dane przetwarzamy w celu umozliwienia logowania, utrzymania konta, zapewnienia
            bezpieczenstwa oraz realizacji funkcji oferowanych przez SimpliSalonCloud.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">3. Udostepnianie danych</h2>
          <p>
            Nie sprzedajemy danych osobowych. Dane moga byc powierzane podmiotom technicznym
            wspierajacym dzialanie uslugi (np. hosting, narzedzia infrastrukturalne) wyłącznie w
            zakresie niezbednym do swiadczenia uslugi.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">4. Okres przechowywania</h2>
          <p>
            Dane przechowujemy przez okres niezbedny do realizacji celow wskazanych powyzej albo do
            czasu usuniecia konta, chyba ze przepisy prawa wymagaja dluzszego przechowywania.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">5. Prawa uzytkownika</h2>
          <p>
            Uzytkownik ma prawo dostepu do danych, ich sprostowania, usuniecia, ograniczenia
            przetwarzania oraz wniesienia sprzeciwu zgodnie z obowiazujacymi przepisami.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">6. Kontakt</h2>
          <p>
            W sprawach dotyczacych prywatnosci skontaktuj sie z nami pod adresem:{" "}
            <a className="font-medium text-slate-900 underline" href="mailto:kontakt@simplisaloncloud.com">
              kontakt@simplisaloncloud.com
            </a>
            .
          </p>
        </section>

        <footer className="border-t border-slate-200 pt-4 text-sm text-slate-600">
          Zobacz takze{" "}
          <Link className="font-medium text-slate-900 underline" href="/terms">
            Warunki korzystania z uslugi
          </Link>
          .
        </footer>
      </div>
    </main>
  )
}
