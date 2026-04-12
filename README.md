# SimpliSalonCloud

Kompleksowy system zarządzania salonem piękności - migracja z Google Apps Script na Next.js 14 + Supabase.

## 🚀 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **UI:** shadcn/ui + Tailwind CSS
- **Forms:** React Hook Form + Zod
- **State Management:** TanStack Query (React Query)
- **Calendar Integration:** Google Calendar API
- **Booking Integration:** Booksy API

## 📋 Wymagania

- Node.js 18.x lub nowszy
- npm lub yarn
- Konto Supabase
- Google Cloud Console account (dla Calendar API)
- Booksy API credentials (opcjonalne)

## 🛠️ Setup

### 1. Klonowanie repozytorium

```bash
git clone https://github.com/lowcamotyli/SimpliSalonCloud.git
cd SimpliSalonCloud
```

### 2. Instalacja zależności

```bash
npm install
```

### 3. Konfiguracja zmiennych środowiskowych

Skopiuj `.env.example.txt` do `.env.local`:

```bash
cp .env.example.txt .env.local
```

Wypełnij zmienne środowiskowe:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Google Calendar API
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_BOOKSY_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback
GOOGLE_GMAIL_SEND_REDIRECT_URI=http://localhost:3000/api/integrations/gmail-send/callback

# Booksy API (opcjonalne)
BOOKSY_API_KEY=your-api-key
BOOKSY_BUSINESS_ID=your-business-id
```

### 4. Uruchomienie Development Server

```bash
npm run dev
```

Aplikacja będzie dostępna pod adresem: [http://localhost:3000](http://localhost:3000)

## 📁 Struktura Projektu

```
SimpliSalonCloud/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Auth routes (login, signup)
│   ├── (dashboard)/[slug]/  # Dashboard routes (multi-tenant)
│   ├── api/                 # API routes
│   ├── globals.css          # Global styles
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
├── components/              # React components
│   ├── layout/             # Layout components (navbar, sidebar)
│   ├── calendar/           # Calendar components
│   └── ui/                 # shadcn/ui components
├── hooks/                   # Custom React hooks
├── lib/                     # Utility functions
│   ├── supabase/           # Supabase clients
│   ├── booksy/             # Booksy API integration
│   ├── providers/          # Context providers
│   └── utils/              # Helper functions
├── types/                   # TypeScript types
│   └── database.ts         # Supabase database types
└── middleware.ts           # Next.js middleware (auth)
```

## 🗄️ Database Schema

Projekt używa Supabase PostgreSQL z następującymi głównymi tabelami:

- `salons` - Dane salonów (multi-tenant)
- `employees` - Pracownicy salonu
- `clients` - Klienci
- `services` - Usługi oferowane
- `bookings` - Rezerwacje
- `payroll` - Rozliczenia pracowników

## 🔐 Autentykacja

Projekt używa Supabase Auth z następującymi metodami:
- Email/Password
- Google OAuth (w planach)

## 📝 Główne Features

### ✅ Zaimplementowane
- [x] Struktura projektu
- [x] Podstawowa autentykacja
- [x] Layout i routing
- [x] Typy TypeScript dla bazy danych

### 🚧 W trakcie implementacji
- [ ] Zarządzanie pracownikami
- [ ] Zarządzanie klientami
- [ ] Kalendarz i rezerwacje
- [ ] Integracja z Booksy
- [ ] Rozliczenia (payroll)
- [ ] Raporty i statystyki

## 🧪 Testowanie

```bash
# Uruchom testy (gdy będą dodane)
npm test

# Uruchom linter
npm run lint

# Build produkcyjny
npm run build
```

## 🚀 Deployment

Aplikacja jest skonfigurowana do deployu na Vercel:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Lub połącz repozytorium z Vercel dashboard dla automatycznego deploymentu.

## 📚 Dokumentacja

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [TanStack Query Documentation](https://tanstack.com/query/latest)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is private and proprietary.

## 👨‍💻 Author

**Bartosz** - [@lowcamotyli](https://github.com/lowcamotyli)

---

**Status:** 🚧 W aktywnym rozwoju
**Wersja:** 0.1.0
