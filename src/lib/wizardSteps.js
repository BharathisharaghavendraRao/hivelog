function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function nowTimeLabel() {
  return new Date().toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Each item is a question the user answers (voice or tap). */
export const WIZARD_STEPS = [
  {
    id: 'weather',
    field: 'weather',
    type: 'qa',
    section: 'Header',
    title: 'Weather',
    question: 'What is the weather today?',
    prompt: 'Answer, or tap an option, then say next.',
    options: ['clear', 'cloudy', 'rain', 'windy'],
    aliases: { clear: ['sunny', 'fine', 'dry'], rain: ['rainy', 'wet'] },
  },
  {
    id: 'temperature',
    field: 'temperature',
    type: 'qa',
    section: 'Header',
    title: 'Temp (°C)',
    question: 'What is the temperature in degrees Celsius?',
    prompt: 'Say the number, then next.',
  },

  {
    id: 'entranceBehavior',
    field: 'entranceBehavior',
    type: 'qa',
    section: '1. Hive Overview & External Activity',
    title: 'Entrance Behavior',
    question: 'Are bees flying actively? Are they bringing in pollen (colors)?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['active with pollen', 'active', 'moderate', 'quiet'],
    aliases: {
      'active with pollen': ['pollen', 'foraging', 'bringing pollen'],
      active: ['busy', 'flying'],
      quiet: ['none', 'still', 'no flying'],
    },
  },
  {
    id: 'temperament',
    field: 'temperament',
    type: 'qa',
    section: '1. Hive Overview & External Activity',
    title: 'Temperament',
    question: 'Are the bees calm, or are they overly defensive / runny on the combs?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['calm', 'defensive', 'runny'],
    aliases: { defensive: ['nervous', 'aggressive', 'hot'], runny: ['running'] },
  },
  {
    id: 'odour',
    field: 'odour',
    type: 'qa',
    section: '1. Hive Overview & External Activity',
    title: 'Odour',
    question: 'Is there a healthy wax/honey smell, or any foul/sour odour?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['healthy', 'foul', 'sour'],
    aliases: { healthy: ['normal', 'wax', 'honey', 'good'], foul: ['rotten', 'bad'] },
  },
  {
    id: 'deadBees',
    field: 'deadBees',
    type: 'qa',
    section: '1. Hive Overview & External Activity',
    title: 'Dead Bees',
    question: 'Excessive dead bees outside the entrance or on the mesh floor?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['none', 'some', 'excessive'],
    aliases: { none: ['no'], excessive: ['lots', 'many', 'yes'] },
  },

  {
    id: 'queenSpotted',
    field: 'queenSpotted',
    type: 'qa',
    section: '2. Queen Status & Brood Pattern',
    title: 'Queen Spotted',
    question: 'Was the queen spotted? If yes, what is the queen colour or marker?',
    prompt: 'Say yes or no, and the marker colour if seen.',
    options: ['yes', 'no'],
    aliases: { yes: ['spotted', 'seen', 'located'] },
  },
  {
    id: 'eggsPresent',
    field: 'eggsPresent',
    type: 'qa',
    section: '2. Queen Status & Brood Pattern',
    title: 'Eggs Present',
    question: 'Are there 1 egg per cell, centred? (Confirms a laying queen in the last 3 days.)',
    prompt: 'Answer yes or no, or add detail.',
    options: ['yes', 'no'],
  },
  {
    id: 'broodPattern',
    field: 'broodPattern',
    type: 'qa',
    section: '2. Queen Status & Brood Pattern',
    title: 'Brood Pattern',
    question: 'Is the brood compact and solid, or spotty and scattered?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['compact and solid', 'spotty and scattered'],
    aliases: {
      'compact and solid': ['solid', 'compact', 'good'],
      'spotty and scattered': ['spotty', 'scattered', 'poor'],
    },
  },
  {
    id: 'broodStages',
    field: 'broodStages',
    type: 'qa',
    section: '2. Queen Status & Brood Pattern',
    title: 'Brood Stages',
    question:
      'Are all stages present? Eggs, unsealed larvae, pearly white larvae, sealed brood.',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['all stages', 'missing stages', 'none'],
    aliases: {
      'all stages': ['all', 'complete', 'yes'],
      'missing stages': ['missing', 'incomplete'],
      none: ['no brood', 'empty'],
    },
  },

  {
    id: 'diseaseSigns',
    field: 'diseaseSigns',
    type: 'qa',
    section: '3. Colony Health & Varroa',
    title: 'Disease Signs',
    question: 'Any signs of AFB/EFB (sunken cappings, ropiness) or chalkbrood?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['none', 'chalkbrood', 'AFB', 'EFB'],
    aliases: {
      none: ['no', 'healthy', 'clear'],
      AFB: ['afb', 'american foulbrood', 'foulbrood'],
      EFB: ['efb', 'european foulbrood'],
      chalkbrood: ['chalk'],
    },
  },
  {
    id: 'adultBeeHealth',
    field: 'adultBeeHealth',
    type: 'qa',
    section: '3. Colony Health & Varroa',
    title: 'Adult Bee Health',
    question: 'Any deformed wings (DWV), crawling bees, or hairless black bees?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['healthy', 'deformed wings', 'crawling', 'hairless'],
    aliases: {
      healthy: ['normal', 'none', 'no', 'good'],
      'deformed wings': ['dwv', 'deformed', 'wings'],
      hairless: ['bald', 'black bees'],
    },
  },
  {
    id: 'varroaLoad',
    field: 'varroaLoad',
    type: 'qa',
    section: '3. Colony Health & Varroa',
    title: 'Varroa Load',
    question:
      'Natural mite drop count on sticky board, or visible mites on bees?',
    prompt: 'Say the count or level, then next.',
    options: ['none', 'low', 'moderate', 'high'],
    aliases: { none: ['no mites', 'zero'] },
  },
  {
    id: 'queenCells',
    field: 'queenCells',
    type: 'qa',
    section: '3. Colony Health & Varroa',
    title: 'Queen Cells',
    question: 'Are there queen cells? Note play cups, supersedure, or swarm cells.',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['none', 'play cups', 'supersedure', 'swarm cells'],
    aliases: {
      none: ['no'],
      'play cups': ['play cup', 'cups'],
      supersedure: ['supercedure', 'replace'],
      'swarm cells': ['swarm', 'swarming'],
    },
  },

  {
    id: 'honeyStores',
    field: 'honeyStores',
    type: 'qa',
    section: '4. Stores & Space Management',
    title: 'Honey Stores',
    question: 'Do they have sufficient sealed honey/cap frames for the season?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['sufficient', 'low'],
    aliases: { sufficient: ['yes', 'full', 'good', 'high'], low: ['no', 'poor'] },
  },
  {
    id: 'pollenStores',
    field: 'pollenStores',
    type: 'qa',
    section: '4. Stores & Space Management',
    title: 'Pollen Stores',
    question: 'Is there adequate pollen packed near the brood nest?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['adequate', 'low'],
    aliases: { adequate: ['yes', 'good', 'high'], low: ['no', 'poor'] },
  },
  {
    id: 'roomToExpand',
    field: 'roomToExpand',
    type: 'qa',
    section: '4. Stores & Space Management',
    title: 'Room to Expand',
    question: 'Do they need another super, or frames with foundation to draw out?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['needs super', 'needs foundation', 'has room'],
    aliases: {
      'needs super': ['super', 'another super'],
      'needs foundation': ['foundation', 'frames'],
      'has room': ['no', 'room', 'enough'],
    },
  },
  {
    id: 'braceComb',
    field: 'braceComb',
    type: 'qa',
    section: '4. Stores & Space Management',
    title: 'Brace Comb',
    question: 'Any wild comb or brace comb that needs clearing?',
    prompt: 'Answer in your own words, or tap an option.',
    options: ['none', 'needs clearing'],
    aliases: {
      none: ['no', 'tidy'],
      'needs clearing': ['yes', 'clearing', 'burr', 'wild comb'],
    },
  },

  {
    id: 'notes',
    field: 'notes',
    type: 'qa',
    section: 'Actions Taken & Notes',
    title: 'Actions Taken & Notes',
    question: 'What actions were taken, and any other notes?',
    prompt: 'Speak freely, then say save or skip.',
  },
]

export function headerDefaults(hive) {
  return {
    inspectionDate: todayLabel(),
    inspectionTime: nowTimeLabel(),
    hiveName: hive?.name ?? '',
    location: hive?.location ?? '',
  }
}

export function emptyForm(hive) {
  const blank = Object.fromEntries(WIZARD_STEPS.map((step) => [step.field, '']))
  return { ...blank, ...headerDefaults(hive) }
}

export function buildConfirmation(step, value) {
  if (value) return `Answer saved. ${step.title}: ${value}.`
  return `${step.title} skipped.`
}

export function capitalize(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function buildQuestionSpeech(step, stepIndex, steps = WIZARD_STEPS) {
  const num = stepIndex + 1
  const suggestions =
    step.type === 'multi'
      ? ` Select all that apply: ${(step.options || []).join(', ')}. Then say next.`
      : step.options?.length
        ? ` You can say ${step.options.join(', ')}, or answer in your own words then say next.`
        : ' Answer in your own words, then say next.'
  return `Question ${num} of ${steps.length}. ${step.section}. ${step.title}. ${step.question}${suggestions}`
}
