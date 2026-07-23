import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { gsap } from 'gsap'
import { ParticleOrb, type OrbMode } from './components/ParticleOrb'

type SceneId = 'translate' | 'home' | 'meeting' | 'personas'
type VoiceState = 'idle' | 'listening' | 'speaking'
type MicrophoneState = 'idle' | 'requesting' | 'active' | 'denied'

type Scene = {
  id: SceneId
  order: string
  label: string
  description: string
  signal: string
  color: string
  orbMode: OrbMode
  preset: 'idle' | 'listening' | 'thinking'
}

const scenes: Scene[] = [
  {
    id: 'translate',
    order: '01',
    label: '翻译',
    description: '双向聆听 · 实时转述',
    signal: 'BILINGUAL FIELD',
    color: '#74c9e8',
    orbMode: 'translate',
    preset: 'listening',
  },
  {
    id: 'home',
    order: '02',
    label: '主场',
    description: '自然对话 · 长期记忆',
    signal: 'PRIMARY PRESENCE',
    color: '#c6c8d9',
    orbMode: 'dialogue',
    preset: 'idle',
  },
  {
    id: 'meeting',
    order: '03',
    label: '会议',
    description: '实时记录 · 任务提取',
    signal: 'COLLECTIVE MEMORY',
    color: '#d9a17d',
    orbMode: 'meeting',
    preset: 'thinking',
  },
  {
    id: 'personas',
    order: '04',
    label: '人格市场',
    description: '人格切换 · 关系延续',
    signal: 'PERSONA EXCHANGE',
    color: '#c2afd2',
    orbMode: 'idle',
    preset: 'idle',
  },
]

const personas = [
  { id: 'joi', name: 'Joi', role: '温和的长期陪伴者', color: '#c6c8d9' },
  { id: 'moss', name: 'Moss', role: '冷静的研究搭档', color: '#79bfd2' },
  { id: 'ember', name: 'Ember', role: '直接的行动顾问', color: '#d49b79' },
  { id: 'violet', name: 'Violet', role: '敏锐的创意伙伴', color: '#b6a1c8' },
]

const tasks = [
  { id: 'market-notes', time: '09:40', title: '整理市场访谈', progress: '06 / 08' },
  { id: 'meeting-brief', time: '14:10', title: '生成周会简报', progress: '进行中' },
  { id: 'memory-review', time: '18:30', title: '回顾今日记忆', progress: '待确认' },
]

