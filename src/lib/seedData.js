const HIVES_KEY = 'hivelog-hives-v1'
export const STORAGE_KEY = 'hivelog-inspections-v3'

function buildKeywords(name) {
  const text = (name || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return []
  const parts = text.split(' ').filter(Boolean)
  const keywords = new Set([text, ...parts])
  // Drop very short tokens that cause false matches
  return [...keywords].filter((k) => k.length >= 2)
}

export function loadHives() {
  try {
    const raw = localStorage.getItem(HIVES_KEY)
    const saved = raw ? JSON.parse(raw) : []
    if (!Array.isArray(saved)) return []
    return saved
      .map((h) => ({
        ...h,
        keywords: h.keywords?.length ? h.keywords : buildKeywords(h.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export function persistHives(hives) {
  localStorage.setItem(HIVES_KEY, JSON.stringify(hives))
}

export function createHive({ name, location = '' }) {
  const trimmedName = (name || '').trim()
  if (!trimmedName) {
    return { ok: false, message: 'Enter a hive name or ID.' }
  }

  const hives = loadHives()
  const exists = hives.some(
    (h) => h.name.toLowerCase() === trimmedName.toLowerCase(),
  )
  if (exists) {
    return { ok: false, message: `“${trimmedName}” already exists.` }
  }

  const hive = {
    id: crypto.randomUUID(),
    name: trimmedName,
    location: (location || '').trim(),
    keywords: buildKeywords(trimmedName),
    createdAt: new Date().toISOString(),
  }
  const next = [...hives, hive]
  persistHives(next)
  return { ok: true, hive, hives: next }
}

export function deleteHive(hiveId) {
  const hives = loadHives().filter((h) => h.id !== hiveId)
  persistHives(hives)
  return hives
}

export function loadInspections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : []
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

export function persistUserInspections(allInspections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allInspections))
}

export function getHiveById(hives, id) {
  return hives.find((h) => h.id === id) ?? null
}

export function getHiveByName(hives, name) {
  if (!name) return null
  const text = name.toLowerCase()
  return (
    hives.find((h) => h.name.toLowerCase() === text) ||
    hives.find((h) => h.keywords.some((k) => text.includes(k))) ||
    null
  )
}

export function getInspectionsForHive(inspections, hiveId) {
  return inspections
    .filter((r) => r.hiveId === hiveId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function getLastInspectionForHive(inspections, hiveId) {
  const list = getInspectionsForHive(inspections, hiveId)
  return list[0] ?? null
}
