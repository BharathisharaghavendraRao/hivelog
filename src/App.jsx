import { useCallback, useEffect, useRef, useState } from 'react'
import { computeHealth, formatLastSummary, formatStatusLabel } from './lib/health'
import {
  createHive,
  deleteHive,
  getHiveById,
  getHiveByName,
  getInspectionsForHive,
  getLastInspectionForHive,
  loadHives,
  loadInspections,
  persistUserInspections,
} from './lib/seedData'
import {
  appendTextField,
  parseDashboardCommand,
  buildPostSavePrompt,
  buildContinuePrompt,
  parseModeCommand,
  parseWizardCommand,
} from './lib/voiceParse'
import {
  buildConfirmation,
  buildQuestionSpeech,
  emptyForm,
  WIZARD_STEPS,
} from './lib/wizardSteps'
import {
  buildDetailedConfirmation,
  buildDetailedQuestionSpeech,
  DETAILED_HISTORY_SECTIONS,
  DETAILED_WIZARD_STEPS,
  emptyDetailedForm,
} from './lib/detailedWizardSteps'
import {
  downloadHistoryPdf,
  downloadRecordPdf,
} from './lib/exportHistoryPdf'
import { loadSession, login as authLogin, logout as authLogout } from './lib/auth'
import './App.css'

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function capitalize(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function App() {
  const Recognition = getRecognitionCtor()
  const sttSupported = Boolean(Recognition)

  const [session, setSession] = useState(() => loadSession())
  const [view, setView] = useState('home')
  const [inputMode, setInputMode] = useState(null) // 'voice' | 'typing' | null
  const [hives, setHives] = useState(() => loadHives())
  const [inspections, setInspections] = useState(() => loadInspections())
  const [selectedHiveId, setSelectedHiveId] = useState(null)
  const [wizardStep, setWizardStep] = useState(0)
  const [form, setForm] = useState(emptyForm())
  const [showCreateHive, setShowCreateHive] = useState(false)
  const [inspectionKind, setInspectionKind] = useState('standard') // 'standard' | 'detailed'
  const [editingRecordId, setEditingRecordId] = useState(null)
  const [interim, setInterim] = useState('')
  const [lastHeard, setLastHeard] = useState('')
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [micError, setMicError] = useState(null)
  const [micOn, setMicOn] = useState(false)

  const stepRef = useRef(0)
  const formRef = useRef(emptyForm())
  const selectedHiveRef = useRef(null)
  const hivesRef = useRef(hives)
  const inspectionKindRef = useRef('standard')
  const editingRecordIdRef = useRef(null)
  const onFinalRef = useRef(() => {})
  const recRef = useRef(null)
  const shouldListenRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const viewRef = useRef('home')
  const inputModeRef = useRef(null)
  const restartTimerRef = useRef(null)

  const getActiveSteps = useCallback(
    () =>
      inspectionKindRef.current === 'detailed'
        ? DETAILED_WIZARD_STEPS
        : WIZARD_STEPS,
    [],
  )

  useEffect(() => {
    stepRef.current = wizardStep
  }, [wizardStep])

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    selectedHiveRef.current = selectedHiveId
  }, [selectedHiveId])

  useEffect(() => {
    hivesRef.current = hives
  }, [hives])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    inspectionKindRef.current = inspectionKind
  }, [inspectionKind])

  useEffect(() => {
    editingRecordIdRef.current = editingRecordId
  }, [editingRecordId])

  useEffect(() => {
    inputModeRef.current = inputMode
  }, [inputMode])

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }

  const scheduleRestart = useCallback(
    (delay) => {
      clearRestartTimer()
      restartTimerRef.current = setTimeout(() => {
        if (!shouldListenRef.current || isSpeakingRef.current || !Recognition) return
        try {
          recRef.current?.start()
        } catch {
          /* already running */
        }
      }, delay)
    },
    [Recognition],
  )

  const stopRecognition = useCallback(() => {
    clearRestartTimer()
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    setListening(false)
  }, [])

  const startRecognition = useCallback(() => {
    if (!Recognition || !shouldListenRef.current) return

    stopRecognition()

    const recognition = new Recognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)

    recognition.onend = () => {
      setListening(false)
      if (shouldListenRef.current && !isSpeakingRef.current) {
        scheduleRestart(300)
      }
    }

    recognition.onerror = (event) => {
      const code = event.error
      if (code === 'no-speech' || code === 'aborted') return
      const message =
        code === 'not-allowed'
          ? 'Microphone permission denied.'
          : `Speech error: ${code}`
      setMicError(message)
      if (code === 'not-allowed') {
        shouldListenRef.current = false
        setMicOn(false)
        setListening(false)
      }
    }

    recognition.onresult = (event) => {
      let interimText = ''
      let finalText = ''

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const piece = result[0]?.transcript ?? ''
        if (result.isFinal) finalText += piece
        else interimText += piece
      }

      if (interimText) setInterim(interimText.trim())
      if (finalText) {
        const cleaned = finalText.trim()
        setInterim('')
        setLastHeard(cleaned)
        onFinalRef.current(cleaned)
      }
    }

    recRef.current = recognition
    try {
      recognition.start()
    } catch {
      scheduleRestart(300)
    }
  }, [Recognition, scheduleRestart, stopRecognition])

  const speak = useCallback(
    (text, { force = false } = {}) => {
      if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
        return Promise.resolve()
      }
      // Typing mode stays quiet unless forced
      if (!force && inputModeRef.current === 'typing') {
        return Promise.resolve()
      }

      return new Promise((resolve) => {
        stopRecognition()
        isSpeakingRef.current = true
        setSpeaking(true)

        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'en-US'
        utterance.rate = 1

        utterance.onend = () => {
          isSpeakingRef.current = false
          setSpeaking(false)
          if (shouldListenRef.current) {
            scheduleRestart(250)
          }
          resolve()
        }

        utterance.onerror = () => {
          isSpeakingRef.current = false
          setSpeaking(false)
          if (shouldListenRef.current) {
            scheduleRestart(250)
          }
          resolve()
        }

        window.speechSynthesis.resume()
        window.speechSynthesis.speak(utterance)
      })
    },
    [scheduleRestart, stopRecognition],
  )

  const enableListening = useCallback(() => {
    shouldListenRef.current = true
    setMicOn(true)
    startRecognition()
  }, [startRecognition])

  const disableListening = useCallback(() => {
    shouldListenRef.current = false
    setMicOn(false)
    stopRecognition()
    window.speechSynthesis?.cancel()
    isSpeakingRef.current = false
    setSpeaking(false)
  }, [stopRecognition])

  const updateFormField = useCallback((field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      formRef.current = next
      return next
    })
  }, [])

  const resetToDashboard = useCallback(() => {
    setView('dashboard')
    setWizardStep(0)
    setEditingRecordId(null)
    editingRecordIdRef.current = null
    setForm(emptyForm())
    formRef.current = emptyForm()
  }, [])

  const returnToHistory = useCallback(() => {
    setView('history')
    setWizardStep(0)
    setEditingRecordId(null)
    editingRecordIdRef.current = null
    setForm(emptyForm())
    formRef.current = emptyForm()
  }, [])

  const goToHome = useCallback(() => {
    setView('home')
    setWizardStep(0)
    setInputMode(null)
    inputModeRef.current = null
    setSelectedHiveId(null)
    selectedHiveRef.current = null
    setEditingRecordId(null)
    editingRecordIdRef.current = null
    setForm(emptyForm())
    formRef.current = emptyForm()
    setInterim('')
    setLastHeard('')
  }, [])

  const finishInspection = useCallback(async () => {
    const formData = formRef.current
    const currentHives = hivesRef.current
    const matched =
      getHiveByName(currentHives, formData.hiveName) ||
      getHiveById(currentHives, selectedHiveRef.current)
    const hiveId = matched?.id || selectedHiveRef.current
    const hive = getHiveById(currentHives, hiveId)
    const wasEditing = Boolean(editingRecordIdRef.current)
    const editId = editingRecordIdRef.current

    setInspections((prev) => {
      let next
      if (wasEditing) {
        next = prev.map((r) =>
          r.id === editId
            ? {
                ...r,
                ...formData,
                id: editId,
                hiveId: r.hiveId || hiveId,
                date: r.date,
                updatedAt: new Date().toISOString(),
                hiveName: formData.hiveName || hive?.name || r.hiveName || '',
                location:
                  formData.location || hive?.location || r.location || '',
                inputMode: inputModeRef.current,
                inspectionKind:
                  inspectionKindRef.current || r.inspectionKind || 'standard',
              }
            : r,
        )
      } else {
        const record = {
          id: crypto.randomUUID(),
          hiveId,
          date: new Date().toISOString(),
          ...formData,
          hiveName: formData.hiveName || hive?.name || '',
          location: formData.location || hive?.location || '',
          inputMode: inputModeRef.current,
          inspectionKind: inspectionKindRef.current,
        }
        next = [record, ...prev]
      }
      persistUserInspections(next)
      return next
    })

    const wasVoice = inputModeRef.current === 'voice'
    if (wasEditing) {
      returnToHistory()
    } else {
      resetToDashboard()
    }

    if (wasVoice) {
      enableListening()
      if (wasEditing) {
        await speak(
          hive
            ? `Inspection updated for ${hive.name}.`
            : 'Inspection updated.',
          { force: true },
        )
      } else {
        await speak(buildPostSavePrompt(hive, currentHives), { force: true })
      }
    } else {
      disableListening()
    }
  }, [
    disableListening,
    enableListening,
    resetToDashboard,
    returnToHistory,
    speak,
  ])

  const cancelWizard = useCallback(async () => {
    const wasVoice = inputModeRef.current === 'voice'
    const wasEditing = Boolean(editingRecordIdRef.current)
    if (wasEditing) {
      returnToHistory()
    } else {
      resetToDashboard()
    }
    if (wasVoice) {
      enableListening()
      await speak(
        wasEditing ? 'Edit cancelled.' : 'Inspection cancelled.',
        { force: true },
      )
    } else {
      disableListening()
    }
  }, [
    disableListening,
    enableListening,
    resetToDashboard,
    returnToHistory,
    speak,
  ])

  const readCurrentQuestion = useCallback(async () => {
    const steps = getActiveSteps()
    const step = steps[stepRef.current]
    if (!step) return
    const speech =
      inspectionKindRef.current === 'detailed'
        ? buildDetailedQuestionSpeech(step, stepRef.current)
        : buildQuestionSpeech(step, stepRef.current, steps)
    await speak(speech)
  }, [getActiveSteps, speak])

  const goToStep = useCallback(
    async (index, confirmation) => {
      if (confirmation) await speak(confirmation)
      setWizardStep(index)
      stepRef.current = index
      const steps = getActiveSteps()
      const step = steps[index]
      if (step && inputModeRef.current === 'voice') {
        const speech =
          inspectionKindRef.current === 'detailed'
            ? buildDetailedQuestionSpeech(step, index)
            : buildQuestionSpeech(step, index, steps)
        await speak(speech)
      }
    },
    [getActiveSteps, speak],
  )

  const advanceFromStep = useCallback(
    async (fieldValue, confirmationText) => {
      const steps = getActiveSteps()
      const step = steps[stepRef.current]
      if (step) {
        const value = fieldValue ?? formRef.current[step.field]
        updateFormField(step.field, value)

        if (step.field === 'hiveName' && value) {
          const hive = getHiveByName(hivesRef.current, value)
          if (hive) {
            selectedHiveRef.current = hive.id
            setSelectedHiveId(hive.id)
            updateFormField('location', hive.location)
            updateFormField('yard', hive.location)
          }
        }
      }

      const nextIndex = stepRef.current + 1
      if (nextIndex >= steps.length) {
        await speak(confirmationText || 'Saving inspection.')
        await finishInspection()
        return
      }

      await goToStep(nextIndex, confirmationText)
    },
    [finishInspection, getActiveSteps, goToStep, updateFormField],
  )

  const chooseHomeMode = useCallback(
    async (mode) => {
      setInputMode(mode)
      inputModeRef.current = mode
      setView('dashboard')

      if (mode === 'typing') {
        disableListening()
        return
      }

      enableListening()
      await speak(
        'Voice mode selected. Say inspect followed by a hive name. After you save, say inspect again for the next hive, or say exit.',
        { force: true },
      )
    },
    [disableListening, enableListening, speak],
  )

  const startWizard = useCallback(
    async (hive, kind = 'standard') => {
      const mode = inputModeRef.current
      if (!mode) {
        setView('home')
        return
      }

      setEditingRecordId(null)
      editingRecordIdRef.current = null
      setInspectionKind(kind)
      inspectionKindRef.current = kind

      const initial =
        kind === 'detailed' ? emptyDetailedForm(hive) : emptyForm(hive)
      setSelectedHiveId(hive.id)
      selectedHiveRef.current = hive.id
      setWizardStep(0)
      stepRef.current = 0
      setForm(initial)
      formRef.current = initial
      setView('wizard')

      const steps =
        kind === 'detailed' ? DETAILED_WIZARD_STEPS : WIZARD_STEPS

      if (mode === 'typing') {
        disableListening()
        return
      }

      enableListening()
      const intro =
        kind === 'detailed'
          ? `Starting detailed inspection for ${hive.name}. Fifty-seven questions.`
          : `Starting the quick inspection checklist for ${hive.name}.`
      await speak(intro, { force: true })
      const speech =
        kind === 'detailed'
          ? buildDetailedQuestionSpeech(steps[0], 0)
          : buildQuestionSpeech(steps[0], 0, steps)
      await speak(speech, { force: true })
    },
    [disableListening, enableListening, speak],
  )

  const startEditRecord = useCallback(
    async (hive, record) => {
      let mode = inputModeRef.current
      if (!mode) {
        mode = 'typing'
        setInputMode('typing')
        inputModeRef.current = 'typing'
      }

      const kind =
        record.inspectionKind === 'detailed' ? 'detailed' : 'standard'
      setInspectionKind(kind)
      inspectionKindRef.current = kind
      setEditingRecordId(record.id)
      editingRecordIdRef.current = record.id

      const base =
        kind === 'detailed' ? emptyDetailedForm(hive) : emptyForm(hive)
      const initial = {
        ...base,
        ...record,
        hiveName: record.hiveName || hive?.name || '',
        location: record.location || hive?.location || '',
        yard: record.yard || record.location || hive?.location || '',
      }

      setSelectedHiveId(hive.id)
      selectedHiveRef.current = hive.id
      setWizardStep(0)
      stepRef.current = 0
      setForm(initial)
      formRef.current = initial
      setView('wizard')

      const steps =
        kind === 'detailed' ? DETAILED_WIZARD_STEPS : WIZARD_STEPS

      if (mode === 'typing') {
        disableListening()
        return
      }

      enableListening()
      await speak(
        `Editing ${kind === 'detailed' ? 'detailed' : 'quick'} inspection for ${hive.name}.`,
        { force: true },
      )
      const speech =
        kind === 'detailed'
          ? buildDetailedQuestionSpeech(steps[0], 0)
          : buildQuestionSpeech(steps[0], 0, steps)
      await speak(speech, { force: true })
    },
    [disableListening, enableListening, speak],
  )

  const openHistory = useCallback(
    async (hive) => {
      setSelectedHiveId(hive.id)
      selectedHiveRef.current = hive.id
      setView('history')
      const count = getInspectionsForHive(inspections, hive.id).length
      await speak(
        `History for ${hive.name}. ${count} inspection${count === 1 ? '' : 's'}. Say back to return home.`,
      )
    },
    [inspections, speak],
  )

  const handleHomeFinal = useCallback(
    async (transcript) => {
      const cmd = parseModeCommand(transcript)
      if (cmd.type === 'typing' || cmd.type === 'voice') {
        await chooseHomeMode(cmd.type)
      }
    },
    [chooseHomeMode],
  )

  const handleAddHive = useCallback(
    async ({ name, location }) => {
      const result = createHive({ name, location })
      if (!result.ok) {
        if (inputModeRef.current === 'voice') {
          await speak(result.message, { force: true })
        }
        return result
      }
      setHives(result.hives)
      hivesRef.current = result.hives
      setShowCreateHive(false)
      if (inputModeRef.current === 'voice') {
        await speak(
          `Hive ${result.hive.name} created. You can now inspect it.`,
          { force: true },
        )
      }
      return result
    },
    [speak],
  )

  const handleDeleteHive = useCallback(
    async (hiveId) => {
      const hive = getHiveById(hivesRef.current, hiveId)
      const next = deleteHive(hiveId)
      setHives(next)
      hivesRef.current = next
      setInspections((prev) => {
        const filtered = prev.filter((r) => r.hiveId !== hiveId)
        persistUserInspections(filtered)
        return filtered
      })
      if (inputModeRef.current === 'voice' && hive) {
        await speak(`Removed ${hive.name}.`, { force: true })
      }
    },
    [speak],
  )

  const handleDashboardFinal = useCallback(
    async (transcript) => {
      if (inputModeRef.current !== 'voice') return
      const cmd = parseDashboardCommand(transcript, hivesRef.current)
      if (cmd.type === 'exit') {
        goToHome()
        disableListening()
        await speak('Session ended. Back to home.', { force: true })
      } else if (cmd.type === 'continue') {
        await speak(buildContinuePrompt(hivesRef.current), { force: true })
      } else if (cmd.type === 'add_hive') {
        setShowCreateHive(true)
        await speak(
          'Open the create hive form. Enter the hive name and location, then save.',
          { force: true },
        )
      } else if (cmd.type === 'detailed' && cmd.hive) {
        await startWizard(cmd.hive, 'detailed')
      } else if (cmd.type === 'inspect' && cmd.hive) {
        await startWizard(cmd.hive, 'standard')
      } else if (cmd.type === 'history' && cmd.hive) {
        await openHistory(cmd.hive)
      } else if (!hivesRef.current.length) {
        await speak(
          'No hives yet. Create a hive first before you can inspect.',
          { force: true },
        )
      } else {
        await speak(
          buildContinuePrompt(hivesRef.current),
          { force: true },
        )
      }
    },
    [
      disableListening,
      goToHome,
      openHistory,
      speak,
      startWizard,
    ],
  )

  const handleWizardFinal = useCallback(
    async (transcript) => {
      if (inputModeRef.current === 'typing') return

      const steps = getActiveSteps()
      const step = steps[stepRef.current]
      if (!step) return

      const cmd = parseWizardCommand(transcript, step)
      const confirmFn =
        inspectionKindRef.current === 'detailed'
          ? buildDetailedConfirmation
          : buildConfirmation
      const isLast = stepRef.current === steps.length - 1

      switch (cmd.type) {
        case 'back': {
          if (stepRef.current > 0) {
            await goToStep(stepRef.current - 1)
          } else {
            await speak('This is the first step.')
          }
          break
        }
        case 'repeat': {
          await readCurrentQuestion()
          break
        }
        case 'cancel': {
          await cancelWizard()
          break
        }
        case 'save':
        case 'append_and_save': {
          if (isLast) {
            if (cmd.type === 'append_and_save') {
              updateFormField(
                step.field,
                appendTextField(formRef.current[step.field], cmd.value),
              )
            }
            await speak('Saving inspection.')
            await finishInspection()
          } else {
            await speak(
              'Say save on the final question, or say next to continue.',
            )
          }
          break
        }
        case 'append_and_next': {
          const merged = appendTextField(formRef.current[step.field], cmd.value)
          updateFormField(step.field, merged)
          await advanceFromStep(merged, confirmFn(step, merged))
          break
        }
        case 'toggle_multi': {
          const current = formRef.current[step.field] || ''
          const parts = current
            ? current.split(',').map((p) => p.trim()).filter(Boolean)
            : []
          const next = parts.includes(cmd.value)
            ? parts.filter((p) => p !== cmd.value)
            : [...parts, cmd.value]
          updateFormField(step.field, next.join(', '))
          break
        }
        case 'choice': {
          if (step.type === 'multi') break
          const confirmation = confirmFn(step, cmd.value)
          await advanceFromStep(cmd.value, confirmation)
          break
        }
        case 'skip': {
          await advanceFromStep('', 'Skipped.')
          break
        }
        case 'next': {
          const confirmation = confirmFn(step, formRef.current[step.field])
          await advanceFromStep(formRef.current[step.field], confirmation)
          break
        }
        case 'append': {
          const merged = appendTextField(formRef.current[step.field], cmd.value)
          updateFormField(step.field, merged)
          break
        }
        default:
          break
      }
    },
    [
      advanceFromStep,
      cancelWizard,
      finishInspection,
      getActiveSteps,
      goToStep,
      readCurrentQuestion,
      speak,
      updateFormField,
    ],
  )

  const handleHistoryFinal = useCallback(
    async (transcript) => {
      const text = transcript.toLowerCase().trim()
      if (text === 'back' || text === 'home' || text === 'go back') {
        resetToDashboard()
        enableListening()
        await speak('Back to dashboard.', { force: true })
      }
    },
    [enableListening, resetToDashboard, speak],
  )

  useEffect(() => {
    if (view === 'home') {
      onFinalRef.current = handleHomeFinal
    } else if (view === 'dashboard') {
      onFinalRef.current = handleDashboardFinal
    } else if (view === 'wizard') {
      onFinalRef.current = handleWizardFinal
    } else if (view === 'history') {
      onFinalRef.current = handleHistoryFinal
    }
  }, [
    view,
    handleHomeFinal,
    handleDashboardFinal,
    handleWizardFinal,
    handleHistoryFinal,
  ])

  useEffect(() => {
    if (!sttSupported || !session) {
      disableListening()
      return
    }
    const timer = setTimeout(() => {
      if (viewRef.current === 'home') {
        enableListening()
        return
      }
      if (inputModeRef.current === 'typing') {
        disableListening()
        return
      }
      if (inputModeRef.current === 'voice') {
        enableListening()
      }
    }, 600)
    return () => {
      clearTimeout(timer)
      shouldListenRef.current = false
      clearRestartTimer()
      stopRecognition()
      window.speechSynthesis?.cancel()
    }
  }, [
    session,
    sttSupported,
    enableListening,
    disableListening,
    stopRecognition,
  ])

  const toggleMic = () => {
    if (!sttSupported) return
    if (inputMode === 'typing' && view !== 'home') return
    if (micOn) {
      disableListening()
    } else {
      enableListening()
      setMicError(null)
    }
  }

  const goHome = async () => {
    const wasVoice = inputMode === 'voice'
    goToHome()
    if (sttSupported) enableListening()
    else disableListening()
    if (wasVoice) {
      await speak('Back to home. Choose typing or voice.', { force: true })
    }
  }

  const handleLogin = useCallback((username, password) => {
    const result = authLogin(username, password)
    if (!result.ok) return result
    setSession(result.session)
    setView('home')
    return result
  }, [])

  const handleLogout = useCallback(() => {
    disableListening()
    authLogout()
    setSession(null)
    setView('home')
    setInputMode(null)
    inputModeRef.current = null
    setSelectedHiveId(null)
    selectedHiveRef.current = null
    setEditingRecordId(null)
    editingRecordIdRef.current = null
    setForm(emptyForm())
    formRef.current = emptyForm()
    setShowCreateHive(false)
    setInterim('')
    setLastHeard('')
    setMicError(null)
  }, [disableListening])

  const handleChoiceTap = (option) => {
    const steps = getActiveSteps()
    const step = steps[wizardStep]
    if (!step) return
    if (step.type === 'multi') {
      const current = formRef.current[step.field] || ''
      const parts = current
        ? current.split(',').map((p) => p.trim()).filter(Boolean)
        : []
      const next = parts.includes(option)
        ? parts.filter((p) => p !== option)
        : [...parts, option]
      updateFormField(step.field, next.join(', '))
      return
    }
    updateFormField(step.field, option)
  }

  const handleAnswerChange = (value) => {
    const steps = getActiveSteps()
    const step = steps[wizardStep]
    if (!step) return
    updateFormField(step.field, value)
  }

  const handleNext = async () => {
    const steps = getActiveSteps()
    const step = steps[wizardStep]
    if (!step) return
    const value = formRef.current[step.field]
    const confirmFn =
      inspectionKindRef.current === 'detailed'
        ? buildDetailedConfirmation
        : buildConfirmation
    if (wizardStep === steps.length - 1) {
      await speak(
        editingRecordIdRef.current
          ? 'Updating inspection.'
          : 'Saving inspection.',
      )
      await finishInspection()
      return
    }
    await advanceFromStep(value, confirmFn(step, value))
  }

  const handleSkip = async () => {
    const steps = getActiveSteps()
    updateFormField(steps[wizardStep]?.field, '')
    await advanceFromStep('', 'Skipped.')
  }

  const handleBack = async () => {
    if (wizardStep > 0) {
      await goToStep(wizardStep - 1)
    } else if (inputMode === 'voice') {
      await speak('This is the first question.')
    }
  }

  const showVoiceChrome =
    Boolean(session) &&
    (view === 'home' ||
      (inputMode === 'voice' &&
        (view === 'dashboard' || view === 'wizard' || view === 'history')))
  const micLabel = !micOn ? 'Mic off' : speaking ? 'Speaking' : listening ? 'Listening' : 'Ready'
  const micClass = !micOn ? 'off' : speaking ? 'speaking' : listening ? 'listening' : 'idle'

  if (!session) {
    return (
      <div className="app">
        <LoginScreen onLogin={handleLogin} />
      </div>
    )
  }

  return (
    <div className="app">
      <Header
        view={view}
        inputMode={inputMode}
        session={session}
        micLabel={micLabel}
        micClass={micClass}
        onToggleMic={toggleMic}
        onHome={goHome}
        onLogout={handleLogout}
        sttSupported={sttSupported}
        micDisabled={!sttSupported || (inputMode === 'typing' && view !== 'home')}
      />

      {!sttSupported && view === 'home' && (
        <div className="banner warn">
          Speech recognition needs Chrome or Edge. You can still choose Typing.
        </div>
      )}

      {micError && showVoiceChrome && <div className="banner error">{micError}</div>}

      {showVoiceChrome && view !== 'home' && (
        <Waveform active={listening && micOn && !speaking} />
      )}

      {showVoiceChrome && view !== 'home' && (interim || lastHeard) && (
        <div className="transcript-pill" aria-live="polite">
          {interim ? (
            <>
              <span className="pill-label">Hearing</span>
              {interim}
            </>
          ) : (
            <>
              <span className="pill-label">Heard</span>
              {lastHeard}
            </>
          )}
        </div>
      )}

      {view === 'home' && (
        <HomeScreen onChoose={chooseHomeMode} sttSupported={sttSupported} />
      )}

      {view === 'dashboard' && (
        <Dashboard
          hives={hives}
          inspections={inspections}
          inputMode={inputMode}
          showCreateHive={showCreateHive}
          onShowCreateHive={setShowCreateHive}
          onAddHive={handleAddHive}
          onDeleteHive={handleDeleteHive}
          onInspect={(hive) => startWizard(hive, 'standard')}
          onDetailed={(hive) => startWizard(hive, 'detailed')}
          onHistory={openHistory}
          onChangeMode={goHome}
        />
      )}

      {view === 'wizard' && (
        <Wizard
          hive={getHiveById(hives, selectedHiveId)}
          stepIndex={wizardStep}
          form={form}
          inputMode={inputMode}
          inspectionKind={inspectionKind}
          isEditing={Boolean(editingRecordId)}
          steps={
            inspectionKind === 'detailed'
              ? DETAILED_WIZARD_STEPS
              : WIZARD_STEPS
          }
          onChoiceTap={handleChoiceTap}
          onAnswerChange={handleAnswerChange}
          onNext={handleNext}
          onBack={handleBack}
          onSkip={handleSkip}
        />
      )}

      {view === 'history' && (
        <History
          hive={getHiveById(hives, selectedHiveId)}
          inspections={getInspectionsForHive(inspections, selectedHiveId)}
          onEdit={startEditRecord}
        />
      )}
    </div>
  )
}

