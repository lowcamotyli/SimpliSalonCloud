'use client'

import { useState } from 'react'
import {
  Bell,
  Calendar,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Palette,
  Phone,
  Plus,
  Search,
  Settings,
  Sparkles,
  UserCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type PreviewTab = 'overview' | 'calendar' | 'clients' | 'forms'

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Kalendarz', icon: Calendar },
  { label: 'Rezerwacje', icon: FileText },
  { label: 'Klienci', icon: UserCircle },
  { label: 'Formularze', icon: ClipboardList },
  { label: 'Ustawienia', icon: Settings },
  { label: 'Subskrypcja', icon: CreditCard },
]

const metrics = [
  { label: 'Dzisiejsze wizyty', value: '12', note: '+8% vs wczoraj' },
  { label: 'Nowi klienci', value: '5', note: '3 rezerwacje online' },
  { label: 'Oblozenie', value: '82%', note: 'najmocniejszy tydzien' },
  { label: 'Satysfakcja', value: '4.9', note: 'srednia z opinii' },
]

const staff = ['Anna K.', 'Marta P.', 'Kasia W.', 'Julia S.', 'Natalia M.']
const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']
const weekDays = ['Pon 14', 'Wt 15', 'Sr 16', 'Czw 17', 'Pt 18']

const actionCards = [
  { title: 'Dodaj klienta', subtitle: 'Powieksz swoja baze', icon: UserCircle },
  { title: 'Przeglad kalendarza', subtitle: 'Zarzadzaj harmonogramem', icon: Calendar },
  { title: 'Ustawienia marki', subtitle: 'Logo, kolory, teksty', icon: Palette },
]

