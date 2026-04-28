import {
  Building2,
  Calendar,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CreditCard,
  FilePenLine,
  FileText,
  History,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Scissors,
  User,
  UserRoundCog,
  Users,
  type LucideIcon,
} from "lucide-react"

export type ObjectType = "client" | "worker" | "service" | "booking" | "salon"

export type ObjectTypeConfig = {
  type: ObjectType
  label: string
  colorVar: string
  icon: LucideIcon
  getRoute: (slug: string, id: string) => string
}

export type RelatedAction = {
  id: string
  label: string
  icon: LucideIcon
  variant?: "default" | "destructive"
  disabled?: boolean
  onClick: (id: string, slug: string) => void
}

type AppRouterInstance = ReturnType<typeof import("next/navigation").useRouter>

type ActionCtx = {
  router: AppRouterInstance
  slug: string
  toast: (msg: string) => void
}

const navigate = (path: string, router?: AppRouterInstance): void => {
  if (router) {
    router.push(path)
    return
  }
  console.warn(`Navigation unavailable for path: ${path}`)
}

export const OBJECT_TYPE_CONFIG: Record<ObjectType, ObjectTypeConfig> = {
  client: {
    type: "client",
    label: "Klient",
    colorVar: "--obj-client",
    icon: User,
    getRoute: (slug: string, id: string): string => `/${slug}/clients/${id}`,
  },
  worker: {
    type: "worker",
    label: "Pracownik",
    colorVar: "--obj-worker",
    icon: UserRoundCog,
    getRoute: (slug: string, id: string): string => `/${slug}/employees/${id}`,
  },
  service: {
    type: "service",
    label: "Usługa",
    colorVar: "--obj-service",
    icon: Scissors,
    getRoute: (slug: string): string => `/${slug}/services`,
  },
  booking: {
    type: "booking",
    label: "Rezerwacja",
    colorVar: "--obj-booking",
    icon: CalendarCheck2,
    getRoute: (slug: string, id: string): string => `/${slug}/bookings/${id}`,
  },
  salon: {
    type: "salon",
    label: "Salon",
    colorVar: "--obj-salon",
    icon: Building2,
    getRoute: (slug: string): string => `/${slug}/settings/business`,
  },
}

