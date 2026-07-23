import { useCallback, useEffect, useRef } from 'react'
import recordStartUrl from '../assets/audio/record-start.mp3'
import recordStopUrl from '../assets/audio/record-stop.mp3'

type RecordingSound = 'start' | 'stop'

export function useRecordingSoundEffects() {
  const audioRef = useRef<Record<RecordingSound, HTMLAudioElement> | null>(null)

  useEffect(() => {
    const start = new Audio(recordStartUrl)
    const stop = new Audio(recordStopUrl)
    start.preload = 'auto'
    stop.preload = 'auto'
    start.volume = 0.72
    stop.volume = 0.72
    audioRef.current = { start, stop }

    return () => {
      Object.values(audioRef.current ?? {}).forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })
      audioRef.current = null
    }
  }, [])

  const play = useCallback((sound: RecordingSound) => {
    const audio = audioRef.current?.[sound]
    if (!audio) return

    audio.pause()
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Browsers can block audio before the first user gesture.
    })
  }, [])

  return {
    playRecordingStart: useCallback(() => play('start'), [play]),
    playRecordingStop: useCallback(() => play('stop'), [play]),
  }
}
