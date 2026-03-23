import type { Metadata } from "next"
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

const previewUi = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-preview-ui',
})

const previewDisplay = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-preview-display',
})

export const metadata: Metadata = {
  title: "SimpliSalon - System zarządzania salonem",
  description: "Kompleksowy system do zarządzania salonem piękności",
}

import { TooltipProvider } from "@/components/ui/tooltip"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pl">
      <body className={`${inter.className} ${previewUi.variable} ${previewDisplay.variable}`}>
        <QueryProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </QueryProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
