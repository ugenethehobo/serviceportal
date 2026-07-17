'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Briefcase,
  Camera,
  CreditCard,
  FileSignature,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Loader2,
  Search,
  Settings,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { globalSearchAction } from '@/app/global-search-actions'
import { useDashboardShell } from '@/components/dashboard/dashboard-shell-context'
import { useNavigation } from '@/components/navigation/navigation-provider'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import {
  getGlobalSearchGroupOrder,
  getGlobalSearchResultKey,
  groupGlobalSearchResults,
  mergeGlobalSearchResults,
  searchStaticGlobalResults,
  type GlobalSearchResult,
  type GlobalSearchResultType,
} from '@/lib/global-search'
import { cn } from '@/lib/utils'

const RESULT_TYPE_ICONS: Record<GlobalSearchResultType, LucideIcon> = {
  page: LayoutDashboard,
  settings: Settings,
  client: Users,
  job: Briefcase,
  lead: UserPlus,
  crew: Users,
  team: Users,
  estimate: FileText,
  document: FolderOpen,
  contract: FileSignature,
  contract_template: FileSignature,
  payment: Wallet,
  photo: Camera,
  service_package: CreditCard,
}

type DashboardGlobalSearchProps = {
  className?: string
}

export function DashboardGlobalSearch({ className }: DashboardGlobalSearchProps) {
  const router = useRouter()
  const { startNavigation } = useNavigation()
  const { data: shellData } = useDashboardShell()

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState<GlobalSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFocused, setIsFocused] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmedQuery = query.trim()

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(trimmedQuery), 250)
    return () => window.clearTimeout(timer)
  }, [trimmedQuery])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const searchGroupOrder = useMemo(
    () =>
      getGlobalSearchGroupOrder(
        shellData?.isSoloBusiness ?? false,
        shellData?.crewLabel
      ),
    [shellData?.crewLabel, shellData?.isSoloBusiness]
  )

  const staticResults = useMemo(() => {
    if (!trimmedQuery) return []
    return searchStaticGlobalResults(trimmedQuery, {
      role: shellData?.role,
      plan: shellData?.subscriptionAccess?.plan ?? null,
      isSoloBusiness: shellData?.isSoloBusiness,
      crewLabel: shellData?.crewLabel,
    })
  }, [
    trimmedQuery,
    shellData?.crewLabel,
    shellData?.isSoloBusiness,
    shellData?.role,
    shellData?.subscriptionAccess?.plan,
  ])

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setRemoteResults([])
      setError(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    void globalSearchAction(debouncedQuery).then((result) => {
      if (cancelled) return
      if (!result.success) {
        setError(result.error)
        setRemoteResults([])
      } else {
        setRemoteResults(result.results)
        setError(null)
      }
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const results = useMemo(() => {
    if (!trimmedQuery) return []
    if (trimmedQuery.length < 2 || debouncedQuery !== trimmedQuery) {
      return groupGlobalSearchResults(staticResults, searchGroupOrder)
    }
    return mergeGlobalSearchResults(
      staticResults,
      remoteResults,
      searchGroupOrder
    )
  }, [
    trimmedQuery,
    debouncedQuery,
    remoteResults,
    staticResults,
    searchGroupOrder,
  ])

  const groupedResults = useMemo(() => {
    const groups = new Map<string, GlobalSearchResult[]>()
    for (const result of results) {
      const list = groups.get(result.group) ?? []
      list.push(result)
      groups.set(result.group, list)
    }

    return searchGroupOrder.flatMap((group) => {
      const items = groups.get(group)
      if (!items?.length) return []
      return [{ group, items }]
    })
  }, [results, searchGroupOrder])

  const showPanel = isFocused && trimmedQuery.length > 0

  const handleSelect = useCallback(
    (href: string) => {
      setQuery('')
      setDebouncedQuery('')
      setRemoteResults([])
      setIsFocused(false)
      startNavigation(href)
      router.push(href)
    },
    [router, startNavigation]
  )

  const handleClear = useCallback(() => {
    setQuery('')
    setDebouncedQuery('')
    setRemoteResults([])
    inputRef.current?.focus()
  }, [])

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder="Search clients, jobs, documents, settings, and more..."
        className="h-9 pl-8 pr-9 text-sm max-md:min-h-11"
        aria-label="Search across your business"
        aria-expanded={showPanel}
        aria-controls={showPanel ? 'dashboard-global-search-results' : undefined}
        aria-autocomplete="list"
        role="combobox"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </Button>
      ) : null}

      {showPanel ? (
        <div
          id="dashboard-global-search-results"
          className="absolute top-[calc(100%+0.375rem)] left-0 right-0 z-50 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <Command shouldFilter={false} className="rounded-lg">
            <CommandList className="max-h-[min(60vh,24rem)]">
              {isLoading && trimmedQuery.length >= 2 && debouncedQuery === trimmedQuery ? (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Searching…
                </div>
              ) : null}

              {!isLoading && results.length === 0 ? (
                <CommandEmpty>No results for &ldquo;{trimmedQuery}&rdquo;</CommandEmpty>
              ) : null}

              {error ? (
                <div className="px-3 py-4 text-xs text-destructive">{error}</div>
              ) : null}

              {groupedResults.map(({ group, items }) => (
                <CommandGroup key={group} heading={group}>
                  {items.map((result) => {
                    const Icon = RESULT_TYPE_ICONS[result.type] ?? BarChart3
                    return (
                      <CommandItem
                        key={getGlobalSearchResultKey(result)}
                        value={getGlobalSearchResultKey(result)}
                        onMouseDown={(event) => event.preventDefault()}
                        onSelect={() => handleSelect(result.href)}
                        className="items-start gap-2.5 py-2"
                      >
                        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{result.title}</span>
                          {result.subtitle ? (
                            <span className="block truncate text-[0.625rem] text-muted-foreground">
                              {result.subtitle}
                            </span>
                          ) : null}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </div>
      ) : null}
    </div>
  )
}