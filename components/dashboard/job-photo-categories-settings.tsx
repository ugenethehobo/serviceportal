'use client'

import { useCallback, useEffect, useState } from 'react'
import { getJobPhotoCategoriesAction, updateJobPhotoCategoriesAction } from '@/app/action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_JOB_PHOTO_CATEGORIES } from '@/lib/job-photo-categories'
import { toast } from 'sonner'
import { Camera, Plus, Trash2 } from 'lucide-react'

export function JobPhotoCategoriesSettings() {
  const [categories, setCategories] = useState<string[]>([...DEFAULT_JOB_PHOTO_CATEGORIES])
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
    setIsSaving(true)
    const result = await updateJobPhotoCategoriesAction(categories)
    if (result.success) {
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
    if (categories.length <= 1) {
      toast.error('Keep at least one category')
      return
    }
    setCategories((current) => current.filter((_, entryIndex) => entryIndex !== index))
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading photo categories…</p>
  }

  return (
    <section className="rounded-lg border bg-card/50 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2 shrink-0">
          <Camera className="size-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">Job photo categories</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Customize the categories team members choose when uploading job site photos.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Categories</Label>
        <ul className="space-y-2">
          {categories.map((category, index) => (
            <li key={`${category}-${index}`} className="flex items-center gap-2">
              <Input value={category} readOnly className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(index)}
                disabled={categories.length <= 1}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

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
    </section>
  )
}