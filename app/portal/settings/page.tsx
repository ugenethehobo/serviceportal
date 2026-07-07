import { AppearanceSettings } from '@/components/appearance-settings'
import { PortalPageHeader } from '@/components/portal/portal-page-header'

export default function PortalSettingsPage() {
  return (
    <div className="flex flex-col gap-6 h-full min-h-0 p-6 max-w-2xl">
      <PortalPageHeader
        title="Settings"
        description="Manage your client portal preferences."
      />
      <AppearanceSettings canEditCompanyBranding={false} />
    </div>
  )
}