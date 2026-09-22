/**
 * useVoiceEngine — STT via react-speech-recognition, TTS via Web Speech API.
 *
 * Protocol: "Beeva <answer> over"
 * Short words (next, back, skip, …) work without the wrapper.
 *
 * Critical: mic is MUTED while Beeva speaks so her voice is never transcribed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition'

export const AGENT_NAME = 'Beeva'

const WAKE = /\b(beeva|beava|beva|biva|viva|beaver)\b/i
const END = /\bover(?:\s+and\s+out)?\b/i
const PASS =
  /^(next|back|skip|cancel|exit|save|done|yes|no|repeat|continue|stop|finish)$/i

function norm(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[.,!?']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripWake(t) {
  return norm(t).replace(WAKE, ' ').replace(/\s+/g, ' ').trim()
}

function stripEnd(t) {
  return norm(t).replace(END, ' ').replace(/\s+/g, ' ').trim()
}

export function useVoiceEngine({ onCommand, enabled = false }) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [armed, setArmed] = useState(false)
  const [interim, setInterim] = useState('')
  const [lastHeard, setLastHeard] = useState('')
  const [micError, setMicError] = useState(null)

  const onCommandRef = useRef(onCommand)
  const enabledRef = useRef(enabled)
  const armedRef = useRef(false)
  const bufferRef = useRef('')
  const speakingRef = useRef(false)
  const mutedRef = useRef(false) // ignore all STT while muted
  const ttsGenRef = useRef(0)
  const coolUntilRef = useRef(0)

  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const {
    finalTranscript,
    interimTranscript,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition()

  const arm = useCallback(() => {
    armedRef.current = true
    bufferRef.current = ''
    setArmed(true)
    setInterim(`${AGENT_NAME} — listening… say over`)
  }, [])

  const disarm = useCallback(() => {
    armedRef.current = false
    bufferRef.current = ''
    setArmed(false)
    setInterim('')
  }, [])

  const pauseMic = useCallback(() => {
    mutedRef.current = true
    SpeechRecognition.abortListening().catch(() => {})
    resetTranscript()
    setListening(false)
  }, [resetTranscript])

  const resumeMic = useCallback(() => {
    if (!enabledRef.current || !browserSupportsSpeechRecognition) return
    resetTranscript()
    mutedRef.current = false
    coolUntilRef.current = Date.now() + 700
    SpeechRecognition.startListening({ continuous: true, language: 'en-US' })
      .then(() => {
        setListening(true)
        setMicError(null)
      })
      .catch(() => setMicError('Microphone permission denied.'))
  }, [browserSupportsSpeechRecognition, resetTranscript])

  const stopSpeaking = useCallback(() => {
    ttsGenRef.current += 1
    window.speechSynthesis?.cancel()
    speakingRef.current = false
    setSpeaking(false)
  }, [])

  /** Speak text. Mic is off while talking. Resolves true if interrupted. */
  const speak = useCallback(
    (text, { force = false } = {}) => {
      if (!text) return Promise.resolve(false)
      if (!force && !enabledRef.current) return Promise.resolve(false)
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        return Promise.resolve(false)
      }

      return new Promise((resolve) => {
        const gen = ++ttsGenRef.current
        speakingRef.current = true
        setSpeaking(true)
        disarm()
        pauseMic()

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
          // Brief silence so last TTS audio is not transcribed
          setTimeout(() => {
            if (gen === ttsGenRef.current && enabledRef.current) resumeMic()
          }, 450)
          resolve(Boolean(interrupted))
        }

        utt.onend = () => finish(false)
        utt.onerror = () => finish(true)

        window.speechSynthesis.resume()
        window.speechSynthesis.speak(utt)
      })
    },
    [disarm, pauseMic, resumeMic],
  )

  const submit = useCallback(
    (command) => {
      const cmd = norm(command)
      if (!cmd) {
        setInterim(`${AGENT_NAME} … empty — try again`)
        return
      }
      disarm()
      setLastHeard(`${AGENT_NAME} ${cmd} over`)
      setInterim('')
      onCommandRef.current(cmd)
    },
    [disarm],
  )

  const handleFinal = useCallback(
    (raw) => {
      if (!enabledRef.current || mutedRef.current) return
      if (Date.now() < coolUntilRef.current) return
      if (speakingRef.current) return

      const text = norm(raw)
      if (!text) return

      // Short commands without Beeva…over
      if (!armedRef.current && PASS.test(text)) {
        setLastHeard(text)
        setInterim('')
        onCommandRef.current(text)
        return
      }

      // One-shot: "Beeva cloudy over"
      if (WAKE.test(text)) {
        const body = stripEnd(stripWake(text))
        if (END.test(text)) {
          submit(body)
          return
        }
        arm()
        if (body) {
          bufferRef.current = body
          setInterim(`${AGENT_NAME} ${body} …`)
        }
        return
      }

      if (!armedRef.current) return // ignore chatter

      if (WAKE.test(text)) {
        bufferRef.current = stripWake(text)
        setInterim(`${AGENT_NAME} ${bufferRef.current || '…'}`)
        return
      }

      bufferRef.current = `${bufferRef.current} ${text}`.replace(/\s+/g, ' ').trim()
      if (END.test(bufferRef.current) || END.test(text)) {
        submit(stripEnd(bufferRef.current))
      } else {
        setInterim(`${AGENT_NAME} ${bufferRef.current} … (say over)`)
      }
    },
    [arm, submit],
  )

  // Final transcripts only — ignore interim for commands (less junk)
  const prevFinal = useRef('')
  useEffect(() => {
    if (!finalTranscript || finalTranscript === prevFinal.current) return
    prevFinal.current = finalTranscript
    handleFinal(finalTranscript)
    resetTranscript()
  }, [finalTranscript, handleFinal, resetTranscript])

  // Interim = preview only when already armed
  useEffect(() => {
    if (mutedRef.current || speakingRef.current) return
    if (!armedRef.current || !interimTranscript) return
    const preview = `${bufferRef.current} ${norm(interimTranscript)}`.trim()
    setInterim(`${AGENT_NAME} ${preview} …`)
  }, [interimTranscript])

  // Enable / disable listening
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setMicError('Speech recognition needs Chrome or Edge.')
      return undefined
    }

    if (enabled && !speakingRef.current) {
      resumeMic()
    } else {
      mutedRef.current = true
      SpeechRecognition.abortListening().catch(() => {})
      stopSpeaking()
      disarm()
      setListening(false)
    }

    return () => {
      SpeechRecognition.abortListening().catch(() => {})
    }
  }, [
    enabled,
    browserSupportsSpeechRecognition,
    resumeMic,
    stopSpeaking,
    disarm,
  ])

  return {
    listening,
    speaking,
    armed,
    interim,
    lastHeard,
    micError,
    speak,
    stopSpeaking,
    arm,
    disarm,
    browserSupportsSpeechRecognition,
  }
}