const languages = [
  { code: 'ZH', label: '中文' },
  { code: 'EN', label: 'English' },
  { code: 'JA', label: '日本語' },
  { code: 'KO', label: '한국어' },
]

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const gestureLockRef = useRef(false)
  const lastSceneSwitchAtRef = useRef(Number.NEGATIVE_INFINITY)
  const suppressOrbClickRef = useRef(false)
  const [sceneId, setSceneId] = useState<SceneId>('home')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [personaId, setPersonaId] = useState('joi')
  const [taskOpen, setTaskOpen] = useState(false)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [sourceLanguage, setSourceLanguage] = useState(0)
  const [targetLanguage, setTargetLanguage] = useState(1)

  const activeScene = scenes.find((scene) => scene.id === sceneId) ?? scenes[1]
  const activePersona = personas.find((persona) => persona.id === personaId) ?? personas[0]
  const activeColor = sceneId === 'personas' ? activePersona.color : activeScene.color

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const context = gsap.context(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduceMotion) return

      gsap
        .timeline({ defaults: { ease: 'expo.out' } })
        .from('.brand-mark, .system-status', { y: -16, duration: 0.9 })
        .from('.scene-nav-item', { y: -12, stagger: 0.08, duration: 0.8 }, '<0.12')
        .from('.orb-stage', { scale: 0.82, duration: 1.8 }, '<0.05')
        .from('.scene-copy, .scene-meta-row', { y: 28, stagger: 0.08, duration: 1 }, '<0.4')
        .from('.experience-footer', { y: 14, duration: 0.8 }, '<0.3')

      const cursor = root.querySelector<HTMLElement>('.field-cursor')
      if (!cursor || window.matchMedia('(pointer: coarse)').matches) return
      const moveX = gsap.quickTo(cursor, 'x', { duration: 0.14, ease: 'power2.out' })
      const moveY = gsap.quickTo(cursor, 'y', { duration: 0.14, ease: 'power2.out' })
      const orbGrid = root.querySelector<HTMLElement>('.orb-grid')
      const moveGridX = orbGrid
        ? gsap.quickTo(orbGrid, 'x', { duration: 0.9, ease: 'power3.out' })
        : null
      const moveGridY = orbGrid
        ? gsap.quickTo(orbGrid, 'y', { duration: 0.9, ease: 'power3.out' })
        : null
      const moveCursor = (event: PointerEvent) => {
        moveX(event.clientX)
        moveY(event.clientY)
        moveGridX?.((event.clientX / window.innerWidth - 0.5) * 12)
        moveGridY?.((event.clientY / window.innerHeight - 0.5) * 8)
      }
      window.addEventListener('pointermove', moveCursor)
      return () => window.removeEventListener('pointermove', moveCursor)
    }, root)

    return () => context.revert()
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const context = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'expo.out' } })
        .from('.scene-identity, .scene-description', { x: -14, duration: 0.72, stagger: 0.06 })
        .fromTo(
          '.scene-meta-value',
          { y: 8 },
          { y: 0, duration: 0.65, stagger: 0.06 },
          '<0.08',
        )
    }, root)
    return () => context.revert()
  }, [sceneId])

  useEffect(() => {
    const applyScene = () => {
      const api = window.particleOrb
      if (!api) return
      api.setPersona({ color: '#ffffff', transition: 1.1 })
      api.setPreset(activeScene.preset)
      api.trigger('burst', { intensity: 0.34, duration: 0.9 })
    }

    applyScene()
    window.addEventListener('particle-orb:ready', applyScene)
    return () => window.removeEventListener('particle-orb:ready', applyScene)
  }, [activeColor, activeScene.preset])

  useEffect(() => {
    const api = window.particleOrb
    if (!api) return

    if (voiceState === 'idle') {
      api.setAudioLevel(0)
      api.setPreset(activeScene.preset)
      return
    }

    if (voiceState === 'listening') {
      api.setPreset('listening')
      api.setAudioLevel(0.04)
      return
    }

    api.setPreset('speaking')
    api.trigger('burst', { intensity: 0.6, duration: 0.75 })
    const interval = window.setInterval(() => {
      api.setAudioLevel(0.35 + Math.random() * 0.55)
    }, 130)
    return () => {
      window.clearInterval(interval)
      api.setAudioLevel(0)
    }
  }, [voiceState, activeScene.preset])

  useEffect(() => {
    if (voiceState !== 'listening' || microphoneState !== 'active') {
      if (voiceState === 'idle') setRecordingSeconds(0)
      return
    }

    setRecordingSeconds(0)
    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 250)
    return () => window.clearInterval(interval)
  }, [voiceState, microphoneState])

  useEffect(() => {
    if (voiceState !== 'listening') {
      setMicrophoneState((current) => (current === 'denied' ? current : 'idle'))
      return
    }

    let cancelled = false
    let animationFrame = 0
    let stream: MediaStream | null = null
    let audioContext: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null

    const startMicrophone = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicrophoneState('denied')
        setVoiceState('idle')
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
          const orbStage = rootRef.current?.querySelector<HTMLElement>('.orb-stage')
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
        if (!cancelled) {
          setMicrophoneState('denied')
          setVoiceState('idle')
        }
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
      const orbStage = rootRef.current?.querySelector<HTMLElement>('.orb-stage')
      if (orbStage) {
        for (const property of [
          '--mic-scale',
          '--mic-brightness',
          '--mic-opacity',
          '--mic-ring-scale',
          '--mic-glow',
        ]) {
          orbStage.style.removeProperty(property)
        }
      }
      window.particleOrb?.setAudioLevel(0)
    }
  }, [voiceState])

  useEffect(() => {
    if (!taskOpen) return
    const api = window.particleOrb
    if (!api) return

    api.markers.clear()
    const colors = ['#d8d9e4', '#79bfd2', '#d49b79']
    tasks.forEach((task, index) => {
      api.markers.set(task.id, {
        phase: index / tasks.length,
        orbitRadius: 1.28 + index * 0.04,
        tilt: index % 2 ? -0.34 : 0.28,
        color: colors[index],
        size: 12,
        brightness: 1.7,
        speed: 0.18 + index * 0.035,
      })
    })
    api.trigger('burst', { intensity: 0.5, duration: 0.8 })
  }, [taskOpen])

  const selectScene = (nextScene: SceneId) => {
    setSceneId(nextScene)
    setPersonaOpen(nextScene === 'personas')
    setVoiceState('idle')
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let tracking = false
    let moved = false
    let wheelAccumulator = 0
    let wheelResetTimer = 0

    const shouldIgnoreGesture = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest('button, a, .persona-drawer, .task-drawer'))

    const getSlidingElements = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>('.scene-copy, .scene-meta, .language-switcher'),
      )

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || shouldIgnoreGesture(event.target)) return
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      tracking = true
      moved = false
      suppressOrbClickRef.current = false
      root.dataset.dragging = 'true'
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!tracking || event.pointerId !== pointerId) return
      const deltaX = event.clientX - startX
      const deltaY = event.clientY - startY
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        moved = true
        suppressOrbClickRef.current = true
      }
      const slidingElements = getSlidingElements()
      if (slidingElements.length && Math.abs(deltaX) > Math.abs(deltaY)) {
        gsap.set(slidingElements, {
          x: deltaX * 0.52,
          opacity: 1 - Math.min(Math.abs(deltaX) / 1400, 0.18),
        })
      }
      window.particleOrb?.setHorizontalInput(Math.max(-1, Math.min(1, deltaX / 180)))
    }

    const switchScene = (direction: 1 | -1) => {
      if (
        gestureLockRef.current ||
        performance.now() - lastSceneSwitchAtRef.current < 1200
      ) {
        return
      }

      gestureLockRef.current = true
      const switchStartedAt = performance.now()
      lastSceneSwitchAtRef.current = switchStartedAt
      window.setTimeout(() => {
        if (lastSceneSwitchAtRef.current === switchStartedAt) {
          gestureLockRef.current = false
        }
      }, 1600)
      const currentIndex = scenes.findIndex((scene) => scene.id === sceneId)
      const nextScene = scenes[(currentIndex + direction + scenes.length) % scenes.length]
      const outgoingElements = getSlidingElements()

      if (!outgoingElements.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        selectScene(nextScene.id)
        gestureLockRef.current = false
        return
      }

      const exitX = (direction > 0 ? -1 : 1) * Math.min(window.innerWidth * 0.24, 280)
      gsap.to(outgoingElements, {
        x: exitX,
        opacity: 0.18,
        duration: 0.2,
        ease: 'power2.in',
        overwrite: true,
        onComplete: () => {
          selectScene(nextScene.id)
          requestAnimationFrame(() => {
            const incomingElements = getSlidingElements()
            gsap.set(incomingElements, { x: -exitX * 0.72, opacity: 0.15 })
            gsap.to(incomingElements, {
              x: 0,
              opacity: 1,
              duration: 0.28,
              ease: 'power3.out',
              overwrite: true,
              onComplete: () => {
                window.setTimeout(() => {
                  gestureLockRef.current = false
                }, 420)
              },
            })
          })
        },
      })
    }

    const finishGesture = (event: PointerEvent) => {
      if (!tracking || event.pointerId !== pointerId) return

      const deltaX = event.clientX - startX
      const deltaY = event.clientY - startY
      tracking = false
      pointerId = null
      delete root.dataset.dragging
      window.particleOrb?.setHorizontalInput(0)

      if (moved) {
        window.setTimeout(() => {
          suppressOrbClickRef.current = false
        }, 0)
      }

      if (Math.abs(deltaX) < 44 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
        const slidingElements = getSlidingElements()
        if (slidingElements.length) {
          gsap.to(slidingElements, {
            x: 0,
            opacity: 1,
            duration: 0.3,
            ease: 'power3.out',
            overwrite: true,
          })
        }
        return
      }

      switchScene(deltaX < 0 ? 1 : -1)
    }

    const onWheel = (event: WheelEvent) => {
      if (
        Math.abs(event.deltaX) <= Math.abs(event.deltaY) ||
        Math.abs(event.deltaX) < 2
      ) {
        return
      }

      event.preventDefault()
      if (shouldIgnoreGesture(event.target)) return
      if (
        gestureLockRef.current ||
        performance.now() - lastSceneSwitchAtRef.current < 1200
      ) {
        return
      }
      window.clearTimeout(wheelResetTimer)
      wheelAccumulator += event.deltaX
      const slidingElements = getSlidingElements()
      if (slidingElements.length) {
        gsap.to(slidingElements, {
          x: -wheelAccumulator * 0.42,
          opacity: 1 - Math.min(Math.abs(wheelAccumulator) / 900, 0.14),
          duration: 0.12,
          ease: 'power2.out',
          overwrite: true,
        })
      }
      window.particleOrb?.setHorizontalInput(Math.max(-1, Math.min(1, wheelAccumulator / 120)))

      wheelResetTimer = window.setTimeout(() => {
        wheelAccumulator = 0
        window.particleOrb?.setHorizontalInput(0)
        if (slidingElements.length) {
          gsap.to(slidingElements, {
            x: 0,
            opacity: 1,
            duration: 0.28,
            ease: 'power3.out',
            overwrite: true,
          })
        }
      }, 160)

      if (Math.abs(wheelAccumulator) < 64) return
      window.clearTimeout(wheelResetTimer)
      wheelResetTimer = 0
      switchScene(wheelAccumulator > 0 ? 1 : -1)
      wheelAccumulator = 0
      window.particleOrb?.setHorizontalInput(0)
    }

    root.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', finishGesture, true)
    window.addEventListener('pointercancel', finishGesture, true)
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })

    return () => {
      window.clearTimeout(wheelResetTimer)
      root.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', finishGesture, true)
      window.removeEventListener('pointercancel', finishGesture, true)
      window.removeEventListener('wheel', onWheel, true)
      window.particleOrb?.setHorizontalInput(0)
    }
  }, [sceneId])

  const cycleLanguage = (side: 'source' | 'target') => {
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
  }

  const swapLanguages = () => {
    setSourceLanguage(targetLanguage)
    setTargetLanguage(sourceLanguage)
    window.particleOrb?.trigger('burst', { intensity: 0.42, duration: 0.75 })
  }

  const cycleVoiceState = () => {
    if (microphoneState === 'requesting') return
    setVoiceState((current) => {
      if (current === 'listening') return 'speaking'
      return 'listening'
    })
  }

  const handleOrbActivation = () => {
    if (suppressOrbClickRef.current || gestureLockRef.current) return
    cycleVoiceState()
  }

  const recordingTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(
    recordingSeconds % 60,
  ).padStart(2, '0')}`

  const selectPersona = (id: string) => {
    setPersonaId(id)
    window.particleOrb?.trigger('burst', { intensity: 0.48, duration: 0.8 })
  }

  return (
    <div
      className="experience-shell"
      data-scene={sceneId}
      ref={rootRef}
      style={{ '--scene-accent': activeColor } as CSSProperties}
    >
      <a className="skip-link" href="#main-experience">跳到主要内容</a>
      <div className="ambient-field" aria-hidden="true" />
      <div className="grid-field" aria-hidden="true" />
      <div className="grain-field" aria-hidden="true" />

      <header className="experience-header">
        <a className="brand-mark interactive-target" href="/" aria-label="BicaMind 首页">
          <span>BICA</span>
          <span>MIND</span>
        </a>

        <nav className="scene-nav" aria-label="体验场景">
          {scenes.map((scene) => (
            <button
              className="scene-nav-item interactive-target"
              data-active={scene.id === sceneId}
              key={scene.id}
              type="button"
              onClick={() => selectScene(scene.id)}
              aria-current={scene.id === sceneId ? 'page' : undefined}
            >
              <span className="scene-nav-signal" aria-hidden="true">
                <i />
              </span>
              <span data-mobile-label={scene.id === 'personas' ? '人格' : scene.label}>{scene.label}</span>
              <small>{scene.order}</small>
            </button>
          ))}
        </nav>

        <div className="system-status">
          <span className="status-dot" />
          <span>System online</span>
          <small>CN / 16:42</small>
        </div>
      </header>

      <main className="experience-main" id="main-experience">
        {sceneId === 'translate' && (
          <div className="language-switcher" aria-label="翻译语言设置">
            <button
              className="language-option interactive-target"
              type="button"
              onClick={() => cycleLanguage('source')}
              aria-label={`切换源语言，当前为${languages[sourceLanguage].label}`}
            >
              <small>From</small>
              <span>{languages[sourceLanguage].label}</span>
              <em>{languages[sourceLanguage].code}</em>
            </button>
            <button
              className="language-swap interactive-target"
              type="button"
              onClick={swapLanguages}
              aria-label="交换源语言和目标语言"
            >
              <span aria-hidden="true">⇄</span>
            </button>
            <button
              className="language-option interactive-target"
              type="button"
              onClick={() => cycleLanguage('target')}
              aria-label={`切换目标语言，当前为${languages[targetLanguage].label}`}
            >
              <small>To</small>
              <span>{languages[targetLanguage].label}</span>
              <em>{languages[targetLanguage].code}</em>
            </button>
          </div>
        )}

        <section className="scene-copy" aria-live="polite">
          <p className="scene-eyebrow scene-copy-line">{activeScene.signal}</p>
          <div className="scene-identity scene-copy-line">
            <span>{activeScene.order}</span>
            <strong>{activeScene.label}</strong>
          </div>
          <p className="scene-description scene-copy-line">{activeScene.description}</p>
        </section>

        <div
          className="orb-stage interactive-target"
          data-voice-state={voiceState}
          data-microphone-state={microphoneState}
          role="button"
          tabIndex={0}
          aria-label={voiceState === 'idle' ? '点击球体开始录音' : '点击球体切换录音状态'}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('button')) return
            handleOrbActivation()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              handleOrbActivation()
            }
          }}
        >
          <div className="orb-grid" aria-hidden="true">
            <i />
          </div>
          <div className="orb-coordinate orb-coordinate--top" aria-hidden="true">
            <span>Y</span>
            <i />
          </div>
          <div className="orb-coordinate orb-coordinate--side" aria-hidden="true">
            <span>X</span>
            <i />
          </div>
          <ParticleOrb mode={activeScene.orbMode} showControls={false} />
          <button
            className="voice-trigger interactive-target"
            data-state={voiceState}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              cycleVoiceState()
            }}
            aria-label={
              voiceState === 'idle'
                ? '开始录音'
                : voiceState === 'listening'
                  ? '结束录音'
                  : '再次录音'
            }
          >
            <span className="voice-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>
              {microphoneState === 'requesting'
                ? '请求麦克风'
                : microphoneState === 'denied'
                  ? '麦克风未授权'
                  : voiceState === 'idle'
                    ? '开始录音'
                    : voiceState === 'listening'
                      ? '结束录音'
                      : '再次录音'}
            </span>
            {voiceState === 'listening' && microphoneState === 'active' && (
              <time className="voice-time" dateTime={`PT${recordingSeconds}S`} aria-live="polite">
                REC&nbsp; {recordingTime}
              </time>
            )}
          </button>
        </div>

        <aside className="scene-meta" aria-label="当前场景信息">
          <div className="scene-meta-row">
            <span>Field</span>
            <strong className="scene-meta-value">{activeScene.order} / 04</strong>
          </div>
          <div className="scene-meta-row">
            <span>Persona</span>
            <strong className="scene-meta-value">{activePersona.name}</strong>
          </div>
          <div className="scene-meta-row">
            <span>State</span>
            <strong className="scene-meta-value">{voiceState}</strong>
          </div>
        </aside>
      </main>

      <footer className="experience-footer">
        <button
          className="footer-action interactive-target"
          type="button"
          data-active={taskOpen}
          onClick={() => setTaskOpen((open) => !open)}
        >
          <span>任务日历</span>
          <small>{taskOpen ? 'Close' : '03 active'}</small>
        </button>

        <p className="footer-note">
          Drag / swipe to change field · Click to speak
        </p>

        <div className="frame-rate">
          <span>GPU field</span>
          <small>adaptive / live</small>
        </div>
      </footer>

      <aside className="persona-drawer" data-open={personaOpen} aria-hidden={!personaOpen}>
        <div className="drawer-heading">
          <p>Persona exchange</p>
          <button className="interactive-target" type="button" onClick={() => setPersonaOpen(false)}>
            关闭
          </button>
        </div>
        <ol>
          {personas.map((persona, index) => (
            <li key={persona.id}>
              <button
                className="persona-option interactive-target"
                data-active={persona.id === personaId}
                type="button"
                onClick={() => selectPersona(persona.id)}
              >
                <small>0{index + 1}</small>
                <span>{persona.name}</span>
                <em>{persona.role}</em>
                <i style={{ backgroundColor: persona.color }} />
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <section className="task-drawer" data-open={taskOpen} aria-hidden={!taskOpen}>
        <div className="drawer-heading">
          <p>Today · 23 July</p>
          <button className="interactive-target" type="button" onClick={() => setTaskOpen(false)}>
            收起
          </button>
        </div>
        <ol>
          {tasks.map((task, index) => (
            <li key={task.id}>
              <button
                className="task-row interactive-target"
                type="button"
                onClick={() => window.particleOrb?.markers.flash(task.id, { intensity: 2.2, duration: 0.8 })}
              >
                <small>0{index + 1}</small>
                <time>{task.time}</time>
                <span>{task.title}</span>
                <em>{task.progress}</em>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <div className="field-cursor" aria-hidden="true">
        <i />
      </div>
    </div>
  )
}
