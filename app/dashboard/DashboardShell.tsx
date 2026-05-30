'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import SidebarNav from './sidebar'
import { Menu, X } from 'lucide-react'

interface DashboardShellProps {
  companyName: string
  logoUrl: string | null
  userEmail?: string | null
  children: React.ReactNode
}

export default function DashboardShell({
  companyName,
  logoUrl,
  userEmail,
  children,
}: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <div className="flex h-screen flex-col lg:flex-row bg-background">
      {/* Mobile Top Bar - only visible on small screens */}
      <div className="lg:hidden flex items-center justify-between border-b bg-card px-4 h-14">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName}
              className="w-8 h-8 object-contain rounded-xl"
            />
          ) : (
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">SP</span>
            </div>
          )}
          <div className="font-semibold text-lg tracking-tight truncate max-w-[180px]">
            {companyName}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Desktop Sidebar - hidden on mobile, shown on lg+ */}
      <div className="hidden lg:flex w-64 border-r bg-card flex-col">
        {/* Desktop Logo / Branding */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName}
                className="w-10 h-10 object-contain rounded-2xl"
              />
            ) : (
              <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">SP</span>
              </div>
            )}
            <div>
              <div className="font-bold text-xl">{companyName}</div>
              <div className="text-xs text-muted-foreground -mt-1">Client Portal</div>
            </div>
          </div>
        </div>

        <SidebarNav onNavigate={() => {}} />

        {/* Desktop Bottom Section */}
        <div className="p-4 border-t flex justify-between items-center mt-auto">
          <form action="/auth/signout" method="post">
            <Button
              type="submit"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Sign Out
            </Button>
          </form>
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile Drawer (slide-in from left) */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={closeMobileMenu}
          />
          
          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[80vw] bg-card border-r flex flex-col h-full shadow-xl">
            {/* Mobile Drawer Header */}
            <div className="p-6 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={companyName}
                    className="w-9 h-9 object-contain rounded-2xl"
                  />
                ) : (
                  <div className="w-9 h-9 bg-primary rounded-2xl flex items-center justify-center">
                    <span className="text-primary-foreground font-bold text-lg">SP</span>
                  </div>
                )}
                <div>
                  <div className="font-bold text-lg">{companyName}</div>
                  <div className="text-xs text-muted-foreground -mt-1">Client Portal</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={closeMobileMenu}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Navigation (reuse the same component) */}
            <div className="flex-1 overflow-auto">
              <SidebarNav onNavigate={closeMobileMenu} />
            </div>

            {/* Mobile Drawer Footer */}
            <div className="p-4 border-t space-y-3">
              <form action="/auth/signout" method="post" className="w-full">
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Sign Out
                </Button>
              </form>
              <div className="flex justify-end">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 md:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
