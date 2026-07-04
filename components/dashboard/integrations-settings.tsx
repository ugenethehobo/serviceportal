'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getCompanyIntegrationsAction,
  saveZapierIntegrationAction,
  testZapierIntegrationAction,
} from '@/app/action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  INTEGRATION_PROVIDERS,
  ZAPIER_EVENT_TYPES,
  type IntegrationProvider,
  type IntegrationRecord,
} from '@/lib/integrations'
import { Calendar, Link2, Loader2, Webhook } from 'lucide-react'
import { toast } from 'sonner'

const PROVIDER_ICONS: Record<IntegrationProvider, typeof Link2> = {
  quickbooks: Link2,
  google_calendar: Calendar,
  zapier: Webhook,
}

export function IntegrationsSettings() {
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([])
  const [zapierUrl, setZapierUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    const result = await getCompanyIntegrationsAction()
    if (result.success) {
      setIntegrations(result.integrations)
      const zapier = result.integrations.find((row) => row.provider === 'zapier')
      setZapierUrl(
        typeof zapier?.config.webhook_url === 'string' ? zapier.config.webhook_url : ''
      )
    } else {
      toast.error(result.error || 'Failed to load integrations')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const getRecord = (provider: IntegrationProvider) =>
    integrations.find((row) => row.provider === provider)

  const saveZapier = async () => {
    setIsSaving(true)
    const result = await saveZapierIntegrationAction(zapierUrl)
    if (result.success) {
      toast.success('Zapier webhook saved')
      await load()
    } else {
      toast.error(result.error || 'Failed to save Zapier webhook')
    }
    setIsSaving(false)
  }

  const testZapier = async () => {
    setIsTesting(true)
    const result = await testZapierIntegrationAction()
    if (result.success) {
      toast.success('Test event sent to Zapier')
    } else {
      toast.error(result.error || 'Test failed')
    }
    setIsTesting(false)
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading integrations...</p>
  }

  return (
    <div className="space-y-4">
      {(['quickbooks', 'google_calendar', 'zapier'] as IntegrationProvider[]).map((provider) => {
        const meta = INTEGRATION_PROVIDERS[provider]
        const record = getRecord(provider)
        const Icon = PROVIDER_ICONS[provider]
        const status = record?.status || 'disconnected'

        return (
          <Card key={provider} className="p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border p-2 text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div>
                  <h3 className="font-semibold">{meta.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>
                </div>
              </div>
              <Badge
                variant={
                  status === 'connected'
                    ? 'default'
                    : status === 'error'
                      ? 'destructive'
                      : 'outline'
                }
              >
                {status === 'connected' ? 'Connected' : status === 'error' ? 'Error' : 'Not connected'}
              </Badge>
            </div>

            {provider === 'zapier' ? (
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="zapier-webhook">Webhook URL</Label>
                  <Input
                    id="zapier-webhook"
                    value={zapierUrl}
                    onChange={(e) => setZapierUrl(e.target.value)}
                    placeholder="https://hooks.zapier.com/hooks/catch/..."
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Events: {ZAPIER_EVENT_TYPES.join(', ')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void saveZapier()} disabled={isSaving}>
                    {isSaving && <Loader2 className="size-4 animate-spin" />}
                    Save webhook
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void testZapier()}
                    disabled={isTesting || !zapierUrl.trim()}
                  >
                    {isTesting && <Loader2 className="size-4 animate-spin" />}
                    Send test event
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="mt-4" variant="outline" disabled>
                Connect {meta.label} (OAuth setup required)
              </Button>
            )}
          </Card>
        )
      })}
    </div>
  )
}