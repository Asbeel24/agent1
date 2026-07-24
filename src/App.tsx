import { useCallback, useRef, useState, type CSSProperties } from 'react'
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
import { useCustomCursor } from './hooks/useCustomCursor'
import { useEntranceTimeline } from './hooks/useEntranceTimeline'
import { useGestureEngine } from './hooks/useGestureEngine'
import { useMeetingTransition } from './hooks/useMeetingTransition'
import { useMicrophoneInput } from './hooks/useMicrophoneInput'
import { useOrbSync } from './hooks/useOrbSync'
import { useRecordingSoundEffects } from './hooks/useRecordingSoundEffects'
import { useSceneReentrance } from './hooks/useSceneReentrance'
import { useTaskMarkers } from './hooks/useTaskMarkers'
import { getPersonas, getScenes, getTasks, languages } from './services'
import { mockPersonas, mockScenes, mockTasks } from './services/mock'
import type { Persona, Scene, SceneId, Task, VoiceState } from './types'

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
  const scenes: Scene[] = scenesQuery.data ?? mockScenes
  const personas: Persona[] = personasQuery.data ?? mockPersonas
  const tasks: Task[] = tasksQuery.data ?? mockTasks

  const activeScene = scenes.find((scene) => scene.id === sceneId) ?? scenes[1]
  const activePersona = personas.find((persona) => persona.id === personaId) ?? personas[0]
  const activeColor = sceneId === 'personas' ? activePersona.color : activeScene.color

  const { playRecordingStart, playRecordingStop } = useRecordingSoundEffects()
  const { microphoneState, recordingSeconds } = useMicrophoneInput({
    active: voiceState === 'listening',
    rootRef,
    onDenied: () => setVoiceState('idle'),
  })
  useMeetingTransition({ rootRef, sceneId, textOpen: meetingTextOpen })

  useEntranceTimeline(rootRef)
  useSceneReentrance(rootRef, sceneId)
  useCustomCursor(rootRef)
  useOrbSync(voiceState, activeScene.preset)
  useTaskMarkers(taskOpen, tasks)

  const selectScene = useCallback(
    (nextScene: SceneId) => {
      if (voiceState === 'listening') playRecordingStop()
      setSceneId(nextScene)
      setPersonaOpen(nextScene === 'personas')
      setMeetingTextOpen(false)
      setVoiceState('idle')
    },
    [voiceState, playRecordingStop],
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
          let next = (current + 1) % languages.length
          if (next === targetLanguage) next = (next + 1) % languages.length
          return next
        })
        return
      }
      setTargetLanguage((current) => {
        let next = (current + 1) % languages.length
        if (next === sourceLanguage) next = (next + 1) % languages.length
        return next
      })
    },
    [sourceLanguage, targetLanguage],
  )

  const swapLanguages = useCallback(() => {
    setSourceLanguage(targetLanguage)
    setTargetLanguage(sourceLanguage)
    window.particleOrb?.trigger('burst', { intensity: 0.42, duration: 0.75 })
  }, [sourceLanguage, targetLanguage])

  const cycleVoiceState = useCallback(() => {
    if (microphoneState === 'requesting') return
    if (voiceState === 'listening') {
      playRecordingStop()
      setVoiceState('idle')
      return
    }
    playRecordingStart()
    setVoiceState('listening')
  }, [microphoneState, voiceState, playRecordingStart, playRecordingStop])

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
    setPersonaId(id)
    window.particleOrb?.trigger('burst', { intensity: 0.48, duration: 0.8 })
  }, [])

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

        {sceneId === 'meeting' && <MeetingTranscript open={meetingTextOpen} />}

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