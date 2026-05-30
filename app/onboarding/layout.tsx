import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Simple top bar for onboarding */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg tracking-[-1px]">SP</span>
            </div>
            <div className="font-semibold tracking-widest">SERVICEPORTAL</div>
          </div>
          <div className="text-sm text-muted-foreground">Setup Wizard</div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {children}
      </div>
    </div>
  )
}
