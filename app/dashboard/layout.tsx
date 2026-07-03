import { Sidebar } from '@/components/dashboard/sidebar'
import { DashboardScrollMain } from '@/components/dashboard/dashboard-scroll-main'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-dvh flex-col md:flex-row bg-background overflow-hidden">
      <Sidebar />
      <DashboardScrollMain>{children}</DashboardScrollMain>
    </div>
  )
}
