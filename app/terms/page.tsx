import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Warunki Korzystania | SimpliSalonCloud",
  description: "Warunki korzystania z aplikacji SimpliSalonCloud.",
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">SimpliSalonCloud</p>
          <h1 className="text-3xl font-bold tracking-tight">Warunki korzystania z uslugi</h1>
          <p className="text-sm text-slate-600">Data ostatniej aktualizacji: 12.04.2026</p>
        </header>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">1. Postanowienia ogolne</h2>
          <p>
            Niniejszy dokument okresla zasady korzystania z aplikacji SimpliSalonCloud. Korzystanie
            z uslugi oznacza akceptacje ponizszych warunkow.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">2. Konto i dostep</h2>
          <p>
            Uzytkownik odpowiada za poufnosc danych logowania oraz za wszystkie dzialania wykonane
            przy uzyciu swojego konta. W przypadku podejrzenia nieuprawnionego dostepu nalezy
            niezwlocznie skontaktowac sie z administratorem uslugi.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">3. Dozwolone korzystanie</h2>
          <p>
            Zabronione jest korzystanie z uslugi w sposob naruszajacy prawo, prawa osob trzecich lub
            bezpieczenstwo systemu, w tym podejmowanie prob nieautoryzowanego dostepu do danych.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">4. Odpowiedzialnosc</h2>
          <p>
            Usluga jest swiadczona z nalezyta starannoscia, jednak dostawca nie odpowiada za
            przerwy techniczne niezalezne od niego lub skutki nieprawidlowego uzycia aplikacji przez
            uzytkownika.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">5. Zmiany warunkow</h2>
          <p>
            Warunki moga byc aktualizowane. Aktualna wersja jest publikowana pod tym adresem wraz z
            data ostatniej aktualizacji.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6 text-slate-700">
          <h2 className="text-lg font-semibold text-slate-900">6. Kontakt</h2>
          <p>
            W sprawach dotyczacych warunkow korzystania skontaktuj sie:{" "}
            <a className="font-medium text-slate-900 underline" href="mailto:kontakt@simplisaloncloud.com">
              kontakt@simplisaloncloud.com
            </a>
            .
          </p>
        </section>

        <footer className="border-t border-slate-200 pt-4 text-sm text-slate-600">
          Zobacz takze{" "}
          <Link className="font-medium text-slate-900 underline" href="/privacy">
            Polityke prywatnosci
          </Link>
          .
        </footer>
      </div>
    </main>
  )
}
