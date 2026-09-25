/**
 * useVoiceEngine — push-to-talk voice for HiveLog / Beeva
 *
 * Hold the talk button → speak → release → answer/command is submitted.
 * No "Beeva … over" required (those words are stripped if spoken).
 * Mic stays off while Beeva talks so TTS never pollutes answers.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition'

export const AGENT_NAME = 'Beeva'

const FILLER =
  /\b(beeva|beava|beva|biva|viva|beaver|over(?:\s+and\s+out)?|please)\b/gi

function cleanTranscript(raw) {
  return String(raw || '')
    .replace(FILLER, ' ')
    .replace(/[.,!?']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function useVoiceEngine({ onCommand, enabled = false }) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [interim, setInterim] = useState('')
  const [lastHeard, setLastHeard] = useState('')
  const [micError, setMicError] = useState(null)
  const [holding, setHolding] = useState(false)

  const onCommandRef = useRef(onCommand)
  const enabledRef = useRef(enabled)
  const speakingRef = useRef(false)
  const holdingRef = useRef(false)
  const ttsGenRef = useRef(0)
  const bufferRef = useRef('')

  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const {
    transcript,
    interimTranscript,
    finalTranscript,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition()

  const clearHeard = useCallback(() => {
    setInterim('')
    setLastHeard('')
    bufferRef.current = ''
    resetTranscript()
  }, [resetTranscript])

  const stopSpeaking = useCallback(() => {
    ttsGenRef.current += 1
    window.speechSynthesis?.cancel()
    speakingRef.current = false
    setSpeaking(false)
  }, [])

  const stopMic = useCallback(() => {
    SpeechRecognition.abortListening().catch(() => {})
    setListening(false)
  }, [])

  /** Speak with Web Speech API. Mic stays off. Resolves true if interrupted. */
  const speak = useCallback(
    (text, { force = false } = {}) => {
      if (!text) return Promise.resolve(false)
      if (!force && !enabledRef.current) return Promise.resolve(false)
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        return Promise.resolve(false)
      }

      // Never listen while Beeva talks
      holdingRef.current = false
      setHolding(false)
      stopMic()
      clearHeard()

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
          resolve(Boolean(interrupted))
        }

        utt.onend = () => finish(false)
        utt.onerror = () => finish(true)
        window.speechSynthesis.resume()
        window.speechSynthesis.speak(utt)
      })
    },
    [clearHeard, stopMic],
  )

  const submitText = useCallback(
    (raw) => {
      const cmd = cleanTranscript(raw)
      if (!cmd) {
        setInterim('Nothing heard — hold and try again')
        return false
      }
      setLastHeard(cmd)
      setInterim('')
      bufferRef.current = ''
      resetTranscript()
      onCommandRef.current(cmd)
      return true
    },
    [resetTranscript],
  )

  /** Press / hold to start capturing speech */
  const startTalk = useCallback(() => {
    if (!enabledRef.current || !browserSupportsSpeechRecognition) return
    if (speakingRef.current) {
      stopSpeaking()
    }
    holdingRef.current = true
    setHolding(true)
    bufferRef.current = ''
    resetTranscript()
    setInterim('Listening…')
    setLastHeard('')
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
        holdingRef.current = false
        setHolding(false)
        setMicError('Microphone permission denied.')
      })
  }, [browserSupportsSpeechRecognition, resetTranscript, stopSpeaking])

  // Live preview + buffer while holding
  useEffect(() => {
    if (!holdingRef.current) return
    const piece = `${finalTranscript || ''} ${interimTranscript || ''}`.trim()
    if (!piece && !transcript) return
    const combined = cleanTranscript(
      `${bufferRef.current} ${finalTranscript} ${interimTranscript || transcript}`,
    )
    if (finalTranscript) {
      bufferRef.current = cleanTranscript(
        `${bufferRef.current} ${finalTranscript}`,
      )
      resetTranscript()
    }
    setInterim(combined || bufferRef.current || 'Listening…')
  }, [transcript, interimTranscript, finalTranscript, resetTranscript])

  /** Release to submit whatever was said */
  const stopTalk = useCallback(() => {
    if (!holdingRef.current) return
    holdingRef.current = false
    setHolding(false)

    const snapshot = cleanTranscript(
      `${bufferRef.current} ${finalTranscript} ${interimTranscript} ${transcript}`,
    )

    SpeechRecognition.stopListening()
      .catch(() => {})
      .finally(() => {
        setListening(false)
        setTimeout(() => {
          const latest =
            cleanTranscript(bufferRef.current) ||
            snapshot ||
            cleanTranscript(transcript)
          if (latest) submitText(latest)
          else setInterim('Nothing heard — hold and try again')
          resetTranscript()
        }, 350)
      })
  }, [
    transcript,
    finalTranscript,
    interimTranscript,
    submitText,
    resetTranscript,
  ])

  // When voice mode turns off, stop everything
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setMicError('Speech recognition needs Chrome or Edge.')
      return undefined
    }
    if (!enabled) {
      holdingRef.current = false
      setHolding(false)
      stopMic()
      stopSpeaking()
      clearHeard()
    }
    return () => {
      stopMic()
    }
  }, [
    enabled,
    browserSupportsSpeechRecognition,
    stopMic,
    stopSpeaking,
    clearHeard,
  ])

  return {
    listening,
    speaking,
    holding,
    interim,
    lastHeard,
    micError,
    speak,
    stopSpeaking,
    startTalk,
    stopTalk,
    clearHeard,
    browserSupportsSpeechRecognition,
  }
}
