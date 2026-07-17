'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateAccountSettingsAction } from '@/app/action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getPasswordRequirementsHint } from '@/lib/password-policy'
import { toast } from 'sonner'

type UserSignInSettingsProps = {
  fullName: string
  email: string
  onSaved: (values: { fullName: string; email: string }) => void
}

export function UserSignInSettings({
  fullName,
  email,
  onSaved,
}: UserSignInSettingsProps) {
  const router = useRouter()
  const [draftEmail, setDraftEmail] = useState(email)
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setDraftEmail(email)
  }, [email])

  const handleSave = async () => {
    setIsSaving(true)
    const result = await updateAccountSettingsAction({
      fullName,
      email: draftEmail,
      password: password || undefined,
    })

    if (result.success) {
      toast.success('Sign-in details updated')
      setPassword('')
      onSaved({ fullName, email: draftEmail })
      window.dispatchEvent(new CustomEvent('dashboard-profile-updated'))
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update sign-in details')
    }
    setIsSaving(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Update the email and password you use to log in.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="settings-sign-in-email">Email</Label>
          <Input
            id="settings-sign-in-email"
            type="email"
            value={draftEmail}
            onChange={(event) => setDraftEmail(event.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-sign-in-password">New password</Label>
          <Input
            id="settings-sign-in-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Leave blank to keep current password"
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            {getPasswordRequirementsHint()} when changing your password. Signed out on another
            device?{' '}
            <Link href="/login/forgot-password" className="font-medium text-primary hover:underline">
              Reset via email
            </Link>
            .
          </p>
        </div>

        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save sign-in changes'}
        </Button>
      </div>
    </div>
  )
}