function HexLogo() {
  return (
    <svg className="hex-logo" viewBox="0 0 40 44" aria-hidden="true">
      <polygon
        points="20,2 36,11 36,29 20,38 4,29 4,11"
        fill="var(--primary)"
      />
      <polygon
        points="20,10 30,16 30,28 20,34 10,28 10,16"
        fill="var(--accent)"
      />
    </svg>
  )
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('test')
  const [password, setPassword] = useState('test123')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const result = onLogin(username, password)
    if (!result.ok) {
      setError(result.message)
      setSubmitting(false)
      return
    }
    setSubmitting(false)
  }

  return (
    <main className="login-screen">
      <div className="login-brand">
        <HexLogo />
        <h1 className="login-title">HiveLog</h1>
        <p className="login-sub">Sign in to continue your hive records</p>
      </div>

      <form className="login-form" onSubmit={submit}>
        <label>
          Username
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="test"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn primary login-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="login-test-note">
        <p className="login-test-title">Test accounts</p>
        <ul>
          <li>
            <kbd>test</kbd> / <kbd>test123</kbd>
          </li>
          <li>
            <kbd>demo</kbd> / <kbd>demo</kbd>
          </li>
        </ul>
      </div>
    </main>
  )
}

function Header({
  view,
  inputMode,
  session,
  micLabel,
  micClass,
  onToggleMic,
  onHome,
  onLogout,
  sttSupported,
  micDisabled,
}) {
  return (
    <header className="header">
      <div className="header-left">
        <HexLogo />
        <div>
          <h1 className="app-name">HiveLog</h1>
          <p className="app-sub">
            {session?.displayName
              ? session.displayName
              : inputMode === 'typing'
                ? 'Typing mode'
                : inputMode === 'voice'
                  ? 'Voice mode'
                  : 'Hands-free Records'}
          </p>
        </div>
      </div>
      <div className="header-right">
        {view !== 'home' && (
          <button type="button" className="home-link" onClick={onHome}>
            ← Home
          </button>
        )}
        <button type="button" className="home-link logout-link" onClick={onLogout}>
          Log out
        </button>
        <button
          type="button"
          className={`mic-badge ${micClass}`}
          onClick={onToggleMic}
          disabled={!sttSupported || micDisabled}
          aria-label={`Microphone: ${micLabel}`}
        >
          {micLabel}
        </button>
      </div>
    </header>
  )
}

