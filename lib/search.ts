export function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase()
}

export function matchesSearch(
  query: string,
  ...fields: (string | number | null | undefined)[]
) {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return true

  return fields.some((field) => {
    if (field == null) return false
    return String(field).toLowerCase().includes(normalized)
  })
}