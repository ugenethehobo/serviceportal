import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { ResetPasswordForm } from '@/components/reset-password-form'

export default function ResetPasswordPage() {
  return (
    <AuthSplitLayout>
      <ResetPasswordForm />
    </AuthSplitLayout>
  )
}