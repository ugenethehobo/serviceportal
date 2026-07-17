/**
 * Company-customizable field-team wording.
 * Admins set a plural label (default "Crews"); singular is derived for UI copy.
 */

export const DEFAULT_CREW_LABEL = 'Crews'
export const DEFAULT_CREW_LABEL_SINGULAR = 'Crew'
export const SOLO_CREW_NAV_LABEL = 'Team'

/** Max length for the stored/custom plural label. */
export const CREW_LABEL_MAX_LENGTH = 32

export type CrewTerminology = {
  /** Plural form used for nav, page titles, section names (e.g. "Crews", "Teams"). */
  plural: string
  /** Singular form for create/edit copy (e.g. "Crew", "Team"). */
  singular: string
  /** Lowercase plural for mid-sentence use. */
  pluralLower: string
  /** Lowercase singular for mid-sentence use. */
  singularLower: string
}

/**
 * Normalize a company-stored crew label. Empty/null → default "Crews".
 * Trims, collapses whitespace, strips control chars, caps length.
 */
export function normalizeCrewLabel(raw: string | null | undefined): string {
  if (raw == null) return DEFAULT_CREW_LABEL
  const cleaned = String(raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!cleaned) return DEFAULT_CREW_LABEL
  return cleaned.slice(0, CREW_LABEL_MAX_LENGTH)
}

/**
 * Derive a reasonable singular from a plural label.
 * Crews → Crew, Teams → Team, People → People, Units → Unit.
 */
export function deriveCrewLabelSingular(plural: string): string {
  const label = normalizeCrewLabel(plural)
  if (label === DEFAULT_CREW_LABEL) return DEFAULT_CREW_LABEL_SINGULAR

  if (/ies$/i.test(label) && label.length > 3) {
    return label.slice(0, -3) + (label.endsWith('IES') ? 'Y' : 'y')
  }
  if (/(ses|xes|zes|ches|shes)$/i.test(label) && label.length > 3) {
    return label.slice(0, -2)
  }
  if (/s$/i.test(label) && !/ss$/i.test(label) && label.length > 1) {
    return label.slice(0, -1)
  }
  return label
}

export function getCrewTerminology(
  rawLabel?: string | null
): CrewTerminology {
  const plural = normalizeCrewLabel(rawLabel)
  const singular = deriveCrewLabelSingular(plural)
  return {
    plural,
    singular,
    pluralLower: plural.toLowerCase(),
    singularLower: singular.toLowerCase(),
  }
}

/**
 * Sidebar / page title for the crews workspace.
 * Solo businesses keep a fixed "Team" label (not multi-crew terminology).
 */
export function getCrewsNavLabel(
  isSoloBusinessMode: boolean,
  rawLabel?: string | null
): string {
  if (isSoloBusinessMode) return SOLO_CREW_NAV_LABEL
  return normalizeCrewLabel(rawLabel)
}

export function getActiveCrewsHeading(
  isSoloBusinessMode: boolean,
  rawLabel?: string | null
): string {
  if (isSoloBusinessMode) return "Today's Schedule"
  const { plural } = getCrewTerminology(rawLabel)
  return `Active ${plural} Today`
}

/** Global search result group for crew + team member hits. */
export function getCrewsSearchGroupLabel(
  isSoloBusinessMode: boolean,
  rawLabel?: string | null
): string {
  if (isSoloBusinessMode) return 'Team'
  return normalizeCrewLabel(rawLabel)
}
