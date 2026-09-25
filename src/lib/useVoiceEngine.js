/**
 * useVoiceEngine — hands-free continuous listening for HiveLog / Beeva
 *
 * • Mic is always on in voice mode (no buttons).
 * • User just speaks naturally; each finished phrase is submitted.
 * • Mic is muted while Beeva talks so her voice is never treated as an answer.
 * • Optional "Beeva" / "over" words are stripped if said, but never required.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition'

export const AGENT_NAME = 'Beeva'

const FILLER =
  /\b(beeva|beava|beva|biva|viva|beaver|hey|ok|okay|um|uh|please|over(?:\s+and\s+out)?)\b/gi

function cleanTranscript(raw) {
  return String(raw || '')
    .replace(FILLER, ' ')
    .replace(/[.,!?']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeEcho(heard, spoken) {
  const a = cleanTranscript(heard).toLowerCase()
  const b = cleanTranscript(spoken).toLowerCase()
  if (!a || !b) return false
  if (a.length < 2) return true
  if (b.includes(a) || a.includes(b)) return true
  const aw = new Set(a.split(' '))
  const bw = b.split(' ')
  const hits = bw.filter((w) => w.length > 2 && aw.has(w)).length
  return hits >= 2 && hits / Math.max(aw.size, 1) >= 0.5
}

export function useVoiceEngine({ onCommand, enabled = false }) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [interim, setInterim] = useState('')
  const [lastHeard, setLastHeard] = useState('')
  const [micError, setMicError] = useState(null)

  const onCommandRef = useRef(onCommand)
  const enabledRef = useRef(enabled)
  const speakingRef = useRef(false)
  const mutedRef = useRef(false)
  const ttsGenRef = useRef(0)
  const coolUntilRef = useRef(0)
  const lastSpokenRef = useRef('')
  const lastSubmitRef = useRef('')
  const lastSubmitAtRef = useRef(0)
  const resumeTimerRef = useRef(null)
  const pendingRef = useRef('')
  const pendingTimerRef = useRef(null)

  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const {
    interimTranscript,
    finalTranscript,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition()

  const clearHeard = useCallback(() => {
    setInterim('')
    setLastHeard('')
    resetTranscript()
  }, [resetTranscript])

  const stopMic = useCallback(() => {
    mutedRef.current = true
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
    pendingRef.current = ''
    SpeechRecognition.abortListening().catch(() => {})
    setListening(false)
  }, [])

  const startMic = useCallback(() => {
    if (!enabledRef.current || !browserSupportsSpeechRecognition) return
    if (speakingRef.current) return

    mutedRef.current = false
    resetTranscript()
    SpeechRecognition.startListening({
      continuous: true,
      interimResults: true,
      language: 'en-US',
    })
      .then(() => {
        setListening(true)
        setMicError(null)
      })
      .catch(() => {
        setListening(false)
        setMicError('Microphone permission denied — allow mic in the browser.')
      })
  }, [browserSupportsSpeechRecognition, resetTranscript])

  const scheduleResumeMic = useCallback(
    (delayMs = 650) => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      coolUntilRef.current = Date.now() + delayMs + 200
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null
        if (enabledRef.current && !speakingRef.current) startMic()
      }, delayMs)
    },
    [startMic],
  )

  const stopSpeaking = useCallback(() => {
    ttsGenRef.current += 1
    window.speechSynthesis?.cancel()
    speakingRef.current = false
    setSpeaking(false)
  }, [])

  /** Beeva speaks. Mic off until she finishes, then auto-listen again. */
  const speak = useCallback(
    (text, { force = false } = {}) => {
      if (!text) return Promise.resolve(false)
      if (!force && !enabledRef.current) return Promise.resolve(false)
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        return Promise.resolve(false)
      }

      stopMic()
      clearHeard()
      lastSpokenRef.current = text

      return new Promise((resolve) => {
        const gen = ++ttsGenRef.current
        speakingRef.current = true
        setSpeaking(true)

        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(text)
        utt.lang = 'en-US'
        utt.rate = 0.95

        const finish = (interrupted) => {
          if (gen !== ttsGenRef.current) {
            resolve(true)
            return
          }
          speakingRef.current = false
          setSpeaking(false)
          if (enabledRef.current) scheduleResumeMic(700)
          resolve(Boolean(interrupted))
        }

        utt.onend = () => finish(false)
        utt.onerror = () => finish(true)
        window.speechSynthesis.resume()
        window.speechSynthesis.speak(utt)
      })
    },
    [clearHeard, scheduleResumeMic, stopMic],
  )

  const submitText = useCallback(
    (raw) => {
      const cmd = cleanTranscript(raw)
      if (!cmd || cmd.length < 1) return false

      // Ignore TTS echo
      if (looksLikeEcho(cmd, lastSpokenRef.current)) return false

      // Ignore duplicate rapid submits of the same phrase
      const now = Date.now()
      if (
        cmd === lastSubmitRef.current &&
        now - lastSubmitAtRef.current < 1500
      ) {
        return false
      }

      lastSubmitRef.current = cmd
      lastSubmitAtRef.current = now
      setLastHeard(cmd)
      setInterim('')
      resetTranscript()
      onCommandRef.current(cmd)
      return true
    },
    [resetTranscript],
  )

  // Final chunks → debounce into one natural phrase, then submit
  const prevFinal = useRef('')
  useEffect(() => {
    if (!finalTranscript || finalTranscript === prevFinal.current) return
    prevFinal.current = finalTranscript

    if (!enabledRef.current || mutedRef.current || speakingRef.current) {
      resetTranscript()
      return
    }
    if (Date.now() < coolUntilRef.current) {
      resetTranscript()
      return
    }

    const piece = cleanTranscript(finalTranscript)
    resetTranscript()
    if (!piece) return
    if (looksLikeEcho(piece, lastSpokenRef.current)) return

    pendingRef.current = cleanTranscript(`${pendingRef.current} ${piece}`)
    setInterim(pendingRef.current)

    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    // Wait for a brief pause so full sentences are kept together
    pendingTimerRef.current = setTimeout(() => {
      const full = pendingRef.current
      pendingRef.current = ''
      pendingTimerRef.current = null
      if (full) submitText(full)
    }, 900)
  }, [finalTranscript, resetTranscript, submitText])

  // Live preview while user is talking
  useEffect(() => {
    if (!enabledRef.current || mutedRef.current || speakingRef.current) return
    if (!interimTranscript) return
    setInterim(cleanTranscript(interimTranscript) || interimTranscript)
  }, [interimTranscript])

  // Keep listening whenever voice mode is on (and Beeva is quiet)
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setMicError('Speech recognition needs Chrome or Edge.')
      return undefined
    }

    if (enabled) {
      if (!speakingRef.current) startMic()
    } else {
      stopMic()
      stopSpeaking()
      clearHeard()
    }

    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      SpeechRecognition.abortListening().catch(() => {})
    }
  }, [
    enabled,
    browserSupportsSpeechRecognition,
    startMic,
    stopMic,
    stopSpeaking,
    clearHeard,
  ])

  return {
    listening,
    speaking,
    interim,
    lastHeard,
    micError,
    speak,
    stopSpeaking,
    clearHeard,
    browserSupportsSpeechRecognition,
  }
}
