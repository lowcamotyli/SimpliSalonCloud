import type { Metadata } from "next"
import { Inter } from "next/font/google"
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

export const metadata: Metadata = {
  title: "SimpliSalon - System zarządzania salonem",
  description: "Kompleksowy system do zarządzania salonem piękności",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pl">
      <body className={inter.className}>
        <QueryProvider>
          {children}
        </QueryProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
