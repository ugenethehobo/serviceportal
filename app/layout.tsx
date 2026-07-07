import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { AppBackground } from "@/components/app-background";
import { PersonalizationProvider } from "@/components/personalization-provider";
import { ThemeProvider } from "@/components/theme-provider";
import {
  ACCENT_COLOR_STORAGE_KEY,
  buildAccentBootstrapSnippet,
  buildBackgroundBootstrapSnippet,
} from "@/lib/personalization";
import { getUserPersonalization } from "@/lib/personalization-server";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { getThemeScriptDefault } from "@/lib/theme-server";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ServicePortal",
  description: "A full CRM built for small businesses",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [initialTheme, initialPersonalization] = await Promise.all([
    getThemeScriptDefault(),
    getUserPersonalization(),
  ]);

  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
        initialTheme === "dark" && "dark"
      )}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${initialTheme}';if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}${buildBackgroundBootstrapSnippet(initialPersonalization.backgroundImageUrl)}${buildAccentBootstrapSnippet(ACCENT_COLOR_STORAGE_KEY, initialPersonalization.accentColor)}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={cn(
          'min-h-full flex flex-col',
          initialPersonalization.backgroundImageUrl && 'has-app-background'
        )}
      >
        <ThemeProvider initialTheme={initialTheme}>
          <PersonalizationProvider initialPersonalization={initialPersonalization}>
            <div className="relative isolate flex min-h-full flex-1 flex-col">
              <AppBackground />
              <div className="relative z-10 flex min-h-full flex-1 flex-col">
                {children}
                <Toaster />
              </div>
            </div>
          </PersonalizationProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
