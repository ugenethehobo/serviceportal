'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  getJobHelpersAction,
  setJobHelpersAction,
} from '@/app/job-helpers-actions'
import type { JobHelperPerson } from '@/lib/job-helpers'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  MOBILE_FULL_WIDTH_BUTTON_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import { Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'

type JobHelpersPanelProps = {
  jobId: string
  clientId: string
  /** Solo mode hides the panel entirely. */
  isSoloBusiness?: boolean
  className?: string
}

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function JobHelpersPanel({
  jobId,
  clientId,
  isSoloBusiness = false,
  className,
}: JobHelpersPanelProps) {
  const [helpers, setHelpers] = useState<JobHelperPerson[]>([])
  const [candidates, setCandidates] = useState<JobHelperPerson[]>([])
  const [canManage, setCanManage] = useState(false)
  const [maxHelpers, setMaxHelpers] = useState(6)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await getJobHelpersAction(jobId, clientId)
    if (!result.success) {
      setError(result.error)
      setHelpers([])
      setCanManage(false)
      setLoading(false)
      return
    }
    setHelpers(result.helpers)
    setCandidates(result.candidates)
    setCanManage(result.canManage)
    setMaxHelpers(result.maxHelpers)
    setSelected(new Set(result.helpers.map((h) => h.id)))
    setLoading(false)
  }, [jobId, clientId])

  useEffect(() => {
    if (isSoloBusiness) {
      setLoading(false)
      return
    }
    void load()
  }, [isSoloBusiness, load])

  if (isSoloBusiness) return null

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < maxHelpers) {
        next.add(id)
      } else {
        toast.error(`You can add up to ${maxHelpers} helpers`)
      }
      return next
    })
  }

  function save() {
    startTransition(async () => {
      const result = await setJobHelpersAction({
        jobId,
        clientId,
        helperProfileIds: Array.from(selected),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setHelpers(result.helpers)
      setSelected(new Set(result.helpers.map((h) => h.id)))
      setEditing(false)
      toast.success(
        result.helpers.length === 0
          ? 'Helpers cleared'
          : `Saved ${result.helpers.length} helper${result.helpers.length === 1 ? '' : 's'}`
      )
    })
  }

  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Users className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Helpers</h2>
          {helpers.length > 0 ? (
            <Badge variant="secondary" className="text-xs">
              {helpers.length}
            </Badge>
          ) : null}
        </div>
        {canManage && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('shrink-0', MOBILE_FULL_WIDTH_BUTTON_CLASS, 'max-md:w-auto')}
            onClick={() => setEditing(true)}
          >
            {helpers.length > 0 ? 'Edit helpers' : 'Add helpers'}
          </Button>
        ) : null}
      </div>

      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : editing ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Extra techs on this job see it on My Day and can start or complete it.
              Max {maxHelpers}.
            </p>
            <ScrollArea className="max-h-56 rounded-md border" viewportClassName="scroll-fade">
              <div className="space-y-0.5 p-2">
                {candidates.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">
                    No team members available.
                  </p>
                ) : (
                  candidates.map((person) => {
                    const checked = selected.has(person.id)
                    return (
                      <label
                        key={person.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(person.id)}
                        />
                        <Avatar className="size-7 shrink-0">
                          <AvatarImage src={person.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {initials(person.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {person.fullName}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            </ScrollArea>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
                disabled={pending}
                onClick={() => {
                  setSelected(new Set(helpers.map((h) => h.id)))
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
                disabled={pending}
                onClick={save}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save helpers'
                )}
              </Button>
            </div>
          </div>
        ) : helpers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'No helpers yet. Add techs when this job needs more than one person.'
              : 'No helpers assigned to this job.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {helpers.map((person) => (
              <li
                key={person.id}
                className="flex min-h-11 items-center gap-3 rounded-md border bg-card px-3 py-2"
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarImage src={person.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs">
                    {initials(person.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{person.fullName}</p>
                  <p className="text-xs text-muted-foreground">Helper</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
