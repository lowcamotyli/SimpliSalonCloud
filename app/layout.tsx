import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "sonner"
import { QueryProvider } from "@/lib/providers/query-provider"
import "./globals.css"

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