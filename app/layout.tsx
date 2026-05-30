import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, IBM_Plex_Sans, Roboto_Slab } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"

const robotoSlabHeading = Roboto_Slab({subsets:['latin'],variable:'--font-heading'})
const ibmPlexSans = IBM_Plex_Sans({subsets:['latin'],variable:'--font-sans'})
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "ServicePortal",
  description: "Client portal for service professionals",
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(
        "min-h-screen bg-background font-sans antialiased",
        geistSans.variable,
        geistMono.variable,
        ibmPlexSans.variable,
        robotoSlabHeading.variable
      )}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
