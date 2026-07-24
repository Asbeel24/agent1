import {
  useEffect,
  type MutableRefObject,
  type RefObject,
} from 'react'
import { gsap } from 'gsap'
import type { Scene, SceneId } from '../types'

export type UseGestureEngineOptions = {
  rootRef: RefObject<HTMLElement | null>
  sceneId: SceneId
  meetingTextOpen: boolean
  scenes: readonly Scene[]
  gestureLockRef: MutableRefObject<boolean>
  lastSceneSwitchAtRef: MutableRefObject<number>
  onSelectScene: (nextScene: SceneId) => void
  onToggleMeetingText: (open: boolean) => void
}

export function useGestureEngine({
  rootRef,
  sceneId,
  meetingTextOpen,
  scenes,
  gestureLockRef,
  lastSceneSwitchAtRef,
  onSelectScene,
  onToggleMeetingText,
}: UseGestureEngineOptions) {
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
    let verticalWheelAccumulator = 0
    let verticalWheelResetTimer = 0

    const shouldIgnoreGesture = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest('button, a, .persona-drawer, .task-drawer'))

    const getSlidingElements = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          meetingTextOpen
            ? '.meeting-transcript'
            : '.scene-copy, .scene-meta, .language-switcher',
        ),
      )

    const getVerticalElements = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          meetingTextOpen
            ? '.meeting-transcript'
            : '.orb-stage, .scene-copy, .scene-meta',
        ),
      )

    const switchMeetingView = (open: boolean) => {
      if (sceneId !== 'meeting' || open === meetingTextOpen || gestureLockRef.current)
        return
      gestureLockRef.current = true
      onToggleMeetingText(open)
      window.setTimeout(() => {
        gestureLockRef.current = false
      }, 900)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || shouldIgnoreGesture(event.target)) return
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      tracking = true
      moved = false
      root.dataset.dragging = 'true'
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!tracking || event.pointerId !== pointerId) return
      const deltaX = event.clientX - startX
      const deltaY = event.clientY - startY
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        moved = true
      }
      const slidingElements = getSlidingElements()
      const horizontalLocked = sceneId === 'meeting' && meetingTextOpen
      if (
        !horizontalLocked &&
        slidingElements.length &&
        Math.abs(deltaX) > Math.abs(deltaY)
      ) {
        gsap.set(slidingElements, {
          x: deltaX * 0.52,
          opacity: 1 - Math.min(Math.abs(deltaX) / 1400, 0.18),
        })
        window.particleOrb?.setHorizontalInput(Math.max(-1, Math.min(1, deltaX / 180)))
      } else if (sceneId === 'meeting' && Math.abs(deltaY) > Math.abs(deltaX)) {
        const verticalElements = getVerticalElements()
        gsap.set(verticalElements, {
          y: deltaY * 0.22,
          opacity: 1 - Math.min(Math.abs(deltaY) / 620, 0.28),
        })
      }
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
        onSelectScene(nextScene.id)
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
          onSelectScene(nextScene.id)
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

      if (
        sceneId === 'meeting' &&
        Math.abs(deltaY) >= 44 &&
        Math.abs(deltaY) > Math.abs(deltaX) * 1.15
      ) {
        const shouldOpen = deltaY < 0
        if ((shouldOpen && !meetingTextOpen) || (!shouldOpen && meetingTextOpen)) {
          switchMeetingView(shouldOpen)
        } else {
          gsap.to(getVerticalElements(), {
            y: 0,
            opacity: 1,
            duration: 0.36,
            ease: 'power3.out',
            overwrite: true,
          })
        }
        return
      }

      if (
        sceneId === 'meeting' &&
        meetingTextOpen &&
        Math.abs(deltaX) > Math.abs(deltaY)
      ) {
        gsap.to(getSlidingElements(), {
          x: 0,
          opacity: 1,
          duration: 0.28,
          ease: 'power3.out',
          overwrite: true,
        })
        return
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
        sceneId === 'meeting' &&
        meetingTextOpen &&
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ) {
        event.preventDefault()
        wheelAccumulator = 0
        window.particleOrb?.setHorizontalInput(0)
        return
      }

      if (
        sceneId === 'meeting' &&
        Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
        Math.abs(event.deltaY) >= 2
      ) {
        event.preventDefault()
        if (shouldIgnoreGesture(event.target) || gestureLockRef.current) return

        window.clearTimeout(verticalWheelResetTimer)
        verticalWheelAccumulator += event.deltaY
        gsap.to(getVerticalElements(), {
          y: -verticalWheelAccumulator * 0.16,
          opacity: 1 - Math.min(Math.abs(verticalWheelAccumulator) / 540, 0.24),
          duration: 0.12,
          ease: 'power2.out',
          overwrite: true,
        })

        verticalWheelResetTimer = window.setTimeout(() => {
          verticalWheelAccumulator = 0
          gsap.to(getVerticalElements(), {
            y: 0,
            opacity: 1,
            duration: 0.3,
            ease: 'power3.out',
            overwrite: true,
          })
        }, 180)

        if (Math.abs(verticalWheelAccumulator) < 68) return
        window.clearTimeout(verticalWheelResetTimer)
        verticalWheelResetTimer = 0
        const shouldOpen = verticalWheelAccumulator > 0
        verticalWheelAccumulator = 0
        switchMeetingView(shouldOpen)
        return
      }

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
      window.clearTimeout(verticalWheelResetTimer)
      root.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', finishGesture, true)
      window.removeEventListener('pointercancel', finishGesture, true)
      window.removeEventListener('wheel', onWheel, true)
      window.particleOrb?.setHorizontalInput(0)
    }
  }, [
    rootRef,
    meetingTextOpen,
    sceneId,
    scenes,
    gestureLockRef,
    lastSceneSwitchAtRef,
    onSelectScene,
    onToggleMeetingText,
  ])
}