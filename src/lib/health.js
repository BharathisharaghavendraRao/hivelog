function includesAny(value, words) {
  const t = (value || '').toLowerCase()
  return words.some((w) => t.includes(w))
}

export function computeHealth(inspection) {
  if (!inspection) return { label: 'Unknown', className: 'stable' }

  const queen =
    inspection.queenLocated ||
    inspection.queenSpotted ||
    inspection.queenSeen ||
    ''
  const queenSeen = includesAny(queen, ['yes', 'spotted', 'seen', 'located'])
  const queenNotSeen = /^(no)\b/i.test(queen.trim()) && !queenSeen
  const disease = includesAny(
    `${inspection.diseaseSigns || ''} ${inspection.diseaseIdentify || ''} ${inspection.diseaseOrPests || ''}`,
    ['afb', 'efb', 'chalk', 'foul', 'varroa', 'yes'],
  )
  const highVarroa =
    includesAny(inspection.varroaLoad, ['high']) ||
    includesAny(inspection.diseaseIdentify, ['varroa'])
  const swarmRisk =
    includesAny(inspection.queenCells, ['swarm']) ||
    includesAny(inspection.swarmingImminent, ['yes']) ||
    includesAny(inspection.queenCellsPresent, ['yes'])
  const honeyLow = includesAny(
    inspection.honeyStores || inspection.honeyNectarLevels,
    ['low', 'poor'],
  )
  const deadExcess = includesAny(inspection.deadBees, ['excessive', 'lots'])
  const weakPop = includesAny(inspection.populationLevel, ['low'])

  if (
    queenSeen &&
    !disease &&
    !highVarroa &&
    !swarmRisk &&
    !honeyLow &&
    !weakPop
  ) {
    return { label: 'Thriving', className: 'thriving' }
  }
  if (
    queenNotSeen ||
    disease ||
    highVarroa ||
    swarmRisk ||
    honeyLow ||
    deadExcess ||
    weakPop
  ) {
    return { label: 'Attention', className: 'attention' }
  }
  return { label: 'Stable', className: 'stable' }
}

export function formatLastSummary(inspection) {
  if (!inspection) return 'No inspections yet'
  const date =
    inspection.inspectionDate ||
    new Date(inspection.date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  const queenRaw =
    inspection.queenLocated ||
    inspection.queenSpotted ||
    inspection.queenSeen ||
    ''
  const queen = includesAny(queenRaw, ['yes', 'spotted', 'seen', 'located'])
    ? 'Queen spotted'
    : /^(no)\b/i.test(queenRaw.trim())
      ? 'Queen not seen'
      : 'Queen unknown'
  const honeyRaw = inspection.honeyStores || inspection.honeyNectarLevels
  const honey = honeyRaw ? `${capitalize(honeyRaw)} honey` : ''
  const kind =
    inspection.inspectionKind === 'detailed' ? 'Detailed' : ''
  return [date, kind, queen, honey].filter(Boolean).join(' · ')
}

export function capitalize(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatStatusLabel(value) {
  if (!value) return '—'
  return capitalize(value)
}
