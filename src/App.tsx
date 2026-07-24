import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Header } from './features/shell/Header'
import { Footer } from './features/shell/Footer'
import { OrbStage } from './features/orb/OrbStage'
import { LanguageSwitcher } from './features/chat/LanguageSwitcher'
import { MeetingTranscript } from './features/chat/MeetingTranscript'
import { SceneCopy } from './features/chat/SceneCopy'
import { SceneMeta } from './features/chat/SceneMeta'
import { PersonaDrawer } from './features/drawer/PersonaDrawer'
import { TaskDrawer } from './features/drawer/TaskDrawer'
import { FieldCursor } from './features/cursor/FieldCursor'
import { useAsync } from './hooks/useAsync'
import { useAgent1Realtime } from './hooks/useAgent1Realtime'
import { useCustomCursor } from './hooks/useCustomCursor'
import { useEntranceTimeline } from './hooks/useEntranceTimeline'
import { useGestureEngine } from './hooks/useGestureEngine'
import { useMeetingTransition } from './hooks/useMeetingTransition'
import { useMeetingUpload } from './hooks/useMeetingUpload'
import { useMicrophoneInput } from './hooks/useMicrophoneInput'
import { useOrbSync } from './hooks/useOrbSync'
import { useRecordingSoundEffects } from './hooks/useRecordingSoundEffects'
import { useSceneReentrance } from './hooks/useSceneReentrance'
import { useTaskMarkers } from './hooks/useTaskMarkers'
import { readLocalIdentity } from './auth/localIdentity'
import { getLanguages, getPersonas, getScenes, getTasks } from './services'
import { mockLanguages, mockPersonas, mockScenes, mockTasks } from './services/mock'
import type { Language, Persona, Scene, SceneId, Task, VoiceState } from './types'

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const gestureLockRef = useRef(false)
  const lastSceneSwitchAtRef = useRef(Number.NEGATIVE_INFINITY)
  const suppressOrbClickRef = useRef(false)
  const [sceneId, setSceneId] = useState<SceneId>('home')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [personaId, setPersonaId] = useState('joi')
  const [taskOpen, setTaskOpen] = useState(false)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [meetingTextOpen, setMeetingTextOpen] = useState(false)
  const [sourceLanguage, setSourceLanguage] = useState(0)
  const [targetLanguage, setTargetLanguage] = useState(1)

  const scenesQuery = useAsync(getScenes, [])
  const personasQuery = useAsync(getPersonas, [])
  const tasksQuery = useAsync(getTasks, [])
  const languagesQuery = useAsync(getLanguages, [])
  const scenes: Scene[] = scenesQuery.data ?? mockScenes
  const personas: Persona[] = personasQuery.data ?? mockPersonas
  const tasks: Task[] = tasksQuery.data ?? mockTasks
  const languages: Language[] = languagesQuery.data ?? mockLanguages

  const activeScene = scenes.find((scene) => scene.id === sceneId) ?? scenes[1]
  const activePersona = personas.find((persona) => persona.id === personaId) ?? personas[0]
  const activeColor = sceneId === 'personas' ? activePersona.color : activeScene.color

  useEffect(() => {
    if (!personas.some((persona) => persona.id === personaId && persona.selectable)) {
      const fallback = personas.find((persona) => persona.selectable)
      if (fallback) setPersonaId(fallback.id)
    }
  }, [personaId, personas])
  const {
    status: realtimeStatus,
    sendAudioFrame,
    commitAudio,
    selectProfile,
  } = useAgent1Realtime({
    sceneId,
    sourceLanguage: languages[sourceLanguage]?.code ?? 'ZH',
    targetLanguage: languages[targetLanguage]?.code ?? 'EN',
  })

  const { playRecordingStart, playRecordingStop } = useRecordingSoundEffects()
  const meetingUpload = useMeetingUpload({
    ownerUserId: readLocalIdentity()?.user_id ?? null,
  })
  const handlePcmFrame = useCallback(
    (pcm: Int16Array) => {
      if (sceneId === 'meeting') {
        meetingUpload.appendPcm(pcm)
      } else {
        sendAudioFrame(pcm)
      }
    },
    [sceneId, meetingUpload, sendAudioFrame],
  )
  const { microphoneState, recordingSeconds } = useMicrophoneInput({
    active: voiceState === 'listening',
    rootRef,
    onDenied: () => setVoiceState('idle'),
    onPcmFrame: handlePcmFrame,
  })
  useMeetingTransition({ rootRef, sceneId, textOpen: meetingTextOpen })

  useEntranceTimeline(rootRef)
  useSceneReentrance(rootRef, sceneId)
  useCustomCursor(rootRef)
  useOrbSync(voiceState, activeScene.preset)
  useTaskMarkers(taskOpen, tasks)

  const selectScene = useCallback(
    (nextScene: SceneId) => {
      if (voiceState === 'listening') {
        playRecordingStop()
        if (sceneId === 'meeting') {
          void meetingUpload.stop()
        } else {
          commitAudio()
        }
      }
      setSceneId(nextScene)
      setPersonaOpen(nextScene === 'personas')
      setMeetingTextOpen(false)
      setVoiceState('idle')
    },
    [voiceState, sceneId, playRecordingStop, commitAudio, meetingUpload],
  )

  const toggleMeetingText = useCallback((open: boolean) => {
    setMeetingTextOpen(open)
  }, [])

  useGestureEngine({
    rootRef,
    sceneId,
    meetingTextOpen,
    scenes,
    gestureLockRef,
    lastSceneSwitchAtRef,
    onSelectScene: selectScene,
    onToggleMeetingText: toggleMeetingText,
  })

  const cycleLanguage = useCallback(
    (side: 'source' | 'target') => {
      if (side === 'source') {
        setSourceLanguage((current) => {
          for (let offset = 1; offset <= languages.length; offset += 1) {
            const next = (current + offset) % languages.length
            if (next !== targetLanguage && supportsPair(languages[next], languages[targetLanguage])) {
              return next
            }
          }
          return current
        })
        return
      }
      setTargetLanguage((current) => {
        for (let offset = 1; offset <= languages.length; offset += 1) {
          const next = (current + offset) % languages.length
          if (next !== sourceLanguage && supportsPair(languages[sourceLanguage], languages[next])) {
            return next
          }
        }
        return current
      })
    },
    [languages, sourceLanguage, targetLanguage],
  )

  const swapLanguages = useCallback(() => {
    if (!supportsPair(languages[targetLanguage], languages[sourceLanguage])) return
    setSourceLanguage(targetLanguage)
    setTargetLanguage(sourceLanguage)
    window.particleOrb?.trigger('burst', { intensity: 0.42, duration: 0.75 })
  }, [languages, sourceLanguage, targetLanguage])

  const cycleVoiceState = useCallback(() => {
    if (microphoneState === 'requesting') return
    if (voiceState === 'listening') {
      playRecordingStop()
      if (sceneId === 'meeting') {
        void meetingUpload.stop()
      } else {
        commitAudio()
      }
      setVoiceState('idle')
      return
    }
    playRecordingStart()
    if (sceneId === 'meeting') {
      void meetingUpload.start()
    }
    setVoiceState('listening')
  }, [microphoneState, voiceState, sceneId, playRecordingStart, playRecordingStop, commitAudio, meetingUpload])

  const handleOrbActivation = useCallback(() => {
    if (suppressOrbClickRef.current || gestureLockRef.current) return
    cycleVoiceState()
  }, [cycleVoiceState])

  const toggleTaskOpen = useCallback(() => {
    setTaskOpen((open) => !open)
  }, [])

  const closePersonaDrawer = useCallback(() => {
    setPersonaOpen(false)
  }, [])

  const closeTaskDrawer = useCallback(() => {
    setTaskOpen(false)
  }, [])

  const selectPersona = useCallback((id: string) => {
    const persona = personas.find((candidate) => candidate.id === id)
    if (!persona?.selectable) return
    setPersonaId(id)
    selectProfile(id)
    window.particleOrb?.trigger('burst', { intensity: 0.48, duration: 0.8 })
  }, [personas, selectProfile])

  const flashTask = useCallback((taskId: string) => {
    window.particleOrb?.markers.flash(taskId, { intensity: 2.2, duration: 0.8 })
  }, [])

  const recordingTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(
    recordingSeconds % 60,
  ).padStart(2, '0')}`

  return (
    <div
      className="experience-shell"
      data-scene={sceneId}
      data-meeting-view={sceneId === 'meeting' ? (meetingTextOpen ? 'text' : 'orb') : 'inactive'}
      ref={rootRef}
      style={{ '--scene-accent': activeColor } as CSSProperties}
    >
      <a className="skip-link" href="#main-experience">跳到主要内容</a>
      <div className="ambient-field" aria-hidden="true" />
      <div className="grid-field" aria-hidden="true" />
      <div className="grain-field" aria-hidden="true" />

      <Header
        scenes={scenes}
        activeSceneId={sceneId}
        onSelectScene={selectScene}
        realtimeStatus={realtimeStatus}
      />

      <main className="experience-main" id="main-experience">
        {sceneId === 'translate' && (
          <LanguageSwitcher
            sourceLanguage={languages[sourceLanguage]}
            targetLanguage={languages[targetLanguage]}
            onCycleSource={() => cycleLanguage('source')}
            onCycleTarget={() => cycleLanguage('target')}
            onSwap={swapLanguages}
          />
        )}

        {sceneId === 'meeting' && (
          <MeetingTranscript
            open={meetingTextOpen}
            meetingId={meetingUpload.meetingId}
            uploadState={meetingUpload.state}
            errorMessage={meetingUpload.error}
          />
        )}

        <SceneCopy scene={activeScene} />

        <OrbStage
          mode={activeScene.orbMode}
          voiceState={voiceState}
          microphoneState={microphoneState}
          recordingSeconds={recordingSeconds}
          recordingTime={recordingTime}
          onActivate={handleOrbActivation}
          onToggleVoice={cycleVoiceState}
        />

        <SceneMeta
          scene={activeScene}
          personaName={activePersona.name}
          voiceState={voiceState}
        />
      </main>

      <Footer
        sceneId={sceneId}
        taskOpen={taskOpen}
        meetingTextOpen={meetingTextOpen}
        onToggleTask={toggleTaskOpen}
      />

      <PersonaDrawer
        open={personaOpen}
        personas={personas}
        activePersonaId={personaId}
        onSelectPersona={selectPersona}
        onClose={closePersonaDrawer}
      />

      <TaskDrawer
        open={taskOpen}
        tasks={tasks}
        onClose={closeTaskDrawer}
        onFlashTask={flashTask}
      />

      <FieldCursor />
    </div>
  )
}

function supportsPair(source: Language | undefined, target: Language | undefined): boolean {
  if (!source || !target) return false
  return source.supportedTargets.some(
    (targetCode) => targetCode.toLowerCase() === target.code.toLowerCase(),
  )
}
