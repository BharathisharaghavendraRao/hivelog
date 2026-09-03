/**
 * useVoiceEngine — wraps react-speech-recognition for HiveLog / Beeva
 *
 * Protocol:
 *   • Say "Beeva" (or a variant) to arm the mic / stop TTS.
 *   • Say anything after "Beeva", then "over" to submit.
 *   • Short single-word commands (next, back, skip, cancel, exit, save, yes, no)
 *     are accepted WITHOUT "Beeva"/"over" so tap-friendly answers still work.
 *   • While TTS is playing, ANY recognised word that contains a wake word stops
 *     speech immediately and re-arms.
 *   • Arbitrary speech that doesn't match the protocol is ignored — no rubbish
 *     written into fields.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition'

export const AGENT_NAME = 'Beeva'
const WAKE_WORDS = ['beeva', 'beava', 'beva', 'biva', 'viva', 'beaver']
const END_WORDS = ['over', 'over and out']

// Short commands accepted without the Beeva…over wrapper
const PASSTHROUGH_WORDS = [
  'next', 'back', 'skip', 'cancel', 'exit', 'save', 'done', 'yes', 'no',
  'repeat', 'continue', 'stop', 'finish',
]

function norm(t) {
  return (t || '').toLowerCase().replace(/[.,!?']/g, ' ').replace(/\s+/g, ' ').trim()
}

function containsWake(text) {
  return WAKE_WORDS.some((w) => {
    const r = new RegExp(`(^|\\s)${w}(\\s|$)`)
    return r.test(text)
  })
}

function containsEnd(text) {
  return END_WORDS.some((w) => {
    const r = new RegExp(`(^|\\s)${w.replace(' ', '\\s+')}(\\s|$)`)
    return r.test(text)
  })
}

function stripWake(text) {
  let t = text
  for (const w of WAKE_WORDS) {
    t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ')
  }
  return t.replace(/\s+/g, ' ').trim()
}

function stripEnd(text) {
  let t = text
  const ends = [...END_WORDS].sort((a, b) => b.length - a.length)
  for (const e of ends) {
    t = t.replace(new RegExp(`\\b${e.replace(' ', '\\s+')}\\b`, 'g'), ' ')
  }
  return t.replace(/\s+/g, ' ').trim()
}

function isPassthrough(text) {
  return PASSTHROUGH_WORDS.includes(text)
}

export function useVoiceEngine({ onCommand, enabled = false }) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [armed, setArmed] = useState(false)      // Beeva heard, waiting for "over"
  const [interim, setInterim] = useState('')
  const [lastHeard, setLastHeard] = useState('')
  const [micError, setMicError] = useState(null)

  // Refs (values needed inside callbacks without re-creating them)
  const onCommandRef = useRef(onCommand)
  const enabledRef = useRef(enabled)
  const armedRef = useRef(false)
  const bufferRef = useRef('')
  const speakingRef = useRef(false)
  const ttsGenRef = useRef(0)
  const echoUntilRef = useRef(0)

  useEffect(() => { onCommandRef.current = onCommand }, [onCommand])
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  const arm = useCallback(() => {
    armedRef.current = true
    bufferRef.current = ''
    setArmed(true)
    setInterim(`${AGENT_NAME} — listening… say "over" when done`)
  }, [])

  const disarm = useCallback(() => {
    armedRef.current = false
    bufferRef.current = ''
    setArmed(false)
    setInterim('')
  }, [])

  // ── TTS ──────────────────────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    ttsGenRef.current += 1
    window.speechSynthesis?.cancel()
    speakingRef.current = false
    setSpeaking(false)
  }, [])

  const speak = useCallback(
    (text, { force = false } = {}) => {
      if (!text) return Promise.resolve()
      if (!force && !enabledRef.current) return Promise.resolve()

      return new Promise((resolve) => {
        const gen = ++ttsGenRef.current
        speakingRef.current = true
        setSpeaking(true)
        disarm()
        // Lock out echo: TTS audio picked up as speech for ~2 s
        echoUntilRef.current = Date.now() + 2000

        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(text)
        utt.lang = 'en-US'
        utt.rate = 0.95

        utt.onend = () => {
          if (gen !== ttsGenRef.current) { resolve(); return }
          speakingRef.current = false
          setSpeaking(false)
          resolve()
        }
        utt.onerror = () => {
          speakingRef.current = false
          setSpeaking(false)
          resolve()
        }

        // Chrome bug: synthesis sometimes stalls; nudge it
        window.speechSynthesis.resume()
        window.speechSynthesis.speak(utt)
      })
    },
    [disarm],
  )

  // ── react-speech-recognition callback ───────────────────────────────────
  const handleTranscript = useCallback(
    ({ transcript: raw, isFinal }) => {
      if (!enabledRef.current) return
      const text = norm(raw)
      if (!text) return

      // Ignore echo during TTS playback
      if (Date.now() < echoUntilRef.current) return

      // ── Barge-in: wake word stops TTS at any time ─────────────────────
      if (speakingRef.current && containsWake(text)) {
        stopSpeaking()
        arm()
        // Keep any words after the wake word as buffer
        const after = stripWake(text)
        if (after) {
          bufferRef.current = after
          setInterim(`${AGENT_NAME} ${after} …`)
        }
        return
      }

      // While Beeva is speaking, ignore everything else
      if (speakingRef.current) return

      // ── Not yet armed ────────────────────────────────────────────────
      if (!armedRef.current) {
        if (!isFinal) return  // show nothing until final

        // Passthrough: short commands accepted without Beeva/over
        if (isPassthrough(text)) {
          setLastHeard(text)
          setInterim('')
          onCommandRef.current(text)
          return
        }

        // Beeva (possibly with command and "over") in one shot
        if (containsWake(text)) {
          const afterWake = stripWake(text)
          if (afterWake && containsEnd(afterWake)) {
            const command = stripEnd(afterWake)
            if (command) {
              setLastHeard(`${AGENT_NAME} ${command} over`)
              setInterim('')
              onCommandRef.current(command)
              return
            }
          }
          // Armed but no "over" yet
          arm()
          if (afterWake) {
            bufferRef.current = afterWake
            setInterim(`${AGENT_NAME} ${afterWake} …`)
          }
          return
        }

        // Ignore random speech
        return
      }

      // ── Armed: accumulate and watch for "over" ───────────────────────
      if (!isFinal) {
        // Show live preview
        const preview = `${bufferRef.current} ${text}`.trim()
        setInterim(`${AGENT_NAME} ${preview} …`)
        return
      }

      // Final chunk while armed
      if (containsWake(text)) {
        // New Beeva resets the buffer
        const afterWake = stripWake(text)
        bufferRef.current = afterWake
        setInterim(`${AGENT_NAME} ${afterWake || '…'}`)
        return
      }

      bufferRef.current = `${bufferRef.current} ${text}`.replace(/\s+/g, ' ').trim()
      const full = bufferRef.current

      if (containsEnd(full) || containsEnd(text)) {
        const command = stripEnd(stripWake(full))
        disarm()
        if (command) {
          setLastHeard(`${AGENT_NAME} ${command} over`)
          setInterim('')
          onCommandRef.current(command)
        } else {
          setLastHeard('')
          setInterim(`${AGENT_NAME} … empty — try again`)
        }
      } else {
        setInterim(`${AGENT_NAME} ${full} … (say "over" to finish)`)
      }
    },
    [arm, disarm, stopSpeaking],
  )

  // ── react-speech-recognition hook ───────────────────────────────────────
  const { transcript, interimTranscript, finalTranscript, resetTranscript, browserSupportsSpeechRecognition } =
    useSpeechRecognition()

  // Feed final results
  const prevFinal = useRef('')
  useEffect(() => {
    if (!finalTranscript || finalTranscript === prevFinal.current) return
    prevFinal.current = finalTranscript
    handleTranscript({ transcript: finalTranscript, isFinal: true })
    resetTranscript()
  }, [finalTranscript, handleTranscript, resetTranscript])

  // Feed interim results for preview
  useEffect(() => {
    if (!interimTranscript) return
    handleTranscript({ transcript: interimTranscript, isFinal: false })
  }, [interimTranscript, handleTranscript])

  // ── Start / stop listening ───────────────────────────────────────────────
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setMicError('Speech recognition not supported — use Chrome or Edge.')
      return
    }

    if (enabled) {
      SpeechRecognition.startListening({ continuous: true, language: 'en-US' })
        .catch(() => setMicError('Microphone permission denied.'))
      setListening(true)
      setMicError(null)
    } else {
      SpeechRecognition.stopListening()
      stopSpeaking()
      disarm()
      setListening(false)
    }

    return () => {
      SpeechRecognition.stopListening()
    }
  }, [enabled, browserSupportsSpeechRecognition, disarm, stopSpeaking])

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