const ACTIONS: Record<ObjectType, RelatedAction[]> = {
  client: [
    { id: "otworz-profil", label: "Otwórz profil", icon: User, onClick: (id, slug) => navigate(`/${slug}/clients/${id}`) },
    { id: "zadzwon", label: "Zadzwoń (wkrótce)", icon: Phone, disabled: true, onClick: () => undefined },
    { id: "wyslij-sms", label: "Wyślij SMS", icon: MessageSquare, onClick: () => undefined },
    { id: "wyslij-email", label: "Wyślij e-mail (wkrótce)", icon: Mail, disabled: true, onClick: () => undefined },
    { id: "utworz-rezerwacje", label: "Utwórz rezerwację", icon: CalendarPlus, onClick: (id, slug) => navigate(`/${slug}/calendar?client=${id}`) },
    { id: "historia-wizyt", label: "Historia wizyt", icon: History, onClick: (id, slug) => navigate(`/${slug}/clients/${id}`) },
  ],
  worker: [
    { id: "otworz-profil", label: "Otwórz profil", icon: User, onClick: (id, slug) => navigate(`/${slug}/employees/${id}`) },
    { id: "pokaz-grafik", label: "Pokaż grafik", icon: CalendarDays, onClick: (_id, slug) => navigate(`/${slug}/employees?tab=grafik`) },
    { id: "dodaj-nieobecnosc", label: "Dodaj nieobecność", icon: CalendarClock, onClick: (_id, slug) => navigate(`/${slug}/employees/absences`) },
    { id: "dzisiejsze-wizyty", label: "Dzisiejsze wizyty", icon: Calendar, onClick: (id, slug) => navigate(`/${slug}/calendar?employee=${id}`) },
    { id: "przypisz-usluge", label: "Przypisz usługę", icon: Scissors, onClick: (id, slug) => navigate(`/${slug}/employees/${id}`) },
  ],
  service: [
    { id: "otworz-szczegoly", label: "Otwórz szczegóły", icon: FileText, onClick: (_id, slug) => navigate(`/${slug}/services`) },
    { id: "edytuj", label: "Edytuj", icon: FilePenLine, onClick: (_id, slug) => navigate(`/${slug}/services`) },
    { id: "pokaz-pracownikow", label: "Pokaż pracowników", icon: Users, onClick: (_id, slug) => navigate(`/${slug}/employees`) },
    { id: "dodaj-do-rezerwacji", label: "Dodaj do rezerwacji", icon: CalendarPlus, onClick: (_id, slug) => navigate(`/${slug}/calendar`) },
  ],
  booking: [
    { id: "otworz-szczegoly", label: "Otwórz szczegóły", icon: FileText, onClick: (id, slug) => navigate(`/${slug}/bookings/${id}`) },
    { id: "przeloz", label: "Przełóż", icon: CalendarClock, onClick: () => undefined },
    { id: "potwierdz", label: "Potwierdź", icon: CalendarCheck2, onClick: () => undefined },
    { id: "anuluj", label: "Anuluj", icon: CalendarCheck2, variant: "destructive", onClick: () => undefined },
    { id: "wyslij-przypomnienie", label: "Wyślij przypomnienie (wkrótce)", icon: MessageSquare, disabled: true, onClick: () => undefined },
    { id: "przyjmij-platnosc", label: "Przyjmij płatność", icon: CreditCard, onClick: (_id, slug) => navigate(`/${slug}/calendar`) },
  ],
  salon: [
    { id: "otworz-lokalizacje", label: "Otwórz lokalizację", icon: MapPin, onClick: (_id, slug) => navigate(`/${slug}/settings/business`) },
    { id: "godziny-otwarcia", label: "Godziny otwarcia", icon: CalendarClock, onClick: (_id, slug) => navigate(`/${slug}/settings/business`) },
    { id: "kalendarz", label: "Kalendarz", icon: CalendarDays, onClick: (_id, slug) => navigate(`/${slug}/calendar`) },
    { id: "edytuj", label: "Edytuj", icon: FilePenLine, onClick: (_id, slug) => navigate(`/${slug}/settings/business`) },
  ],
}

export function getActions(type: ObjectType, id: string, ctx?: ActionCtx): RelatedAction[] {
  return ACTIONS[type].map((action: RelatedAction) => {
    if (action.id === "wyslij-sms") {
      return {
        ...action,
        onClick: () => {
          if (!ctx) {
            console.warn("Action context unavailable: wyslij-sms")
            return
          }
          navigate(`/${ctx.slug}/clients/messages?clientId=${id}`, ctx.router)
        },
      }
    }

    if (action.id === "przeloz") {
      return {
        ...action,
        onClick: () => {
          if (!ctx) {
            console.warn("Action context unavailable: przeloz")
            return
          }
          navigate(`/${ctx.slug}/bookings/${id}`, ctx.router)
        },
      }
    }

    if (action.id === "potwierdz") {
      return {
        ...action,
        onClick: () => {
          void (async (): Promise<void> => {
            if (!ctx) {
              console.warn("Action context unavailable: potwierdz")
              return
            }
            const response = await fetch(`/api/bookings/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "confirmed" }),
            })
            if (!response.ok) {
              console.warn(`Failed to confirm booking ${id}`)
              return
            }
            ctx.toast("Wizyta potwierdzona")
          })()
        },
      }
    }

    if (action.id === "anuluj") {
      return {
        ...action,
        onClick: () => {
          void (async (): Promise<void> => {
            if (!ctx) {
              console.warn("Action context unavailable: anuluj")
              return
            }
            const response = await fetch(`/api/bookings/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "cancelled" }),
            })
            if (!response.ok) {
              console.warn(`Failed to cancel booking ${id}`)
              return
            }
            ctx.toast("Wizyta anulowana")
          })()
        },
      }
    }

    return {
      ...action,
      onClick: (_id: string, slug: string) => {
        const effectiveSlug = ctx?.slug ?? slug
        action.onClick(id, effectiveSlug)
      },
    }
  })
}
