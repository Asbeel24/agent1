import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Agent1AppWsClient, SessionTokenStore, agent1Runtime, type AppWsStatus } from '../api'
import { PcmStreamPlayer, type PcmPlaybackFeedback } from '../audio/PcmStreamPlayer'
import { CLIENT_EVENTS, SERVER_EVENTS, isAgent1ServerEvent } from '../protocol/agent1'
import type { SceneId } from '../types'

type UseAgent1RealtimeOptions = {
  sceneId: SceneId
  sourceLanguage: string
  targetLanguage: string
}

export function useAgent1Realtime({
  sceneId,
  sourceLanguage,
  targetLanguage,
}: UseAgent1RealtimeOptions) {
  const clientRef = useRef<Agent1AppWsClient | null>(null)
  const activeTranslationPairRef = useRef<string | null>(null)
  const [status, setStatus] = useState<AppWsStatus>('idle')
  const tokenStoreRef = useRef(new SessionTokenStore())
  const accessToken = useSyncExternalStore(
    (listener) => tokenStoreRef.current.subscribe(listener),
    () => tokenStoreRef.current.getAccessToken(),
  )

  useEffect(() => {
    if (!agent1Runtime.liveApiEnabled || !accessToken) {
      setStatus('idle')
      return
    }

    const sendPlaybackFeedback = (feedback: PcmPlaybackFeedback) => {
      const client = clientRef.current
      if (!client || client.status !== 'open') return
      client.send(CLIENT_EVENTS.responseAudioFeedback, {
        event: feedback.event,
        ...(feedback.sampleRate ? { sample_rate: feedback.sampleRate } : {}),
        ...(feedback.dataSize ? { data_size: feedback.dataSize } : {}),
      })
    }
    const player = new PcmStreamPlayer({
      onLevel: (level) => window.particleOrb?.setAudioLevel(level),
      onFeedback: sendPlaybackFeedback,
    })
    const client = new Agent1AppWsClient({
      tokens: tokenStoreRef.current,
      onAuthRevoked: () => setStatus('closed'),
    })
    clientRef.current = client
    const unsubscribeStatus = client.subscribeStatus(setStatus)
    const unsubscribeEvents = client.subscribe((event) => {
      if (!isAgent1ServerEvent(event)) return
      if (event.event === SERVER_EVENTS.responseAudio && event.data) {
        void player.enqueueBase64Pcm(event.data.data, event.data.sample_rate)
      } else if (event.event === SERVER_EVENTS.responseAudioInterrupt) {
        player.interrupt()
      }
    })
    client.connect()

    return () => {
      unsubscribeEvents()
      unsubscribeStatus()
      client.disconnect()
      clientRef.current = null
      activeTranslationPairRef.current = null
      void player.close()
    }
  }, [accessToken])

  useEffect(() => {
    const client = clientRef.current
    if (!client || status !== 'open') return

    const isTranslation = sceneId === 'translate'
    const pair = `${sourceLanguage.toLowerCase()}:${targetLanguage.toLowerCase()}`
    if (isTranslation) {
      if (activeTranslationPairRef.current === pair) return
      if (activeTranslationPairRef.current) {
        client.send(CLIENT_EVENTS.translationStop, undefined)
      }
      client.send(CLIENT_EVENTS.translationStart, {
        source_lang: sourceLanguage.toLowerCase(),
        target_lang: targetLanguage.toLowerCase(),
      })
      activeTranslationPairRef.current = pair
    } else if (activeTranslationPairRef.current) {
      client.send(CLIENT_EVENTS.translationStop, undefined)
      activeTranslationPairRef.current = null
    }
  }, [sceneId, sourceLanguage, targetLanguage, status])

  const sendAudioFrame = useCallback((samples: Int16Array) => {
    if (sceneId === 'meeting') return
    const client = clientRef.current
    if (!client || client.status !== 'open') return
    client.send(CLIENT_EVENTS.inputAudioAppend, {
      format: 'pcm',
      sample_rate: 16_000,
      data: int16ToBase64(samples),
    })
  }, [sceneId])

  const commitAudio = useCallback(() => {
    if (sceneId === 'meeting') return
    const client = clientRef.current
    if (!client || client.status !== 'open') return
    client.send(CLIENT_EVENTS.inputAudioCommit, undefined)
  }, [sceneId])

  const selectProfile = useCallback((profileId: string) => {
    const client = clientRef.current
    if (!client || client.status !== 'open') return
    client.send(CLIENT_EVENTS.profileSelect, { profile_id: profileId })
  }, [])

  return {
    status,
    live: agent1Runtime.liveApiEnabled,
    sendAudioFrame,
    commitAudio,
    selectProfile,
  }
}

function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}
