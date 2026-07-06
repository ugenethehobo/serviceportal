'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PortalShellData } from '@/lib/portal-auth'

const PortalShellContext = createContext<PortalShellData | null>(null)

export function PortalShellProvider({
  children,
  data,
}: {
  children: ReactNode
  data: PortalShellData
}) {
  return (
    <PortalShellContext.Provider value={data}>{children}</PortalShellContext.Provider>
  )
}

export function usePortalShell() {
  const context = useContext(PortalShellContext)
  if (!context) {
    throw new Error('usePortalShell must be used within PortalShellProvider')
  }
  return context
}