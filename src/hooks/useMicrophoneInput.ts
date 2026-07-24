import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MicrophoneState } from '../types'

export type { MicrophoneState }

type UseMicrophoneInputOptions = {
  active: boolean
  rootRef: RefObject<HTMLElement | null>
  onDenied: () => void
}

const MIC_STYLE_PROPERTIES = [
  '--mic-scale',
  '--mic-brightness',
  '--mic-opacity',
  '--mic-ring-scale',
  '--mic-glow',
] as const

function getOrbStage(rootRef: RefObject<HTMLElement | null>) {
  return rootRef.current?.querySelector<HTMLElement>('.orb-stage')
}

function resetOrbResponse(rootRef: RefObject<HTMLElement | null>) {
  const orbStage = getOrbStage(rootRef)
  if (orbStage) {
    MIC_STYLE_PROPERTIES.forEach((property) => orbStage.style.removeProperty(property))
  }
  window.particleOrb?.setAudioLevel(0)
}

export function useMicrophoneInput({
  active,
  rootRef,
  onDenied,
}: UseMicrophoneInputOptions) {
  const onDeniedRef = useRef(onDenied)
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  useEffect(() => {
    onDeniedRef.current = onDenied
  }, [onDenied])

  useEffect(() => {
    if (!active || microphoneState !== 'active') {
      if (!active) setRecordingSeconds(0)
      return
    }

    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 250)
    return () => window.clearInterval(interval)
  }, [active, microphoneState])

  useEffect(() => {
    if (!active) {
      setMicrophoneState((current) => (current === 'denied' ? current : 'idle'))
      return
    }

    let cancelled = false
    let animationFrame = 0
    let stream: MediaStream | null = null
    let audioContext: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null

    const denyMicrophone = () => {
      setMicrophoneState('denied')
      onDeniedRef.current()
    }

    const startMicrophone = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        denyMicrophone()
        return
      }

      setMicrophoneState('requesting')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        audioContext = new AudioContext()
        await audioContext.resume()
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.78
        source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        const waveform = new Uint8Array(analyser.fftSize)
        setMicrophoneState('active')

        const updateAudioLevel = () => {
          if (!analyser || cancelled) return

          analyser.getByteTimeDomainData(waveform)
          let energy = 0
          for (const sample of waveform) {
            const normalized = (sample - 128) / 128
            energy += normalized * normalized
          }

          const rms = Math.sqrt(energy / waveform.length)
          const level = Math.min(1, Math.max(0, (rms - 0.008) * 9.5))
          window.particleOrb?.setAudioLevel(level)

          const orbStage = getOrbStage(rootRef)
          if (orbStage) {
            orbStage.style.setProperty('--mic-scale', String(0.95 + level * 0.075))
            orbStage.style.setProperty('--mic-brightness', String(0.7 + level * 0.72))
            orbStage.style.setProperty('--mic-opacity', String(0.62 + level * 0.34))
            orbStage.style.setProperty('--mic-ring-scale', String(0.92 + level * 0.15))
            orbStage.style.setProperty('--mic-glow', String(0.18 + level * 0.72))
          }

          animationFrame = window.requestAnimationFrame(updateAudioLevel)
        }

        updateAudioLevel()
      } catch {
        if (!cancelled) denyMicrophone()
      }
    }

    void startMicrophone()
    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrame)
      source?.disconnect()
      analyser?.disconnect()
      stream?.getTracks().forEach((track) => track.stop())
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close()
      }
      resetOrbResponse(rootRef)
    }
  }, [active, rootRef])

  return { microphoneState, recordingSeconds }
}
