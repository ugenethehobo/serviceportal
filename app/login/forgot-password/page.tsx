import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { ForgotPasswordForm } from '@/components/forgot-password-form'

export default function ForgotPasswordPage() {
  return (
    <AuthSplitLayout>
      <ForgotPasswordForm />
    </AuthSplitLayout>
  )
}