function Waveform({ active }) {
  return (
    <div className={`waveform ${active ? 'active' : ''}`} aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <span key={i} className="bar" style={{ animationDelay: `${i * 0.07}s` }} />
      ))}
    </div>
  )
}

function HomeScreen({ onChoose, sttSupported }) {
  return (
    <main className="home-screen">
      <p className="home-kicker">Welcome to HiveLog</p>
      <h2 className="home-title">How do you want to inspect?</h2>
      <p className="home-sub">
        Choose one option. You can change it later from Home.
      </p>

      <div className="home-actions">
        <button
          type="button"
          className="home-btn typing"
          onClick={() => onChoose('typing')}
        >
          <span className="home-btn-label">Typing</span>
          <span className="home-btn-desc">Type answers on screen</span>
        </button>
        <button
          type="button"
          className="home-btn voice"
          onClick={() => onChoose('voice')}
          disabled={!sttSupported}
        >
          <span className="home-btn-label">Voice</span>
          <span className="home-btn-desc">Speak answers hands-free</span>
        </button>
      </div>

      {sttSupported && (
        <p className="voice-hint center">Or say “typing” or “voice”</p>
      )}
    </main>
  )
}

function Dashboard({
  hives,
  inspections,
  inputMode,
  showCreateHive,
  onShowCreateHive,
  onAddHive,
  onDeleteHive,
  onInspect,
  onDetailed,
  onHistory,
  onChangeMode,
}) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState('')

  const submitHive = async (e) => {
    e?.preventDefault()
    const result = await onAddHive({ name, location })
    if (!result.ok) {
      setError(result.message)
      return
    }
    setName('')
    setLocation('')
    setError('')
  }

  return (
    <main className="dashboard">
      <div className="dashboard-mode-bar">
        <span className={`mode-badge ${inputMode === 'typing' ? 'typing' : 'voice'}`}>
          {inputMode === 'typing' ? 'Typing mode' : 'Voice mode'}
        </span>
        <button type="button" className="change-mode-link" onClick={onChangeMode}>
          Change mode
        </button>
      </div>

      <div className="setup-head">
        <div>
          <h2 className="setup-title">Your hives</h2>
          <p className="dashboard-intro">
            {inputMode === 'voice'
              ? 'After each save, say inspect and a hive name to continue, or say exit.'
              : 'Create a hive first. Inspect is available only after a hive exists.'}
          </p>
        </div>
        <button
          type="button"
          className="btn primary create-hive-btn"
          onClick={() => {
            onShowCreateHive(true)
            setError('')
          }}
        >
          + Create hive
        </button>
      </div>

      {showCreateHive && (
        <form className="create-hive-form" onSubmit={submitHive}>
          <h3>New hive</h3>
          <label>
            Hive ID / Name
            <input
              type="text"
              value={name}
              placeholder="e.g. Orchard 1"
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label>
            Apiary location <span className="optional">(optional)</span>
            <input
              type="text"
              value={location}
              placeholder="e.g. North field"
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="create-hive-actions">
            <button type="submit" className="btn primary">
              Save hive
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                onShowCreateHive(false)
                setError('')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {hives.length === 0 ? (
        <div className="empty-hives">
          <p className="empty-hives-title">No hives yet</p>
          <p className="empty-hives-text">
            Set up your apiary by creating a hive. Until then, inspection stays locked.
          </p>
          {!showCreateHive && (
            <button
              type="button"
              className="btn primary"
              onClick={() => onShowCreateHive(true)}
            >
              Create your first hive
            </button>
          )}
        </div>
      ) : (
        <div className="hive-grid">
          {hives.map((hive) => {
            const last = getLastInspectionForHive(inspections, hive.id)
            const health = computeHealth(last)
            const voiceWord = hive.keywords?.[0] || hive.name
            return (
              <article key={hive.id} className="hive-card">
                <div className="hive-card-top">
                  <div>
                    <h2 className="hive-name">{hive.name}</h2>
                    <p className="hive-location">
                      {hive.location || 'No location set'}
                    </p>
                  </div>
                  {last && (
                    <span className={`health-badge ${health.className}`}>
                      {health.label}
                    </span>
                  )}
                </div>
                <p className="hive-summary">{formatLastSummary(last)}</p>
                {inputMode === 'voice' && (
                  <p className="voice-hint">
                    “inspect {voiceWord}” · “continue {voiceWord}” · “exit”
                  </p>
                )}
                <div className="card-actions three">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => onInspect(hive)}
                  >
                    Inspect
                  </button>
                  <button
                    type="button"
                    className="btn accent"
                    onClick={() => onDetailed(hive)}
                  >
                    Detailed
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => onHistory(hive)}
                  >
                    History
                  </button>
                </div>
                <button
                  type="button"
                  className="remove-hive"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove “${hive.name}” and its inspection history?`,
                      )
                    ) {
                      onDeleteHive(hive.id)
                    }
                  }}
                >
                  Remove hive
                </button>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}

function Wizard({
  hive,
  stepIndex,
  form,
  inputMode,
  inspectionKind,
  isEditing,
  steps,
  onChoiceTap,
  onAnswerChange,
  onNext,
  onBack,
  onSkip,
}) {
  const step = steps[stepIndex]
  const progress = ((stepIndex + 1) / steps.length) * 100
  const isTyping = inputMode === 'typing'
  const isDetailed = inspectionKind === 'detailed'
  const isLast = stepIndex === steps.length - 1

  if (!step) return null

  const fieldValue = form[step.field] || ''
  const multiSelected = fieldValue
    ? fieldValue.split(',').map((p) => p.trim()).filter(Boolean)
    : []

  return (
    <main className="wizard">
      <div className={`mode-badge wizard-mode ${isTyping ? 'typing' : 'voice'}`}>
        {isEditing ? 'Editing' : isTyping ? 'Typing' : 'Voice'}
        {' · '}
        {isDetailed ? 'Detailed inspection' : 'Quick inspection'}
      </div>

      {!isDetailed && <HeaderFields form={form} hive={hive} />}

      <p className="wizard-context">
        {hive?.name} · {step.section} · {stepIndex + 1} / {steps.length}
      </p>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <p className="qa-kicker">Question</p>
      <p className="wizard-item-title">{step.title}</p>
      <h2 className="wizard-question">{step.question}</h2>
      <p className="wizard-hint">
        {isTyping
          ? step.type === 'multi'
            ? 'Tap all that apply, then Next.'
            : 'Type your answer below, or tap an option, then Next.'
          : step.prompt}
      </p>

      <div className="answer-block">
        <p className="qa-kicker answer">Your answer</p>
        {isTyping && step.type !== 'multi' ? (
          <textarea
            className="answer-input"
            rows={4}
            value={fieldValue}
            placeholder="Type your answer here…"
            onChange={(e) => onAnswerChange(e.target.value)}
            autoFocus
          />
        ) : (
          <div className="text-box" aria-live="polite">
            {fieldValue || (
              <span className="text-placeholder">
                {step.type === 'multi'
                  ? 'Selected items appear here…'
                  : 'Speak your answer, or tap an option below…'}
              </span>
            )}
          </div>
        )}
      </div>

      {step.options?.length > 0 && (
        <div className="choice-grid">
          {step.options.map((option) => (
            <button
              key={option}
              type="button"
              className={`choice-btn ${
                step.type === 'multi'
                  ? multiSelected.includes(option)
                    ? 'selected'
                    : ''
                  : fieldValue === option
                    ? 'selected'
                    : ''
              }`}
              onClick={() => onChoiceTap(option)}
            >
              {capitalize(option)}
            </button>
          ))}
        </div>
      )}

      <div className="wizard-nav">
        <button type="button" className="btn secondary nav-btn" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn secondary nav-btn" onClick={onSkip}>
          Skip
        </button>
        <button type="button" className="btn primary nav-btn next-btn" onClick={onNext}>
          {isLast ? (isEditing ? 'Update' : 'Save') : 'Next'}
        </button>
      </div>

      {!isTyping && (
        <div className="command-strip">
          <span>Say:</span>
          <kbd>your answer</kbd>
          <kbd>next</kbd>
          <kbd>back</kbd>
          <kbd>repeat</kbd>
          <kbd>skip</kbd>
          <kbd>cancel</kbd>
          {isLast && <kbd>save</kbd>}
        </div>
      )}
    </main>
  )
}

function HeaderFields({ form, hive }) {
  const cells = [
    ['Date', form.inspectionDate],
    ['Weather', form.weather],
    ['Time', form.inspectionTime],
    ['Hive ID', form.hiveName || hive?.name],
    ['Location', form.location || hive?.location],
    ['Temp', form.temperature ? `${form.temperature}°C` : ''],
  ]

  return (
    <div className="header-fields" aria-label="Inspection header">
      {cells.map(([label, value]) => (
        <div key={label} className={`header-field ${value ? 'filled' : ''}`}>
          <span className="header-field-label">{label}</span>
          <span className="header-field-value">{value || '—'}</span>
        </div>
      ))}
    </div>
  )
}

function History({ hive, inspections, onEdit }) {
  if (!hive) return null

  const handlePrint = () => {
    window.print()
  }

  const handleSavePdf = () => {
    downloadHistoryPdf(hive, inspections)
  }

  return (
    <main className="history">
      <div className="history-top no-print">
        <div>
          <h2 className="history-title">{hive.name}</h2>
          <p className="history-sub">
            {hive.location || 'No location'} · {inspections.length} records
          </p>
        </div>
        <div className="history-actions">
          <button
            type="button"
            className="btn secondary history-action-btn"
            onClick={handlePrint}
            disabled={inspections.length === 0}
          >
            Print
          </button>
          <button
            type="button"
            className="btn primary history-action-btn"
            onClick={handleSavePdf}
            disabled={inspections.length === 0}
          >
            Save PDF
          </button>
        </div>
      </div>

      <div className="print-only print-header">
        <h2>HiveLog — {hive.name}</h2>
        <p>
          {hive.location || 'No location'} · {inspections.length} records · Printed{' '}
          {new Date().toLocaleString()}
        </p>
      </div>

      {inspections.length === 0 ? (
        <p className="empty">No inspections recorded yet.</p>
      ) : (
        <ul className="history-list">
          {inspections.map((record) => (
            <InspectionRecord
              key={record.id}
              record={record}
              hive={hive}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}

      <p className="voice-hint center no-print">
        Say “back” to return to the dashboard
      </p>
    </main>
  )
}

function InspectionRecord({ record, hive, onEdit }) {
  const isDetailed = record.inspectionKind === 'detailed'

  return (
    <li className="history-item">
      <div className="history-meta">
        <time dateTime={record.date}>
          {record.inspectionDate || formatDate(record.date)}
          {record.updatedAt ? ' · edited' : ''}
        </time>
        <div className="history-meta-right">
          <span className={`kind-pill ${isDetailed ? 'detailed' : 'standard'}`}>
            {isDetailed ? 'Detailed' : 'Quick'}
          </span>
          <button
            type="button"
            className="record-edit-btn no-print"
            onClick={() => onEdit(hive, record)}
          >
            Edit
          </button>
          <button
            type="button"
            className="record-pdf-btn no-print"
            onClick={() => downloadRecordPdf(hive, record)}
          >
            PDF
          </button>
        </div>
      </div>
      <p className="obs-line meta-line">
        {[
          record.hiveName,
          record.yard || record.location,
          record.inspector,
          record.weatherToday || record.weather
            ? capitalize(record.weatherToday || record.weather)
            : '',
          record.temperature ? `${record.temperature}°C` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {isDetailed ? (
        DETAILED_HISTORY_SECTIONS.map((section) => {
          const filled = section.fields.filter(([, key]) => record[key])
          if (!filled.length) return null
          return (
            <div key={section.title}>
              <h3 className="record-section">{section.title}</h3>
              <div className="detail-grid">
                {filled.map(([label, key]) => (
                  <div key={key} className="detail-row">
                    <span className="detail-label">{label}</span>
                    <span className="detail-value">
                      {formatStatusLabel(record[key])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      ) : (
        <>
          <h3 className="record-section">1. Hive overview & external activity</h3>
          <div className="status-grid">
            <StatusCell label="Entrance" value={formatStatusLabel(record.entranceBehavior)} />
            <StatusCell label="Temper" value={formatStatusLabel(record.temperament)} />
            <StatusCell label="Odour" value={formatStatusLabel(record.odour)} />
            <StatusCell label="Dead bees" value={formatStatusLabel(record.deadBees)} />
          </div>

          <h3 className="record-section">2. Queen status & brood pattern</h3>
          <div className="status-grid">
            <StatusCell label="Queen" value={formatStatusLabel(record.queenSpotted)} />
            <StatusCell label="Eggs" value={formatStatusLabel(record.eggsPresent)} />
            <StatusCell label="Pattern" value={formatStatusLabel(record.broodPattern)} />
            <StatusCell label="Stages" value={formatStatusLabel(record.broodStages)} />
          </div>

          <h3 className="record-section">3. Colony health & varroa</h3>
          <div className="status-grid">
            <StatusCell label="Disease" value={formatStatusLabel(record.diseaseSigns)} />
            <StatusCell label="Adults" value={formatStatusLabel(record.adultBeeHealth)} />
            <StatusCell label="Varroa" value={formatStatusLabel(record.varroaLoad)} />
            <StatusCell label="Q. cells" value={formatStatusLabel(record.queenCells)} />
          </div>

          <h3 className="record-section">4. Stores & space management</h3>
          <div className="status-grid">
            <StatusCell label="Honey" value={formatStatusLabel(record.honeyStores)} />
            <StatusCell label="Pollen" value={formatStatusLabel(record.pollenStores)} />
            <StatusCell label="Room" value={formatStatusLabel(record.roomToExpand)} />
            <StatusCell label="Brace comb" value={formatStatusLabel(record.braceComb)} />
          </div>

          {record.notes && (
            <p className="obs-line">
              <strong>Actions & notes:</strong> {record.notes}
            </p>
          )}
        </>
      )}
    </li>
  )
}

function StatusCell({ label, value }) {
  return (
    <div className="status-cell">
      <span className="status-label">{label}</span>
      <span className="status-value">{value}</span>
    </div>
  )
}
