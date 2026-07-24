'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  getCrewTerminology,
  type CrewTerminology,
} from '@/lib/crew-terminology'
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

/** Company-custom field-team wording for client portal UI. */
export function usePortalCrewTerminology(): CrewTerminology {
  const shell = usePortalShell()
  return useMemo(() => getCrewTerminology(shell.crewLabel), [shell.crewLabel])
}