export function LuxeThemePreview() {
  const [tab, setTab] = useState<PreviewTab>('overview')

  return (
    <Card
      className="animate-luxe-enter overflow-hidden border-[#e6ddcf] bg-[#fcfaf6] shadow-sm transition-all"
    >
      <CardHeader className="border-b border-[#eee5d8] bg-gradient-to-b from-[#fffdf9] to-[#f7f1e7] px-6 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-xl font-medium text-[#2d241c]">Systemowy preview testowego motywu</CardTitle>
            <p className="mt-1 text-sm text-[#7c6f61]">
              Kierunek dla calego UI: shell, dashboard, kalendarz, klienci i formularze w jednej estetyce.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['overview', 'Overview'],
              ['calendar', 'Kalendarz'],
              ['clients', 'Klienci'],
              ['forms', 'Formularze'],
            ].map(([value, label]) => (
              <Button
                key={value}
                variant={tab === value ? 'default' : 'outline'}
                onClick={() => setTab(value as PreviewTab)}
                className={cn(
                  'rounded-full px-5 text-sm font-medium transition-all duration-300',
                  tab === value
                    ? 'bg-[#d6b07a] text-white hover:bg-[#c59d63] hover:shadow-md'
                    : 'border-[#d8cab6] bg-white text-[#5f5142] hover:bg-[#faf4eb]'
                )}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 md:p-8">
        <div className="animate-luxe-enter overflow-hidden rounded-[2rem] border border-[#eadfcf] bg-gradient-to-b from-[#fffdf9] to-[#f8f2e8] shadow-2xl shadow-black/5">
          <div className="grid min-h-[860px] lg:grid-cols-[280px_1fr]">
            <aside className="border-r border-[#e7ddcf] bg-gradient-to-b from-[#fbf7f0] to-[#f5ecdf]">
              <div className="border-b border-[#ece2d4] px-8 py-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d6b07a] text-white shadow-lg shadow-[#d6b07a]/30">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-serif text-2xl tracking-tight text-[#3a2b1f]">
                      SimpliSalon
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-[#9b8b77]">Premium Suite</p>
                  </div>
                </div>
              </div>

              <nav className="space-y-1 px-4 py-6">
                {navigation.map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.label}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                        item.active
                          ? 'bg-[#f0e2cd] text-[#6f5430] shadow-[inset_0_0_0_1px_rgba(214,176,122,0.35)]'
                          : 'text-[#76695a] hover:bg-white/50 hover:text-[#4a3f33]'
                      )}
                    >
                      <Icon className={cn('h-4.5 w-4.5', item.active ? 'text-[#c39658]' : 'text-[#a2927f]')} />
                      <span>{item.label}</span>
                    </div>
                  )
                })}
              </nav>

              <div className="px-4 py-6 mt-auto border-t border-[#ece2d4]/50">
                <div className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#eadfcf] bg-white/60 p-4 transition-all hover:bg-white/80 hover:shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#efe2cf] text-[#b78b4e]">
                    <UserCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#35291f]">bartosz.rogala</p>
                    <p className="text-xs text-[#9a8a76]">Wlasciciel</p>
                  </div>
                </div>
              </div>
            </aside>

            <section className="flex flex-col">
              <div className="flex h-24 items-center justify-between border-b border-[#ece2d4] px-8 lg:px-10">
                <div>
                  <p className="font-serif text-3xl tracking-tight text-[#2f241a]">ANASTAZJA</p>
                  <p className="mt-1 text-sm text-[#8b7e70]">Zarzadzaj swoim salonem w jednej, spojnej estetyce</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfcf] bg-white/80 text-[#866f54] transition-colors hover:bg-white">
                    <Search className="h-4.5 w-4.5" />
                  </button>
                  <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfcf] bg-white/80 text-[#866f54] transition-colors hover:bg-white">
                    <Bell className="h-4.5 w-4.5" />
                  </button>
                  <Button className="h-10 rounded-full bg-[#d6b07a] px-6 text-sm font-medium text-white transition-all hover:bg-[#c59d63] hover:shadow-lg hover:shadow-[#d6b07a]/20">
                    <Plus className="mr-2 h-4 w-4" />
                    Nowa wizyta
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-8 p-8 lg:p-10">
                <div className="relative overflow-hidden rounded-3xl border border-[#ebdfcf] bg-gradient-to-br from-[#fbf6ee] to-[#f7efe4] p-8 shadow-sm">
                  <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.8),transparent_70%)]" />
                  <div className="relative">
                    <span className="inline-flex rounded-full bg-[#efe2cf]/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#b1966d]">
                      Kierunek wizualny
                    </span>
                    <h3 className="mt-4 font-serif text-3xl leading-tight tracking-tight text-[#2d241c] sm:text-4xl">
                      Nowoczesna elegancja w interfejsie
                    </h3>
                    <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#796d60]">
                      Kremowe powierzchnie, jasne karty, zlote akcenty i spokojna typografia inspirowana stylem editorialnym. Odejscie od generycznego wygladu aplikacji na rzecz naturalnego luksusu.
                    </p>
                  </div>
                </div>

                {tab === 'overview' && <OverviewPanel />}
                {tab === 'calendar' && <CalendarPanel />}
                {tab === 'clients' && <ClientsPanel />}
                {tab === 'forms' && <FormsPanel />}
              </div>
            </section>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OverviewPanel() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="group rounded-[24px] border border-[#eadfcf] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:shadow-black/5">
            <p className="text-sm font-medium text-[#8a7c6c]">{metric.label}</p>
            <div className="mt-3 font-serif text-4xl tracking-tight text-[#2f241a]">{metric.value}</div>
            <p className="mt-2 text-xs font-semibold text-[#b1966d]">{metric.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-[28px] border border-[#eadfcf] bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-serif text-2xl tracking-tight text-[#2f241a]">Wydajnosc tygodnia</h4>
            <span className="rounded-full bg-[#f4eadb]/50 px-4 py-1.5 text-xs font-semibold text-[#a88858]">Raport wizualny</span>
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[3fr_2fr]">
            <div className="rounded-[24px] bg-[#fbf7f0] p-6 border border-[#f0e6d8]">
              <div className="relative h-[240px] w-full rounded-2xl border border-[#eee2d2] bg-gradient-to-b from-[#fffdfa] to-[#f8efe4] shadow-inner">
                <div className="absolute inset-x-8 top-[25%] border-t border-dashed border-[#dbcdb8]/60" />
                <div className="absolute inset-x-8 top-[50%] border-t border-dashed border-[#dbcdb8]/60" />
                <div className="absolute inset-x-8 top-[75%] border-t border-dashed border-[#dbcdb8]/60" />
                <div className="absolute bottom-8 left-8 right-8 h-1 rounded-full bg-gradient-to-r from-[#e6cdab] via-[#caa164] to-[#f0e2cd]">
                  <div className="absolute right-0 top-1/2 -mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#caa164] shadow-sm" />
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center space-y-5">
              <MiniCard title="Szybkie akcje" lines={['Nowa wizyta', 'Dodaj klienta', 'Wyslij przypomnienie']} />
              <MiniCard title="Najblizsze zadania" lines={['Potwierdzenia 11:00', 'Formularze po zabiegu']} />
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#d6b07a]/20 bg-gradient-to-b from-[#fdfbf7] to-[#f5ede1] p-8 shadow-sm">
          <h4 className="font-serif text-2xl tracking-tight text-[#2f241a]">Narzedzia</h4>
          <div className="mt-6 space-y-4">
            {actionCards.map(({ title, subtitle, icon: Icon }) => (
              <div key={title} className="group flex cursor-pointer items-center gap-4 rounded-2xl bg-white/60 p-4 transition-all hover:bg-white hover:shadow-md hover:shadow-black/5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#efe2cf] text-[#b78b4e] transition-transform group-hover:scale-105 group-hover:bg-[#e8d5bc]">
                  <Icon className="h-5.5 w-5.5" />
                </div>
                <div>
                  <p className="font-medium text-[#2f241a]">{title}</p>
                  <p className="text-sm text-[#8a7c6c]">{subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CalendarPanel() {
  return (
    <div className="rounded-[28px] border border-[#eadfcf] bg-white p-8 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="font-serif text-2xl tracking-tight text-[#2f241a]">Kalendarz tygodniowy</h4>
          <p className="mt-1.5 text-[15px] text-[#8a7c6c]">Estetyczny widok harmonogramu.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#eadfcf] bg-[#fbf7f0] p-1">
          <Button variant="ghost" className="rounded-full h-8 px-4 text-sm font-medium text-[#6d5d4b] hover:bg-white hover:text-[#4a3f33]">Dzien</Button>
          <Button className="rounded-full h-8 px-4 text-sm font-medium bg-white text-[#2f241a] shadow-sm">Tydzien</Button>
          <Button variant="ghost" className="rounded-full h-8 px-4 text-sm font-medium text-[#6d5d4b] hover:bg-white hover:text-[#4a3f33]">Miesiac</Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {staff.map((person) => (
          <span key={person} className="cursor-pointer rounded-full border border-[#e1d4c2] bg-[#faf4eb] px-5 py-2 text-xs font-semibold text-[#876f52] transition-colors hover:bg-[#efe4d5]">
            {person}
          </span>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-[#eadfcf] bg-white">
        <div className="grid grid-cols-[100px_repeat(5,minmax(0,1fr))]">
          <div className="bg-[#fcfaf6] p-4 text-center text-xs font-bold uppercase tracking-widest text-[#8b7e70]">Czas</div>
          {weekDays.map((day) => (
            <div key={day} className="border-l border-[#eadfcf] bg-[#fcfaf6] p-4 text-center text-sm font-semibold text-[#5e5040]">
              {day}
            </div>
          ))}
          {timeSlots.map((time) => (
            <div key={time} className="contents">
              <div className="flex h-[88px] items-center justify-center border-t border-[#efe4d5] bg-[#fcfaf6] text-sm font-medium text-[#7f7264]">{time}</div>
              {weekDays.map((day, index) => (
                <div key={`${day}-${time}`} className="relative h-[88px] border-l border-t border-[#efe4d5] bg-white transition-colors hover:bg-[#faf4eb]/50">
                  {day === 'Sr 16' && time === '11:00' && index === 2 && (
                    <div className="absolute inset-2 z-10 rounded-xl border border-[#ead7c9] bg-gradient-to-br from-[#fffaf4] to-[#fdf2e8] p-3 shadow-md shadow-[#d6b07a]/10 cursor-pointer transition-transform hover:scale-[1.02]">
                      <p className="text-xs font-bold text-[#3a2d22]">Koloryzacja premium</p>
                      <p className="mt-1 text-[11px] font-medium text-[#8a7c6c]">Anna Kowalska</p>
                      <p className="mt-2 text-[10px] font-bold tracking-wide text-[#b29163]">11:00 &middot; 2h 30m</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ClientsPanel() {
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-[28px] border border-[#eadfcf] bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#f0e6d8] pb-6">
          <h4 className="font-serif text-2xl tracking-tight text-[#2f241a]">Lista klientow</h4>
          <Button className="h-9 rounded-full bg-[#d6b07a] px-5 text-sm text-white hover:bg-[#c59d63] shadow-sm">
            Dodaj klienta
          </Button>
        </div>
        <div className="mt-6 space-y-4">
          {[
            ['Anna Kowalska', 'Ostatnia wizyta: 2 dni temu', 'Aktywna'],
            ['Marta Piotrowska', 'Pakiet koloryzacji · VIP', 'VIP'],
            ['Julia Wojcik', 'Oczekuje na konsultacje', 'Nowa'],
          ].map(([name, meta, status]) => (
            <div key={name} className="group flex cursor-pointer items-center justify-between rounded-2xl border border-[#efe4d5] bg-[#fffdfa] p-4 transition-all hover:bg-white hover:shadow-md hover:shadow-black/5 hover:border-[#e6d0a7]">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f0e2cd] text-[#b78b4e]">
                  <UserCircle className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-base font-semibold text-[#2f241a]">{name}</p>
                  <p className="text-sm text-[#8a7c6c]">{meta}</p>
                </div>
              </div>
              <span className="rounded-full bg-[#fcfaf6] border border-[#efe2cf] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#a88858]">
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-[#eadfcf] bg-gradient-to-b from-[#fdfbf7] to-[#f5ede1] p-8 shadow-sm">
        <h4 className="font-serif text-2xl tracking-tight text-[#2f241a]">Karta klienta</h4>
        <div className="mt-6 rounded-[24px] bg-white p-6 shadow-sm border border-[#eee2d2]">
          <div className="flex items-center gap-5 border-b border-[#f0e6d8] pb-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#f0e2cd] text-[#b78b4e]">
              <UserCircle className="h-8 w-8" />
            </div>
            <div>
              <p className="font-serif text-xl tracking-tight text-[#2f241a]">Anna Kowalska</p>
              <span className="mt-1.5 inline-block rounded-md bg-[#f6eee2] px-2 py-0.5 text-xs font-semibold text-[#8a7c6c]">
                Stala klientka &middot; 14 wizyt
              </span>
            </div>
          </div>
          <div className="mt-6 space-y-4 text-[15px] text-[#6f6254]">
            <div className="flex items-center gap-3"><Phone className="h-5 w-5 text-[#b78b4e]" /> +48 600 700 800</div>
            <div className="flex items-center gap-3"><Calendar className="h-5 w-5 text-[#b78b4e]" /> Kolejna wizyta: 18 marca, 11:00</div>
            <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-green-600/70" /> Formularze kompletne</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormsPanel() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_2fr] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-[28px] border border-[#eadfcf] bg-gradient-to-b from-[#fdfbf7] to-[#f5ede1] p-8 shadow-sm">
        <h4 className="font-serif text-2xl tracking-tight text-[#2f241a]">Katalog</h4>
        <div className="mt-6 space-y-3">
          {['Konsultacja', 'Zgoda zabiegowa', 'Ankieta po wizycie', 'Formularz online'].map((item, index) => (
            <div
              key={item}
              className={cn(
                'cursor-pointer rounded-[20px] border px-5 py-4 text-[15px] font-medium transition-all',
                index === 0 
                  ? 'border-[#d9c4a1] bg-white text-[#7f6238] shadow-sm' 
                  : 'border-transparent bg-white/50 text-[#6f6254] hover:bg-white hover:text-[#4a3f33]'
              )}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-[#eadfcf] bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#f0e6d8] pb-6">
          <h4 className="font-serif text-2xl tracking-tight text-[#2f241a]">Edycja formularza</h4>
          <span className="rounded-full bg-[#fcfaf6] border border-[#efe2cf] px-4 py-1.5 text-xs font-semibold text-[#a88858]">Tryb edycji</span>
        </div>
        <div className="mt-8 grid gap-6">
          <Field label="Tytul formularza" value="Konsultacja przed zabiegiem" />
          <Field label="Opis krotki" value="Krotki wstep i instrukcje dla klienta przed wypelnieniem pytan." large />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Przycisk CTA" value="Rozpocznij formularz" />
            <Field label="Status publikacji" value="Aktywny - gotowy do wysylki" />
          </div>
          <div className="mt-2 flex items-center justify-end gap-3 border-t border-[#f0e6d8] pt-6">
            <Button variant="ghost" className="rounded-full px-6 font-medium text-[#6d5d4b] hover:bg-[#fcfaf6]">Anuluj</Button>
            <Button className="rounded-full bg-[#d6b07a] px-8 font-medium text-white shadow-md shadow-[#d6b07a]/20 hover:bg-[#c59d63]">
              Zapisz i opublikuj
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-[20px] border border-[#eadfcf] bg-white p-5 shadow-sm">
      <p className="font-semibold text-[#2f241a]">{title}</p>
      <div className="mt-4 space-y-2">
        {lines.map((line) => (
          <div key={line} className="rounded-xl bg-[#f7efe4]/50 px-4 py-2.5 text-sm font-medium text-[#756757]">
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <label className="mb-2.5 block text-[13px] font-bold uppercase tracking-wider text-[#9b8b77]">{label}</label>
      <div className={cn(
        'rounded-2xl border border-[#eadcfca] bg-[#fffdfa] px-5 py-3.5 text-[15px] font-medium text-[#3a2d22] transition-colors hover:border-[#d9c4a1]',
        large && 'min-h-[100px] items-start'
      )}>
        {value}
      </div>
    </div>
  )
}
