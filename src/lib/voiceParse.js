function normalize(text) {
  return text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasPhrase(text, phrase) {
  const n = normalize(phrase)
  if (!n) return false
  if (text === n) return true
  return new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(
    text,
  )
}

export function matchHive(transcript, hives = []) {
  const text = normalize(transcript)
  if (!text || !hives.length) return null

  let best = null
  let bestLen = 0

  for (const hive of hives) {
    const keywords = hive.keywords?.length
      ? hive.keywords
      : [hive.name.toLowerCase()]
    for (const keyword of keywords) {
      if (text.includes(keyword) && keyword.length > bestLen) {
        best = hive
        bestLen = keyword.length
      }
    }
  }

  return best
}

export function parseDashboardCommand(transcript, hives = []) {
  const text = normalize(transcript)

  if (
    text === 'exit' ||
    text === 'quit' ||
    text === 'stop' ||
    text === 'done' ||
    text === 'finished' ||
    text === 'finish' ||
    text === 'end' ||
    text.includes('i am done') ||
    text.includes("i'm done") ||
    text.includes('go home')
  ) {
    return { type: 'exit', raw: transcript }
  }

  if (
    text.includes('add hive') ||
    text.includes('create hive') ||
    text.includes('new hive') ||
    text === 'setup' ||
    text.includes('set up')
  ) {
    return { type: 'add_hive', raw: transcript }
  }

  const hive = matchHive(text, hives)

  if (
    text.includes('continue') ||
    text.includes('next hive') ||
    text.includes('next record') ||
    text === 'next'
  ) {
    if (hive) return { type: 'inspect', hive, raw: transcript }
    return { type: 'continue', raw: transcript }
  }

  if (!hive) return { type: 'unknown', raw: transcript }

  if (
    text.includes('detailed') ||
    text.includes('full inspection') ||
    text.includes('detail inspect')
  ) {
    return { type: 'detailed', hive, raw: transcript }
  }
  if (text.includes('inspect') || text.includes('start inspection')) {
    return { type: 'inspect', hive, raw: transcript }
  }
  if (text.includes('history') || text.includes('show history')) {
    return { type: 'history', hive, raw: transcript }
  }

  // Bare hive name (or “hive Alpha”) → start quick inspect
  const keywords = hive.keywords?.length
    ? hive.keywords
    : [hive.name.toLowerCase()]
  const stripped = text
    .replace(/\bhive\b/g, '')
    .replace(/\bplease\b/g, '')
    .trim()
  if (keywords.some((k) => stripped === k || stripped === normalize(hive.name))) {
    return { type: 'inspect', hive, raw: transcript }
  }

  return { type: 'unknown', hive, raw: transcript }
}

/** Spoken prompt after saving an inspection in voice mode. */
export function buildPostSavePrompt(savedHive, hives = []) {
  const name = savedHive?.name || 'that hive'
  if (!hives.length) {
    return `Inspection saved for ${name}. Say exit when you are finished.`
  }

  const next =
    hives.find((h) => h.id !== savedHive?.id) || hives[0]
  const nextName = next?.name || name
  const nextWord = next?.keywords?.[0] || nextName

  if (hives.length === 1) {
    return `Inspection saved for ${name}. Say inspect ${nextWord} to continue, or say exit.`
  }

  return `Inspection saved for ${name}. Say inspect ${nextWord} to continue with the next hive, or say exit when you are done.`
}

/** Reminder when user says continue without a hive name. */
export function buildContinuePrompt(hives = []) {
  if (!hives.length) {
    return 'No hives yet. Create a hive first, or say exit.'
  }
  const first = hives[0]
  const word = first.keywords?.[0] || first.name
  if (hives.length === 1) {
    return `Say inspect ${word} to continue, or say exit.`
  }
  const names = hives
    .slice(0, 3)
    .map((h) => h.keywords?.[0] || h.name)
    .join(', ')
  return `Say inspect and the hive name to continue — for example inspect ${word}. Available: ${names}. Or say exit.`
}

export function parseModeCommand(transcript) {
  const text = normalize(transcript)
  if (
    text === 'typing' ||
    text === 'type' ||
    text === 'keyboard' ||
    text === 'text' ||
    text.includes('typing') ||
    text.includes('type it')
  ) {
    return { type: 'typing' }
  }
  if (
    text === 'voice' ||
    text === 'speak' ||
    text === 'talk' ||
    text.includes('voice') ||
    text.includes('hands free') ||
    text.includes('hands-free')
  ) {
    return { type: 'voice' }
  }
  if (text === 'back' || text === 'cancel' || text === 'home') {
    return { type: 'back' }
  }
  return { type: 'unknown' }
}

function matchChoice(text, step) {
  const candidates = []

  for (const option of step.options) {
    candidates.push({ option, phrase: option })
    const aliases = step.aliases?.[option] ?? []
    for (const alias of aliases) {
      candidates.push({ option, phrase: alias })
    }
  }

  candidates.sort((a, b) => b.phrase.length - a.phrase.length)

  for (const { option, phrase } of candidates) {
    if (hasPhrase(text, phrase)) return option
  }

  return null
}

export function parseWizardCommand(transcript, step) {
  const text = normalize(transcript)

  if (text === 'back' || text === 'go back' || text === 'previous') {
    return { type: 'back' }
  }
  if (text === 'repeat' || text === 'say again' || text === 'read question') {
    return { type: 'repeat' }
  }
  if (text === 'cancel' || text === 'exit' || text === 'quit') {
    return { type: 'cancel' }
  }

  if (text === 'skip') {
    return { type: 'skip' }
  }

  if (
    text === 'next' ||
    text === 'done' ||
    text === 'continue' ||
    text === 'confirm'
  ) {
    return { type: 'next' }
  }

  const isLast = step.id === 'notes'

  if (/\bsave\b/.test(text) && isLast) {
    const spoken = text.replace(/\bsave\b/g, '').trim()
    if (spoken) return { type: 'append_and_save', value: spoken }
    return { type: 'save' }
  }

  if (step.type === 'choice' || step.type === 'qa' || step.type === 'multi') {
    const matched = step.options?.length ? matchChoice(text, step) : null
    if (matched) {
      if (step.type === 'multi') {
        return { type: 'toggle_multi', value: matched }
      }
      const leftover = text.replace(normalize(matched), '').trim()
      if (step.type === 'qa' && leftover && leftover.length > 2) {
        return { type: 'choice', value: transcript.trim() }
      }
      return { type: 'choice', value: matched }
    }
    if ((step.type === 'qa' || step.type === 'multi') && text) {
      return { type: 'append', value: transcript.trim() }
    }
    return { type: 'unknown' }
  }

  if (text === 'skip' || text === 'none' || text === 'nothing') {
    return { type: 'skip' }
  }

  if (
    /\bnext\b/.test(text) ||
    text === 'next' ||
    text === 'done' ||
    text === 'continue'
  ) {
    const spoken = text.replace(/\b(next|done|continue)\b/g, '').trim()
    if (spoken) return { type: 'append_and_next', value: spoken }
    return { type: 'next' }
  }

  if (text) return { type: 'append', value: text }

  return { type: 'unknown' }
}

export function appendTextField(current, addition) {
  const trimmed = addition.trim()
  if (!trimmed) return current
  if (!current) return trimmed
  return `${current} ${trimmed}`
}
