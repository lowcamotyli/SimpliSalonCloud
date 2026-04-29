import type { Metadata, Viewport } from "next"
import { Cormorant_Garamond, Inter, Manrope } from "next/font/google"
import { Toaster } from "sonner"
import { validateEnv } from "@/lib/config/validate-env"
import { QueryProvider } from "@/lib/providers/query-provider"
import "./globals.css"

const shouldThrowOnEnvError = process.env.NODE_ENV === 'production' || process.env.ENFORCE_ENV_VALIDATION === 'true'
validateEnv(shouldThrowOnEnvError)

const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-inter',
})

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-cormorant',
})

export const viewport: Viewport = {
  themeColor: '#F3F5F7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: "SimpliSalon - System zarządzania salonem",
  description: "Kompleksowy system do zarządzania salonem piękności",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SimpliSalon',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

import { TooltipProvider } from "@/components/ui/tooltip"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pl">
      <body className={`${inter.className} ${inter.variable} ${manrope.variable} ${cormorant.variable}`}>
        <QueryProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </QueryProvider>
        <Toaster position="top-right" richColors />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')` }} />
      </body>
    </html>
  )
}
