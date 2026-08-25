function normalize(text) {
  return text.toLowerCase().replace(/[.,!?']/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Voice agent name — say this to interrupt / start a command. */
export const AGENT_NAME = 'Beeva'
export const AGENT_WAKE_WORDS = ['beeva', 'beava', 'beva', 'biva', 'viva']
/** End marker — say this after your answer to submit it. */
export const END_WORDS = ['over', 'over and out']

function hasPhrase(text, phrase) {
  const n = normalize(phrase)
  if (!n) return false
  if (text === n) return true
  return new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(
    text,
  )
}

function stripWakeWords(text) {
  let out = text
  for (const word of AGENT_WAKE_WORDS) {
    out = out.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

function stripEndWords(text) {
  let out = text
  // longer phrases first
  const ends = [...END_WORDS].sort((a, b) => b.length - a.length)
  for (const word of ends) {
    out = out.replace(new RegExp(`\\b${word.replace(/\s+/g, '\\s+')}\\b`, 'g'), ' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

function hasWakeWord(text) {
  return AGENT_WAKE_WORDS.some((w) => hasPhrase(text, w))
}

function hasEndWord(text) {
  return END_WORDS.some((w) => hasPhrase(text, w))
}

/** Detect wake word and return any command spoken after it. */
export function detectWakeWord(transcript) {
  const text = normalize(transcript)
  if (!text) return { hit: false, remainder: '' }
  if (!hasWakeWord(text)) return { hit: false, remainder: text }
  return { hit: true, remainder: stripWakeWords(text) }
}

/**
 * Push-to-talk style protocol:
 *   "Beeva cloudy over"  → submit "cloudy"
 *   "Beeva"              → arm / interrupt only
 * Speech without Beeva is ignored. Speech without "over" is not submitted.
 *
 * @param {string} chunk - new speech chunk
 * @param {{ armed: boolean, buffer: string }} state
 */
export function processBeevaProtocol(chunk, state = { armed: false, buffer: '' }) {
  const text = normalize(chunk)
  if (!text) {
    return {
      ...state,
      event: 'ignore',
      command: '',
      display: state.buffer,
    }
  }

  let armed = state.armed
  let buffer = state.buffer || ''

  if (hasWakeWord(text)) {
    armed = true
    // Keep only what comes after the (last) wake word in this chunk
    const afterWake = stripWakeWords(text)
    // Fresh command after a new wake word
    buffer = afterWake
  } else if (armed) {
    buffer = `${buffer} ${text}`.replace(/\s+/g, ' ').trim()
  } else {
    return {
      armed: false,
      buffer: '',
      event: 'ignore',
      command: '',
      display: '',
    }
  }

  if (hasEndWord(buffer) || hasEndWord(text)) {
    const command = stripEndWords(stripWakeWords(buffer))
    return {
      armed: false,
      buffer: '',
      event: 'submit',
      command,
      display: command,
    }
  }

  if (hasWakeWord(text) && !buffer) {
    return {
      armed: true,
      buffer: '',
      event: 'armed',
      command: '',
      display: '',
    }
  }

  return {
    armed: true,
    buffer,
    event: 'listening',
    command: '',
    display: buffer,
  }
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
  const nextWord = next?.keywords?.[0] || next?.name || name

  if (hives.length === 1) {
    return `Inspection saved for ${name}. Say Beeva inspect ${nextWord} over to continue, or Beeva exit over.`
  }

  return `Inspection saved for ${name}. Say Beeva inspect ${nextWord} over for the next hive, or Beeva exit over.`
}

/** Reminder when user says continue without a hive name. */
export function buildContinuePrompt(hives = []) {
  if (!hives.length) {
    return 'No hives yet. Create a hive first, or say exit.'
  }
  const first = hives[0]
  const word = first.keywords?.[0] || first.name
  if (hives.length === 1) {
    return `Say Beeva inspect ${word} over to continue, or Beeva exit over.`
  }
  const names = hives
    .slice(0, 3)
    .map((h) => h.keywords?.[0] || h.name)
    .join(', ')
  return `Say Beeva inspect and the hive name over — for example Beeva inspect ${word} over. Available: ${names}. Or Beeva exit over.`
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

/** Parse speech while creating a hive by voice. */
export function parseCreateHiveCommand(transcript, step) {
  const text = normalize(transcript)

  if (
    text === 'cancel' ||
    text === 'exit' ||
    text === 'quit' ||
    text === 'stop' ||
    text === 'never mind' ||
    text === 'nevermind'
  ) {
    return { type: 'cancel' }
  }

  if (step === 'location') {
    if (
      text === 'skip' ||
      text === 'none' ||
      text === 'no location' ||
      text === 'no' ||
      text === 'nothing'
    ) {
      return { type: 'skip' }
    }
  }

  if (
    text === 'next' ||
    text === 'done' ||
    text === 'confirm' ||
    text === 'yes' ||
    text === 'save'
  ) {
    return { type: 'confirm' }
  }

  if (text === 'repeat' || text === 'say again') {
    return { type: 'repeat' }
  }

  let value = transcript.trim()
  if (step === 'name') {
    value = value
      .replace(
        /^(the\s+)?(hive\s+)?(name\s+is|is\s+called|called|name)\s+/i,
        '',
      )
      .replace(/^it'?s\s+/i, '')
      .trim()
  } else if (step === 'location') {
    value = value
      .replace(/^(the\s+)?(location\s+is|apiary\s+is|yard\s+is)\s+/i, '')
      .replace(/^(at|in|near)\s+/i, '')
      .trim()
  }

  if (!value) return { type: 'unknown' }
  return { type: 'value', value }
}

