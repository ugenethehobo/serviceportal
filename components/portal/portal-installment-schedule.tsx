import { cn } from '@/lib/utils'
import type { PortalJobInstallment } from '@/lib/portal-jobs'

type InstallmentLike = Pick<
  PortalJobInstallment,
  'id' | 'label' | 'remaining' | 'remainingFormatted' | 'amountDueFormatted' | 'collectibleNow' | 'status'
>

type PortalInstallmentScheduleProps = {
  installments: InstallmentLike[]
  /** denser = billing overview list; comfortable = jobs page */
  density?: 'compact' | 'comfortable'
  className?: string
}

function installmentState(inst: InstallmentLike): 'due' | 'later' | 'paid' {
  if (inst.status === 'paid' || inst.remaining <= 0) return 'paid'
  if (inst.collectibleNow) return 'due'
  return 'later'
}

export function PortalInstallmentSchedule({
  installments,
  density = 'compact',
  className,
}: PortalInstallmentScheduleProps) {
  if (installments.length === 0) return null

  return (
    <ul
      className={cn(
        'overflow-hidden rounded-lg border bg-muted/20',
        className
      )}
    >
      {installments.map((inst, index) => {
        const state = installmentState(inst)
        return (
          <li
            key={inst.id}
            className={cn(
              'flex items-center justify-between gap-3',
              density === 'compact' ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm',
              index > 0 && 'border-t border-border/70'
            )}
          >
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate font-medium',
                  state === 'due' ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {inst.label}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-[11px]',
                  state === 'due'
                    ? 'font-medium text-orange-600 dark:text-orange-400'
                    : 'text-muted-foreground'
                )}
              >
                {state === 'due' ? 'Due now' : state === 'later' ? 'Later' : 'Paid'}
              </p>
            </div>
            <p
              className={cn(
                'shrink-0 tabular-nums font-semibold',
                density === 'compact' ? 'text-xs' : 'text-sm',
                state === 'due'
                  ? 'text-orange-600 dark:text-orange-400'
                  : state === 'paid'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
              )}
            >
              {state === 'paid' ? inst.amountDueFormatted : inst.remainingFormatted}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
