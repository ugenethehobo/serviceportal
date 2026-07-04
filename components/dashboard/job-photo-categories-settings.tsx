'use client'

import { useCallback, useEffect, useState } from 'react'
import { getJobPhotoCategoriesAction, updateJobPhotoCategoriesAction } from '@/app/action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Camera, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

function moveCategory(list: string[], index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= list.length) return list

  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(targetIndex, 0, item)
  return next
}

interface JobPhotoCategoriesSettingsProps {
  embedded?: boolean
  onSaved?: (categories: string[]) => void
}

export function JobPhotoCategoriesSettings({
  embedded = false,
  onSaved,
}: JobPhotoCategoriesSettingsProps = {}) {
  const [categories, setCategories] = useState<string[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadCategories = useCallback(async () => {
    const result = await getJobPhotoCategoriesAction()
    if (result.success) {
      setCategories(result.categories)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const handleSave = async () => {
    const trimmed = categories.map((category) => category.trim()).filter(Boolean)

    const seen = new Set<string>()
    for (const category of trimmed) {
      const key = category.toLowerCase()
      if (seen.has(key)) {
        toast.error('Each category name must be unique')
        return
      }
      seen.add(key)
    }

    setIsSaving(true)
    const result = await updateJobPhotoCategoriesAction(trimmed)
    if (result.success) {
      setCategories(trimmed)
      onSaved?.(trimmed)
      toast.success('Photo categories saved')
    } else {
      toast.error(result.error || 'Failed to save categories')
    }
    setIsSaving(false)
  }

  const handleAdd = () => {
    const trimmed = newCategory.trim()
    if (!trimmed) return
    if (categories.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('That category already exists')
      return
    }
    setCategories((current) => [...current, trimmed])
    setNewCategory('')
  }

  const handleRemove = (index: number) => {
    setCategories((current) => current.filter((_, entryIndex) => entryIndex !== index))
  }

  const handleRename = (index: number, value: string) => {
    setCategories((current) =>
      current.map((category, entryIndex) => (entryIndex === index ? value : category))
    )
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading photo categories…</p>
  }

  const content = (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2 shrink-0">
          <Camera className="size-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">Job photo categories</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create and organize the categories used when uploading job site photos. Order here is
            the order shown on mobile.
          </p>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No categories yet. Add your first category below — uploads won&apos;t require a category
            until you save at least one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Categories</Label>
          <ul className="space-y-2">
            {categories.map((category, index) => (
              <li key={`category-${index}`} className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move category up"
                    onClick={() => setCategories((current) => moveCategory(current, index, -1))}
                    disabled={index === 0}
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move category down"
                    onClick={() => setCategories((current) => moveCategory(current, index, 1))}
                    disabled={index === categories.length - 1}
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>
                <Input
                  value={category}
                  onChange={(event) => handleRename(index, event.target.value)}
                  className="flex-1"
                  aria-label={`Category ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove category"
                  onClick={() => handleRemove(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={newCategory}
          onChange={(event) => setNewCategory(event.target.value)}
          placeholder="New category name"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleAdd()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={handleAdd}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <Button type="button" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save categories'}
      </Button>
    </div>
  )

  if (embedded) return content

  return (
    <section className="rounded-lg border bg-card/50 p-4">{content}</section>
  )
}